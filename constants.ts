/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const PLUGIN_NAME = "FriendsRecentProfileUpdate";
export const DATASTORE_PREFIX = `${PLUGIN_NAME}_`;

export const FIELDS = ["username", "globalName", "pronouns", "bio", "avatar", "banner", "colors"] as const;
export type Field = typeof FIELDS[number];

/**
 * Last known value of each profile field of a friend.
 * An empty string means "not set", a missing key means "never seen" (Discord did not give it to us yet).
 */
export type Snapshot = Partial<Record<Field, string>>;

/** Lower case, used in sentences ("changed their display name") */
export const FIELD_LABELS: Record<Field, string> = {
    username: "username",
    globalName: "display name",
    pronouns: "pronouns",
    bio: "bio",
    avatar: "avatar",
    banner: "banner",
    colors: "profile colors"
};

/** Used for menu entries and column headers */
export const FIELD_TITLES: Record<Field, string> = {
    username: "Username",
    globalName: "Display name",
    pronouns: "Pronouns",
    bio: "Bio",
    avatar: "Avatar",
    banner: "Banner",
    colors: "Profile colors"
};

/** Fields Discord only sends with the full profile (when it is opened, or loaded by the background refresh) */
export const PROFILE_FIELDS: ReadonlySet<Field> = new Set(["pronouns", "bio", "banner", "colors"]);

/** Fields whose value is an image hash rather than readable text */
export const IMAGE_FIELDS: ReadonlySet<Field> = new Set(["avatar", "banner"]);

/** What is tracked for one friend */
export type FriendConfig = Record<Field, boolean> & {
    /** Show a notification (otherwise the changes only go to the history) */
    notify: boolean;
    /** Nothing is tracked for this friend */
    disabled?: boolean;
};

export const DEFAULT_FRIEND_CONFIG: FriendConfig = {
    notify: true,
    username: true,
    globalName: true,
    pronouns: true,
    bio: true,
    avatar: true,
    banner: true,
    colors: true
};

export const REFRESH_DELAYS = [
    { label: "Every minute", value: 60 },
    { label: "Every 2 minutes", value: 120 },
    { label: "Every 5 minutes", value: 300 },
    { label: "Every 10 minutes", value: 600 },
    { label: "Every 30 minutes", value: 1800 },
    { label: "Every hour", value: 3600 }
];
export const DEFAULT_REFRESH_DELAY = 120;
