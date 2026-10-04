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

export const FIELD_LABELS: Record<Field, string> = {
    username: "username",
    globalName: "display name",
    pronouns: "pronouns",
    bio: "bio",
    avatar: "avatar",
    banner: "banner",
    colors: "profile colors"
};

/** Fields whose value is an image hash rather than readable text */
export const IMAGE_FIELDS: ReadonlySet<Field> = new Set(["avatar", "banner"]);
