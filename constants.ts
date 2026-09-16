/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const enum NotificationType {
    DISABLED = 0,
    TOAST = 1,
    DESKTOP = 2
}

/** Per-user option columns, in display order (same set as the BetterDiscord plugin) */
export const STATUS_KEYS = [
    "online",
    "idle",
    "dnd",
    "playing",
    "listening",
    "streaming",
    "screensharing",
    "offline",
    "login",
    "mobile",
    "custom"
] as const;
export type StatusKey = typeof STATUS_KEYS[number];

/** Kinds of change that have their own message template and sound. "mobile" changes reuse the status message. */
export const NOTIFICATION_KINDS = [
    "online",
    "idle",
    "dnd",
    "playing",
    "listening",
    "streaming",
    "screensharing",
    "offline",
    "login",
    "custom"
] as const;
export type NotificationKind = typeof NOTIFICATION_KINDS[number];

export type BaseStatus = "online" | "idle" | "dnd" | "offline" | "streaming";

export type UserConfig = Record<StatusKey, NotificationType> & {
    /** Completely skip this user */
    disabled: boolean;
    /** Whether changes of this user are written to the timelog */
    timelog: boolean;
};

export type ObservedType = "friends" | "strangers";

export interface ObservedData {
    friends: Record<string, UserConfig>;
    strangers: Record<string, UserConfig>;
}

export type SoundChannel = "toast" | "desktop";
export type SoundKey = `${SoundChannel}-${NotificationKind}`;

export interface SoundConfig {
    /** Display name of the stored file, null when no custom sound is set */
    name: string | null;
    mute: boolean;
}

export const DEFAULT_USER_CONFIG: UserConfig = {
    online: NotificationType.TOAST,
    idle: NotificationType.DISABLED,
    dnd: NotificationType.DISABLED,
    playing: NotificationType.DISABLED,
    listening: NotificationType.DISABLED,
    streaming: NotificationType.DISABLED,
    screensharing: NotificationType.DISABLED,
    offline: NotificationType.TOAST,
    login: NotificationType.DISABLED,
    mobile: NotificationType.DISABLED,
    custom: NotificationType.DISABLED,
    disabled: false,
    timelog: true
};

export const DEFAULT_NOTIFICATION_STRINGS: Record<NotificationKind, string> = {
    online: "$user changed status to '$status'",
    idle: "$user changed status to '$status'",
    dnd: "$user changed status to '$status'",
    playing: "$user started playing '$game'",
    listening: "$user started listening to '$song'",
    streaming: "$user started streaming '$game'",
    screensharing: "$user started screensharing",
    offline: "$user changed status to '$status'",
    login: "$user just logged in '$status'",
    custom: "$user changed status to '$custom'"
};

export const STATUS_COLUMN_LABELS: Record<StatusKey | "timelog", { short: string; title: string; }> = {
    online: { short: "On", title: "Online" },
    idle: { short: "Idle", title: "Idle" },
    dnd: { short: "DnD", title: "Do Not Disturb" },
    playing: { short: "Play", title: "Started playing a game" },
    listening: { short: "Listen", title: "Started listening (e.g. Spotify)" },
    streaming: { short: "Stream", title: "Started streaming (Twitch, YouTube, ...)" },
    screensharing: { short: "Screen", title: "Started screensharing in a voice channel you can see" },
    offline: { short: "Off", title: "Offline" },
    login: { short: "Login", title: "Went from offline to any status that is not observed on its own" },
    mobile: { short: "Mobile", title: "Switched between mobile-only and other clients" },
    custom: { short: "Custom", title: "Changed their custom status" },
    timelog: { short: "Log", title: "Write changes of this user to the timelog" }
};

export const STATUS_COLORS: Record<BaseStatus, string> = {
    online: "#23a55a",
    idle: "#f0b232",
    dnd: "#f23f43",
    offline: "#80848e",
    streaming: "#593695"
};

export const PLUGIN_NAME = "FriendNotifications";
export const DATASTORE_PREFIX = "FriendNotifications:";
