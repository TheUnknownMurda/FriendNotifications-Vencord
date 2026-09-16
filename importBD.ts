/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

import { NOTIFICATION_KINDS, NotificationKind, NotificationType, SoundChannel, SoundKey, STATUS_KEYS, UserConfig } from "./constants";
import { syncObservedWithRelationships } from "./observer";
import { settings } from "./settings";
import { fetchSoundFromUrl, saveSound, setSoundMuted } from "./sounds";

/** Shape of FriendNotifications.config.json written by the BetterDiscord plugin (BDFDB stores it per account id) */
interface BDUserConfig {
    [key: string]: number | boolean | undefined;
    disabled?: boolean;
    timelog?: boolean;
}

interface BDConfig {
    general?: {
        addOnlineCount?: boolean;
        showTimestamp?: boolean;
        muteOnDND?: boolean;
        openOnClick?: boolean;
    };
    amounts?: {
        checkInterval?: number;
    };
    notificationStrings?: Record<string, string>;
    notificationSounds?: Record<string, { url?: string | null; song?: string | null; mute?: boolean; }>;
    observed?: {
        friends?: Record<string, BDUserConfig>;
        strangers?: Record<string, BDUserConfig>;
    };
    defaultSettings?: BDUserConfig;
}

const isSnowflake = (value: string) => /^\d{15,21}$/.test(value);

function pickAccountConfig(raw: unknown): { config: BDConfig; accountId: string | null; } {
    if (!raw || typeof raw !== "object") throw new Error("This is not a valid config file");

    const data = raw as Record<string, any>;
    if ("observed" in data || "general" in data || "notificationStrings" in data) {
        return { config: data as BDConfig, accountId: null };
    }

    const accounts = Object.keys(data).filter(isSnowflake);
    if (!accounts.length) throw new Error("No FriendNotifications data was found in this file");

    const me = UserStore.getCurrentUser()?.id;
    const accountId = me && accounts.includes(me) ? me : accounts[0];
    return { config: data[accountId] as BDConfig, accountId };
}

function convertUserConfig(bd: BDUserConfig, base: UserConfig): UserConfig {
    const config: UserConfig = { ...base };

    for (const key of STATUS_KEYS) {
        const value = bd[key];
        if (typeof value === "number") {
            config[key] = value === 2 ? NotificationType.DESKTOP : value === 1 ? NotificationType.TOAST : NotificationType.DISABLED;
        } else if (typeof value === "boolean") {
            // very old versions of the BetterDiscord plugin stored booleans
            config[key] = value ? NotificationType.TOAST : NotificationType.DISABLED;
        }
    }
    if (typeof bd.disabled === "boolean") config.disabled = bd.disabled;
    if (typeof bd.timelog === "boolean") config.timelog = bd.timelog;

    return config;
}

function convertUserConfigs(source: Record<string, BDUserConfig> | undefined, base: UserConfig) {
    const result: Record<string, UserConfig> = {};
    for (const [id, bd] of Object.entries(source ?? {})) {
        if (isSnowflake(id) && bd && typeof bd === "object") result[id] = convertUserConfig(bd, base);
    }
    return result;
}

/** Copies a record of configs coming from the settings proxy into plain objects (proxies must never be stored back) */
function plainConfigs(source: Record<string, UserConfig>) {
    const result: Record<string, UserConfig> = {};
    for (const [id, config] of Object.entries(source)) result[id] = { ...config };
    return result;
}

async function importSound(bdKey: string, value: { url?: string | null; song?: string | null; mute?: boolean; }) {
    const match = /^(toast|desktop)(.+)$/.exec(bdKey);
    if (!match || !NOTIFICATION_KINDS.includes(match[2] as NotificationKind)) return "skipped";

    const key: SoundKey = `${match[1] as SoundChannel}-${match[2] as NotificationKind}`;
    if (typeof value.mute === "boolean") setSoundMuted(key, value.mute);

    const source = value.song || value.url;
    if (typeof source !== "string" || !source) return "skipped";

    try {
        const { blob, name } = await fetchSoundFromUrl(source);
        await saveSound(key, blob, source.startsWith("data:") ? `imported-${match[2]}` : name);
        return "imported";
    } catch {
        return "failed";
    }
}

/**
 * Imports a BetterDiscord FriendNotifications config. Existing settings are overwritten by the imported ones,
 * users that are not in the file are kept.
 */
export async function importBetterDiscordConfig(raw: unknown) {
    const { config, accountId } = pickAccountConfig(raw);
    const { store } = settings;
    const summary: string[] = [];

    if (config.general) {
        for (const key of ["addOnlineCount", "showTimestamp", "muteOnDND", "openOnClick"] as const) {
            const value = config.general[key];
            if (typeof value === "boolean") store[key] = value;
        }
        summary.push("general settings");
    }

    const interval = config.amounts?.checkInterval;
    if (typeof interval === "number" && interval >= 5) store.checkInterval = interval;

    if (config.notificationStrings) {
        const strings = { ...store.notificationStrings };
        for (const kind of NOTIFICATION_KINDS) {
            const value = config.notificationStrings[kind];
            if (typeof value === "string" && value.trim()) strings[kind] = value;
        }
        store.notificationStrings = strings;
        summary.push("messages");
    }

    if (config.defaultSettings) {
        store.defaultUserConfig = convertUserConfig(config.defaultSettings, store.defaultUserConfig);
    }

    if (config.observed) {
        const base = { ...store.defaultUserConfig };
        const friends = convertUserConfigs(config.observed.friends, base);
        const strangers = convertUserConfigs(config.observed.strangers, base);

        store.observed = {
            friends: { ...plainConfigs(store.observed.friends), ...friends },
            strangers: { ...plainConfigs(store.observed.strangers), ...strangers }
        };
        summary.push(`${Object.keys(friends).length + Object.keys(strangers).length} users`);
    }

    let imported = 0;
    let failed = 0;
    for (const [bdKey, value] of Object.entries(config.notificationSounds ?? {})) {
        if (!value || typeof value !== "object") continue;
        const result = await importSound(bdKey, value);
        if (result === "imported") imported++;
        else if (result === "failed") failed++;
    }
    if (imported) summary.push(`${imported} sound${imported === 1 ? "" : "s"}`);

    if (UserStore.getCurrentUser()) syncObservedWithRelationships();

    let message = `Imported ${summary.join(", ") || "nothing"}`;
    if (accountId) message += ` (account ${accountId})`;
    if (failed) message += `. ${failed} sound${failed === 1 ? "" : "s"} could not be downloaded, add them again from a file`;
    return message;
}
