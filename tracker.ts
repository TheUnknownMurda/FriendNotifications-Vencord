/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { showNotification } from "@api/Notifications";
import { Logger } from "@utils/Logger";
import type { User } from "@vencord/discord-types";
import { Constants, FluxDispatcher, RelationshipStore, RestAPI, UserProfileStore, UserStore } from "@webpack/common";

import { DATASTORE_PREFIX, Field, FIELD_LABELS, FIELDS, IMAGE_FIELDS, PLUGIN_NAME, Snapshot } from "./constants";
import { addHistoryEntries, HistoryEntry, openHistory } from "./history";
import { getRefreshDelayMs, isIgnored, isTracked, settings } from "./settings";
import { getImageUrl, truncate } from "./ui";

const logger = new Logger(PLUGIN_NAME);

const SNAPSHOTS_KEY = `${DATASTORE_PREFIX}snapshots`;
/** Several store updates usually arrive at once, compare the profiles at most once per second */
const SCAN_DELAY = 1000;
/** Pause of the background refresh after Discord answered "too many requests" without saying how long to wait */
const RATE_LIMIT_PAUSE = 10 * 60 * 1000;

// Last known profile of every friend, kept across restarts so changes made while Discord was closed are noticed too
let snapshots: Record<string, Snapshot> = {};
let snapshotsLoaded = false;
let running = false;
let scanTimer: ReturnType<typeof setTimeout> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const hex = (color: number) => "#" + color.toString(16).padStart(6, "0");

/** Reads what Discord currently knows about a friend's profile. Fields Discord did not load are left out. */
function readSnapshot(userId: string): Snapshot {
    const snapshot: Snapshot = {};

    // Basic user data: Discord keeps it up to date live (friend list, presences, servers in common)
    const user = UserStore.getUser(userId);
    if (user) {
        if (typeof user.username === "string") snapshot.username = user.username;
        if (user.globalName !== undefined) snapshot.globalName = user.globalName ?? "";
        if (user.avatar !== undefined) snapshot.avatar = user.avatar ?? "";
        if (user.banner !== undefined) snapshot.banner = user.banner ?? "";
    }

    // Full profile: only present once the profile was loaded (opened by you, or by the background refresh)
    const profile = UserProfileStore.getUserProfile(userId);
    if (profile) {
        snapshot.bio = profile.bio ?? "";
        snapshot.pronouns = profile.pronouns ?? "";
        if (profile.banner !== undefined) snapshot.banner = profile.banner ?? "";
        snapshot.colors = profile.themeColors?.length
            ? profile.themeColors.map(hex).join(" ")
            : profile.accentColor != null ? hex(profile.accentColor) : "";
    }

    return snapshot;
}

interface Change {
    field: Field;
    oldValue: string;
    newValue: string;
}

function describeChange({ field, newValue }: Change) {
    const label = FIELD_LABELS[field];
    if (!newValue && field !== "avatar") return `removed their ${label}`;
    if (IMAGE_FIELDS.has(field) || field === "colors") return `changed their ${label}`;
    return `changed their ${label}: ${truncate(newValue, 120)}`;
}

function notify(user: User, name: string, avatar: string, changes: Change[]) {
    const body = changes.length === 1
        ? describeChange(changes[0])
        : `updated their profile: ${changes.map(c => FIELD_LABELS[c.field]).join(", ")}`;

    // Show the new picture when the avatar or the banner changed
    const image = changes.find(c => c.field === "banner" && c.newValue) ?? changes.find(c => c.field === "avatar");

    showNotification({
        title: name,
        body,
        icon: avatar,
        image: image && getImageUrl(image.field, user.id, image.newValue),
        onClick: () => openHistory(user.id)
    });
}

/** Above this many friends changed at once (e.g. after Discord was closed for a while), one summary notification is shown */
const MAX_NOTIFICATIONS_PER_SCAN = 3;

function report(changed: [userId: string, changes: Change[]][]) {
    const timestamp = Date.now();
    const entries: HistoryEntry[] = [];
    const toNotify: [User, string, string, Change[]][] = [];

    for (const [userId, changes] of changed) {
        const user = UserStore.getUser(userId);
        if (!user) continue;

        const name = RelationshipStore.getNickname(userId) || user.globalName || user.username;
        const avatar = user.getAvatarURL(undefined, 64, false);
        entries.push(...changes.map((change): HistoryEntry => ({ userId, name, avatar, timestamp, ...change })));
        toNotify.push([user, name, avatar, changes]);
    }

    addHistoryEntries(entries);
    if (!settings.store.notify || !toNotify.length) return;

    if (toNotify.length > MAX_NOTIFICATIONS_PER_SCAN) {
        showNotification({
            title: "Friend profile changes",
            body: `${toNotify.length} friends updated their profile: ${toNotify.map(([, name]) => name).join(", ")}`,
            onClick: () => openHistory()
        });
    } else {
        for (const args of toNotify) notify(...args);
    }
}

function saveSnapshots() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
        saveTimer = null;
        DataStore.set(SNAPSHOTS_KEY, snapshots).catch(e => logger.error("Failed to save the profile snapshots", e));
    }, 5000);
}

function scan() {
    scanTimer = null;
    if (!running || !snapshotsLoaded) return;

    let dirty = false;
    const changed: [string, Change[]][] = [];
    for (const userId of RelationshipStore.getFriendIDs()) {
        const current = readSnapshot(userId);
        const previous = snapshots[userId];
        const changes: Change[] = [];
        let updated = false;

        for (const field of FIELDS) {
            const newValue = current[field];
            if (newValue === undefined) continue;

            const oldValue = previous?.[field];
            if (oldValue === newValue) continue;

            updated = true;
            // The first value we ever see is only remembered, it is not a change
            if (oldValue !== undefined && isTracked(field)) changes.push({ field, oldValue, newValue });
        }

        if (!updated) continue;
        snapshots[userId] = { ...previous, ...current };
        dirty = true;
        if (changes.length && !isIgnored(userId)) changed.push([userId, changes]);
    }

    if (dirty) saveSnapshots();
    if (changed.length) report(changed);
}

/** Asks for a comparison of every friend's profile with the last known one */
export function scheduleScan() {
    if (!running || scanTimer) return;
    scanTimer = setTimeout(scan, SCAN_DELAY);
}

// ---- Optional background refresh of the full profiles ----

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshQueue: string[] = [];

function nextFriendToRefresh() {
    if (!refreshQueue.length) {
        refreshQueue = RelationshipStore.getFriendIDs().filter(id => !isIgnored(id));
    }
    return refreshQueue.shift();
}

/** Loads a friend's full profile like opening their profile would, even if Discord has it cached */
async function refreshProfile(userId: string) {
    FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_START", userId });

    const { body } = await RestAPI.get({
        url: Constants.Endpoints.USER_PROFILE(userId),
        query: {
            with_mutual_guilds: false,
            with_mutual_friends_count: false
        },
        oldFormErrors: true
    });

    FluxDispatcher.dispatch({ type: "USER_UPDATE", user: body.user });
    await FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_SUCCESS", userProfile: body });
}

function scheduleRefresh(delay: number) {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refreshTick, delay);
}

async function refreshTick() {
    refreshTimer = null;
    if (!running || !settings.store.autoRefresh) return;

    let delay = getRefreshDelayMs();
    const userId = nextFriendToRefresh();

    if (userId) {
        try {
            await refreshProfile(userId);
        } catch (e: any) {
            if (e?.status === 429) {
                const retryAfter = Number(e.body?.retry_after) * 1000;
                delay = Math.max(delay, Number.isFinite(retryAfter) ? retryAfter * 2 : RATE_LIMIT_PAUSE);
                logger.warn(`Discord asked to slow down, background refresh paused for ${Math.round(delay / 1000)}s`);
            } else {
                // The friend may have been removed in the meantime, just move on to the next one
                logger.debug("Failed to load a friend's profile", userId, e);
            }
            FluxDispatcher.dispatch({ type: "USER_PROFILE_FETCH_FAILURE", userId });
        }
    }

    if (running && settings.store.autoRefresh && !refreshTimer) scheduleRefresh(delay);
}

export function restartAutoRefresh() {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = null;
    if (running && settings.store.autoRefresh) scheduleRefresh(getRefreshDelayMs());
}

// ---- Lifecycle ----

const onStoreChange = () => scheduleScan();
const STORES = [UserStore, UserProfileStore, RelationshipStore];

export async function startTracker() {
    running = true;

    try {
        const stored = await DataStore.get<Record<string, Snapshot>>(SNAPSHOTS_KEY);
        if (stored && typeof stored === "object") snapshots = { ...stored, ...snapshots };
    } catch (e) {
        logger.error("Failed to load the profile snapshots", e);
    }
    snapshotsLoaded = true;
    if (!running) return;

    for (const store of STORES) store.addChangeListener(onStoreChange);
    scheduleScan();
    restartAutoRefresh();
}

export function stopTracker() {
    running = false;
    for (const store of STORES) store.removeChangeListener(onStoreChange);

    if (scanTimer) clearTimeout(scanTimer);
    if (refreshTimer) clearTimeout(refreshTimer);
    scanTimer = refreshTimer = null;
    refreshQueue = [];

    // Save right away what was waiting to be saved
    if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
        if (snapshotsLoaded) DataStore.set(SNAPSHOTS_KEY, snapshots).catch(e => logger.error("Failed to save the profile snapshots", e));
    }
}
