/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";
import { PresenceStore, RelationshipStore } from "@webpack/common";

import { DATASTORE_PREFIX } from "./constants";
import { settings } from "./settings";

/*
 * Last seen: when each friend was last connected (online, idle or dnd).
 *
 * Unlike the notification observer, which compares snapshots every few seconds, this listens to every presence
 * event Discord receives. Discord batches presence updates: a friend that connects and disconnects within the
 * same batch (half a second online) is still recorded, because the updates are read one by one, in order.
 */

/** Statuses that count as connected */
export type ConnectedStatus = "online" | "idle" | "dnd";
const CONNECTED_STATUSES = new Set<string>(["online", "idle", "dnd"]);

export interface Session {
    start: number;
    /** Missing while the friend is still connected */
    end?: number;
    /** Every status seen during the session */
    statuses: ConnectedStatus[];
    /** Every device seen during the session (desktop, mobile, web...) */
    platforms: string[];
    /** The connection was not seen live (Discord was closed or offline): it happened at `start` or before */
    uncertainStart?: boolean;
    /** The disconnection was not seen live: `end` is the last moment the friend was known to be connected */
    uncertainEnd?: boolean;
}

export interface FriendRecord {
    online: boolean;
    /** Current status while connected, last one seen otherwise */
    status?: ConnectedStatus;
    /** Last moment the friend was known to be connected */
    lastOnline?: number;
    /** Newest first */
    sessions: Session[];
}

const DATA_KEY = `${DATASTORE_PREFIX}lastSeen`;
// Small key written often, so sessions cut by Discord closing (or crashing) end at the right time
const HEARTBEAT_KEY = `${DATASTORE_PREFIX}lastSeenHeartbeat`;
const SINCE_KEY = `${DATASTORE_PREFIX}lastSeenSince`;

const HEARTBEAT_MS = 15_000;
// More than this between two heartbeats means the PC was asleep: nothing was seen meanwhile
const SLEEP_GAP_MS = 3 * 60_000;
// After a sleep Discord reconnects and tells us what changed. If it never does (its connection survived), compare everything
const SLEEP_RECOVERY_MS = 2 * 60_000;
// Seen again this soon after a session cut by a Discord restart or reconnection: it is the same session
const CONTINUE_GAP_MS = 2 * 60_000;
const SAVE_DELAY_MS = 1000;

const logger = new Logger("FriendNotifications");

let records: Record<string, FriendRecord> = {};
let loaded = false;
let loading: Promise<void> | undefined;
// Set when the saved data could not be read: never overwrite it with an empty history
let saveBlocked = false;
let loadError: string | undefined;
let running = false;
/** Presence changes are seen as they happen: Discord is connected and the PC did not just wake up */
let live = true;
let sleptAt = 0;
let trackingSince: number | undefined;
let lastHeartbeat = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let syncTimer: ReturnType<typeof setTimeout> | undefined;
// Events received while the saved data is loading, applied in order once it is loaded
let pending: Array<() => void> = [];

const listeners = new Set<() => void>();

export function subscribeLastSeen(listener: () => void) {
    listeners.add(listener);
    return () => void listeners.delete(listener);
}

function emit() {
    for (const listener of listeners) {
        try {
            listener();
        } catch (e) {
            logger.error("Last seen listener failed", e);
        }
    }
}

export const getLastSeenRecord = (userId: string): FriendRecord | undefined => records[userId];
export const getLastSeenStatus = () => ({ running, loaded, live, trackingSince, error: loadError });

function isConnected(status: unknown): status is ConnectedStatus {
    return typeof status === "string" && CONNECTED_STATUSES.has(status);
}

function getPlatforms(clientStatus: unknown): string[] {
    if (clientStatus == null || typeof clientStatus !== "object") return [];
    return Object.entries(clientStatus)
        .filter(([, status]) => isConnected(status))
        .map(([platform]) => platform);
}

function getClientStatus(userId: string): unknown {
    if (typeof PresenceStore.getClientStatus === "function") return PresenceStore.getClientStatus(userId);
    return PresenceStore.getState()?.clientStatuses?.[userId];
}

/** Adds the missing values, returns whether something was added */
function addUnique<T>(list: T[], values: T[]) {
    let added = false;
    for (const value of values) {
        if (list.includes(value)) continue;
        list.push(value);
        added = true;
    }
    return added;
}

function maxSessions() {
    return Number(settings.store.lastSeenHistorySize) || 100;
}

function save() {
    if (!loaded || saveBlocked) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    DataStore.set(DATA_KEY, records).catch(e => logger.error("Failed to save the last seen data", e));
}

function scheduleSave() {
    if (!loaded || saveTimer) return;
    saveTimer = setTimeout(save, SAVE_DELAY_MS);
}

/** @returns whether something worth saving changed */
function markOnline(userId: string, status: ConnectedStatus, platforms: string[], t: number, uncertainStart: boolean) {
    const record = records[userId] ??= { online: false, sessions: [] };
    const last = record.sessions[0];
    let changed = !record.online || record.status !== status;

    if (record.online && last && last.end == null) {
        changed = addUnique(last.statuses, [status]) || changed;
        changed = addUnique(last.platforms, platforms) || changed;
    } else if (last?.uncertainEnd && last.end != null && t - last.end <= CONTINUE_GAP_MS) {
        // We only lost sight of them for a moment (Discord restart or reconnection): same session
        delete last.end;
        delete last.uncertainEnd;
        addUnique(last.statuses, [status]);
        addUnique(last.platforms, platforms);
        changed = true;
    } else {
        const session: Session = { start: t, statuses: [status], platforms: [...platforms] };
        if (uncertainStart) session.uncertainStart = true;
        record.sessions.unshift(session);
        const max = maxSessions();
        if (record.sessions.length > max) record.sessions.length = max;
        changed = true;
    }

    record.online = true;
    record.status = status;
    record.lastOnline = t;
    return changed;
}

/**
 * @param end last moment the friend was known to be connected
 * @param uncertain the disconnection itself was not seen live
 * @returns whether something changed
 */
function markOffline(userId: string, end: number, uncertain: boolean) {
    const record = records[userId];
    if (!record?.online) return false;

    record.online = false;
    record.lastOnline = end;

    const last = record.sessions[0];
    if (last && last.end == null) {
        last.end = Math.max(end, last.start);
        record.lastOnline = last.end;
        if (uncertain) last.uncertainEnd = true;
    }
    return true;
}

/** Flux PRESENCE_UPDATES: every presence change Discord received, read one by one in order */
export function handlePresenceUpdates(event: any) {
    if (!running) return;

    const t = Date.now();
    // Received while not live: Discord replays what it missed after a reconnection, the real time is unknown
    const replay = !live;
    const updates: any[] = Array.isArray(event?.updates) ? event.updates : [event];

    const apply = () => {
        let changed = false;
        for (const update of updates) {
            const userId = update?.user?.id ?? update?.userId;
            if (typeof userId !== "string" || !RelationshipStore.isFriend(userId)) continue;

            if (isConnected(update.status)) {
                changed = markOnline(userId, update.status, getPlatforms(update.clientStatus), t, replay) || changed;
            } else if (records[userId]?.online) {
                changed = markOffline(userId, replay ? records[userId].lastOnline ?? t : t, replay) || changed;
            }
        }

        if (changed) {
            scheduleSave();
            emit();
        }
    };

    if (loaded) apply();
    else pending.push(apply);
}

/**
 * Compares the friends with the presences Discord currently has. Catches what the events could not tell:
 * friends already connected when Discord starts, and what happened while it was offline.
 * @param afterGap we were not watching just before (startup, reconnection): connections and disconnections
 * that happened meanwhile get an uncertain time
 */
function resync(afterGap: boolean, userIds: string[] = RelationshipStore.getFriendIDs()) {
    if (!loaded) return;

    const t = Date.now();
    let changed = false;

    for (const userId of userIds) {
        const status = PresenceStore.getStatus(userId);
        const record = records[userId];

        if (isConnected(status)) {
            if (afterGap && record?.online && t - (record.lastOnline ?? 0) > CONTINUE_GAP_MS) {
                // Not seen for a while: they may have disconnected and come back meanwhile
                markOffline(userId, record.lastOnline ?? t, true);
            }
            changed = markOnline(userId, status, getPlatforms(getClientStatus(userId)), t, afterGap) || changed;
        } else if (record?.online) {
            changed = markOffline(userId, afterGap ? record.lastOnline ?? t : t, afterGap) || changed;
        }
    }

    if (changed) {
        scheduleSave();
        emit();
    }
}

/** Safety net, called when Discord's presence store changes */
function scheduleResync() {
    if (syncTimer || !live) return;
    syncTimer = setTimeout(() => {
        syncTimer = undefined;
        if (running && live) resync(false);
    }, 1000);
}

function heartbeat() {
    if (!running || !loaded) return;

    const t = Date.now();
    const slept = lastHeartbeat !== 0 && t - lastHeartbeat > SLEEP_GAP_MS;
    lastHeartbeat = t;

    if (slept && live) {
        // The PC was asleep: nothing was seen since the previous heartbeat. Discord should reconnect now
        live = false;
        sleptAt = t;
        emit();
        return;
    }

    if (!live) {
        // Discord's connection survived the sleep, no reconnection will tell us what changed
        if (sleptAt === 0 || t - sleptAt < SLEEP_RECOVERY_MS) return;
        sleptAt = 0;
        live = true;
        resync(true);
        emit();
    }

    for (const record of Object.values(records)) {
        if (record.online) record.lastOnline = t;
    }
    DataStore.set(HEARTBEAT_KEY, t).catch(() => { });
}

/** Flux CONNECTION_OPEN and CONNECTION_OPEN_SUPPLEMENTAL (friends' presences arrive with the latter) */
export function onLastSeenConnectionOpen() {
    if (!running) return;
    const wasLive = live;
    live = true;
    sleptAt = 0;
    if (!loaded) return;

    // A new connection: whoever connected or disconnected while Discord was offline did it at an unknown time
    resync(true);
    heartbeat();
    if (!wasLive) emit();
}

/** Flux CONNECTION_RESUMED: Discord reconnected and replayed everything it missed */
export function onLastSeenConnectionResumed() {
    if (!running) return;
    live = true;
    sleptAt = 0;
    if (!loaded) return;

    resync(false);
    heartbeat();
    emit();
}

/** Flux CONNECTION_CLOSED */
export function onLastSeenConnectionClosed() {
    if (!running) return;
    // Connected friends were seen until now, unless the PC just woke up (the heartbeat checks that)
    if (live) heartbeat();
    live = false;
    sleptAt = 0;
    emit();
}

function isValidRecord(record: any): record is FriendRecord {
    return record != null && typeof record === "object" && Array.isArray(record.sessions);
}

async function load() {
    try {
        const [stored, storedHeartbeat, since] = await Promise.all([
            DataStore.get<Record<string, FriendRecord>>(DATA_KEY),
            DataStore.get<number>(HEARTBEAT_KEY),
            DataStore.get<number>(SINCE_KEY)
        ]);

        if (typeof since === "number") trackingSince = since;
        else if (trackingSince != null) DataStore.set(SINCE_KEY, trackingSince).catch(() => { });

        const heartbeatAt = typeof storedHeartbeat === "number" ? storedHeartbeat : 0;
        const now = Date.now();

        if (stored && typeof stored === "object") {
            for (const [userId, record] of Object.entries(stored)) {
                if (!isValidRecord(record)) continue;
                records[userId] = record;

                if (record.online) {
                    // Discord was closed while they were connected: the session ends at the last heartbeat
                    const end = Math.max(record.lastOnline ?? 0, heartbeatAt) || record.sessions[0]?.start || now;
                    markOffline(userId, Math.min(end, now), true);
                }
            }
        }
    } catch (e) {
        saveBlocked = true;
        loadError = e instanceof Error ? e.message : String(e);
        logger.error("Failed to load the last seen data", e);
    }

    loaded = true;
    const toApply = pending;
    pending = [];

    if (running) {
        for (const apply of toApply) apply();
        resync(true);
        heartbeat();
    }

    save();
    emit();
}

export function startLastSeen() {
    if (running) return;
    running = true;
    live = true;
    sleptAt = 0;
    lastHeartbeat = 0;
    trackingSince ??= Date.now();

    PresenceStore.addChangeListener(scheduleResync);
    heartbeatTimer = setInterval(heartbeat, HEARTBEAT_MS);

    if (loaded) {
        resync(true);
        heartbeat();
    } else {
        loading ??= load();
    }
    emit();
}

export function stopLastSeen() {
    if (!running) return;

    PresenceStore.removeChangeListener(scheduleResync);
    clearInterval(heartbeatTimer);
    clearTimeout(syncTimer);
    heartbeatTimer = syncTimer = undefined;

    if (loaded) {
        if (live) heartbeat();
        // Not watching anymore: open sessions end now, and continue if the plugin is turned back on quickly
        const t = Date.now();
        for (const [userId, record] of Object.entries(records)) {
            if (record.online) markOffline(userId, live ? t : record.lastOnline ?? t, true);
        }
        save();
    }

    running = false;
    emit();
}

export function clearAllLastSeen() {
    records = {};
    trackingSince = Date.now();
    DataStore.set(SINCE_KEY, trackingSince).catch(() => { });
    // Friends connected right now: when they connected is unknown
    if (running && live) resync(true);
    save();
    emit();
}

export function clearLastSeen(userId: string) {
    delete records[userId];
    if (running && live) resync(true, [userId]);
    save();
    emit();
}
