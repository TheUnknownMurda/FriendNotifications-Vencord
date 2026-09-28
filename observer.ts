/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SettingsStore } from "@api/Settings";
import { Logger } from "@utils/Logger";
import type { Activity } from "@vencord/discord-types";
import { ActivityType } from "@vencord/discord-types/enums";
import { ChannelStore, PermissionsBits, PermissionStore, PresenceStore, RelationshipStore, UserStore, VoiceStateStore } from "@webpack/common";

import { BaseStatus, NotificationKind, PLUGIN_NAME, UserConfig } from "./constants";
import { notifyStatusChange } from "./notifications";
import { getCheckIntervalMs, settings } from "./settings";

const logger = new Logger("FriendNotifications");

export interface ActivityInfo {
    name?: string;
    details?: string;
    state?: string;
}

export interface PresenceSnapshot {
    status: BaseStatus;
    /** Only connected from a phone */
    mobile: boolean;
    playing: boolean;
    listening: boolean;
    streaming: boolean;
    /** First non-custom activity */
    activity: ActivityInfo | null;
    /** Custom status text (emoji + text), null when none is set */
    custom: string | null;
    /** Voice channel id the user is screensharing in, if we can see it */
    screensharing: string | null;
}

type ActivityKind = "playing" | "listening" | "streaming";

const ACTIVITY_KINDS: Partial<Record<ActivityType, ActivityKind>> = {
    [ActivityType.PLAYING]: "playing",
    [ActivityType.LISTENING]: "listening",
    [ActivityType.STREAMING]: "streaming"
};

const SPECIAL_KINDS = ["playing", "listening", "streaming", "screensharing"] as const;

/**
 * Presences are not all loaded when the connection opens (friends arrive with READY_SUPPLEMENTAL, guild members
 * even later). Right after a (re)connection, snapshots are refreshed silently for a while instead of reporting
 * every friend that was already online as "just came online".
 */
const WARMUP_MS = 20_000;

const snapshots = new Map<string, PresenceSnapshot>();
let timer: ReturnType<typeof setInterval> | undefined;
let listeningToSettings = false;
let quietUntil = 0;

function pickActivityInfo(activity: Activity, kind: ActivityKind): ActivityInfo {
    // Same as the BetterDiscord plugin: games are identified by their name,
    // songs and streams by their details ("$song" = title, "$artist" = state)
    return kind === "playing"
        ? { name: activity.name }
        : { details: activity.details, state: activity.state };
}

function formatCustomStatus(activity: Activity) {
    return [activity.emoji?.name, activity.state].filter(Boolean).join(" ");
}

function getClientStatus(userId: string): Record<string, unknown> {
    if (typeof PresenceStore.getClientStatus === "function") return PresenceStore.getClientStatus(userId) ?? {};
    return PresenceStore.getState()?.clientStatuses?.[userId] ?? {};
}

function getScreenshareChannel(userId: string) {
    const voiceState = VoiceStateStore.getVoiceStateForUser(userId);
    if (!voiceState?.selfStream || !voiceState.channelId) return null;

    const channel = ChannelStore.getChannel(voiceState.channelId);
    if (!channel) return null;
    if (channel.guild_id && !PermissionStore.can(PermissionsBits.VIEW_CHANNEL, channel)) return null;

    return voiceState.channelId;
}

export function takeSnapshot(userId: string): PresenceSnapshot {
    const activities: Activity[] = PresenceStore.getActivities(userId) ?? [];
    const primary = activities.find(a => a.type !== ActivityType.CUSTOM_STATUS);
    const customStatus = activities.find(a => a.type === ActivityType.CUSTOM_STATUS);
    const kind = primary ? ACTIVITY_KINDS[primary.type] : undefined;

    const rawStatus = PresenceStore.getStatus(userId);
    const status: BaseStatus = kind === "streaming"
        ? "streaming"
        : rawStatus === "online" || rawStatus === "idle" || rawStatus === "dnd" ? rawStatus : "offline";

    const clients = Object.keys(getClientStatus(userId));

    return {
        status,
        mobile: clients.length === 1 && clients[0] === "mobile",
        playing: kind === "playing",
        listening: kind === "listening",
        streaming: kind === "streaming",
        activity: primary && kind ? pickActivityInfo(primary, kind) : null,
        custom: customStatus ? formatCustomStatus(customStatus) : null,
        screensharing: getScreenshareChannel(userId)
    };
}

function sameActivity(a: ActivityInfo | null, b: ActivityInfo | null) {
    return a?.name === b?.name && a?.details === b?.details && a?.state === b?.state;
}

/**
 * Decides whether a change between two snapshots should be reported and with which message.
 * Follows the rules of the BetterDiscord plugin.
 */
export function detectChange(config: UserConfig, prev: PresenceSnapshot, next: PresenceSnapshot): NotificationKind | null {
    const statusKind: NotificationKind = next.status;

    if (!config[statusKind]) {
        // The new status is not observed on its own, but "login" still catches offline -> anything
        return config.login && next.status !== "offline" && prev.status === "offline" ? "login" : null;
    }

    if (config.custom && prev.custom !== next.custom) {
        return next.custom !== null ? "custom" : statusKind;
    }

    for (const special of SPECIAL_KINDS) {
        if (!config[special] || !next[special]) continue;
        // Just started doing it...
        if (prev[special] !== next[special]) return special;
        // ...or, for music, moved on to another song while still listening
        if (special === "listening" && !sameActivity(prev.activity, next.activity)) return special;
    }

    if (config.mobile && prev.mobile !== next.mobile) return statusKind;
    if (next.status === "streaming" && !sameActivity(prev.activity, next.activity)) return statusKind;
    if (prev.status !== next.status) return statusKind;

    return null;
}

function plainCopy(config: UserConfig | undefined): Partial<UserConfig> {
    return config ? { ...config } : {};
}

/**
 * Keeps friends and strangers in sync with the relationship store, like the BetterDiscord plugin did:
 * new friends get the default config, removed friends keep their config as strangers.
 */
export function syncObservedWithRelationships() {
    const me = UserStore.getCurrentUser()?.id;
    const { observed, defaultUserConfig } = settings.store;

    const friendIds = RelationshipStore.getFriendIDs();
    const friends: Record<string, UserConfig> = {};
    const strangers: Record<string, UserConfig> = {};
    let changed = false;

    for (const [id, config] of Object.entries(observed.strangers)) {
        if (id === me) changed = true;
        else strangers[id] = plainCopy(config) as UserConfig;
    }

    for (const id of friendIds) {
        if (id === me) continue;

        const existing = observed.friends[id] ?? strangers[id];
        const config = { ...defaultUserConfig, ...plainCopy(existing) };
        friends[id] = config;

        if (!existing || Object.keys(config).length !== Object.keys(existing).length) changed = true;
        if (strangers[id]) {
            delete strangers[id];
            changed = true;
        }
    }

    for (const [id, config] of Object.entries(observed.friends)) {
        if (friends[id]) continue;
        changed = true;
        if (id !== me) strangers[id] = plainCopy(config) as UserConfig;
    }

    if (changed) {
        observed.friends = friends;
        observed.strangers = strangers;
    }
}

/** All observed users (friends and strangers) except the current user */
export function getObservedUsers(): Record<string, UserConfig> {
    const { observed } = settings.store;
    const users: Record<string, UserConfig> = { ...observed.strangers, ...observed.friends };

    const me = UserStore.getCurrentUser()?.id;
    if (me) delete users[me];

    return users;
}

export function resnapshotAll() {
    snapshots.clear();
    for (const id of Object.keys(getObservedUsers())) {
        snapshots.set(id, takeSnapshot(id));
    }
}

/** Called when Discord delivers the initial presences: take them as the baseline and stay quiet for a moment */
export function onPresencesLoaded() {
    if (!isObserverRunning()) return;
    resnapshotAll();
    quietUntil = Date.now() + WARMUP_MS;
}

function tick() {
    try {
        const users = getObservedUsers();
        const me = UserStore.getCurrentUser();
        const muted = settings.store.muteOnDND && !!me && PresenceStore.getStatus(me.id) === "dnd";
        const quiet = Date.now() < quietUntil;

        for (const [id, config] of Object.entries(users)) {
            const next = takeSnapshot(id);
            const prev = snapshots.get(id);
            snapshots.set(id, next);

            if (!prev || config.disabled || quiet) continue;

            const kind = detectChange(config, prev, next);
            if (!kind) continue;

            const user = UserStore.getUser(id);
            if (!user) continue;

            notifyStatusChange({ user, config, kind, prev, next, muted });
        }
    } catch (e) {
        logger.error("Failed to check the observed users", e);
    }
}

const observedSettingPath = `plugins.${PLUGIN_NAME}.observed`;

function onObservedChanged() {
    // Config edits (new stranger, toggled options, ...) must not produce notifications for old changes
    resnapshotAll();
}

export function stopObserver() {
    if (timer) clearInterval(timer);
    timer = undefined;
    snapshots.clear();

    if (listeningToSettings) {
        SettingsStore.removeChangeListener(observedSettingPath, onObservedChanged);
        listeningToSettings = false;
    }
}

export function restartObserver() {
    stopObserver();

    if (!UserStore.getCurrentUser()) return;

    syncObservedWithRelationships();
    resnapshotAll();
    quietUntil = Date.now() + WARMUP_MS;

    SettingsStore.addChangeListener(observedSettingPath, onObservedChanged);
    listeningToSettings = true;

    timer = setInterval(tick, getCheckIntervalMs());
}

export function isObserverRunning() {
    return timer !== undefined;
}
