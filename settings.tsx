/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { DEFAULT_FRIEND_CONFIG, DEFAULT_REFRESH_DELAY, Field, FriendConfig, REFRESH_DELAYS } from "./constants";
import { FriendsSection, HistorySection } from "./SettingsSections";
import { restartAutoRefresh, scheduleScan } from "./tracker";

export const settings = definePluginSettings({
    history: {
        type: OptionType.COMPONENT,
        component: HistorySection
    },
    notify: {
        type: OptionType.BOOLEAN,
        displayName: "Notifications",
        description: "Show a notification when a friend changes their profile. Every change is saved in the history either way.",
        default: true
    },
    headerButton: {
        type: OptionType.BOOLEAN,
        displayName: "Top bar button",
        description: "Show a button at the top of Discord to open the history.",
        default: true
    },
    trackSelf: {
        type: OptionType.BOOLEAN,
        displayName: "Track my own profile",
        description: "Also track your own profile changes. Handy to check that the plugin works: change your display name and a notification shows up.",
        default: false,
        onChange: () => scheduleScan()
    },
    friendList: {
        type: OptionType.COMPONENT,
        component: FriendsSection
    },
    autoRefresh: {
        type: OptionType.BOOLEAN,
        displayName: "Background refresh",
        description: "Load your friends' profiles one at a time in the background, so bio, pronoun, banner and color changes are caught without opening their profile. This sends extra requests to Discord: keep a long delay.",
        default: false,
        onChange: () => restartAutoRefresh()
    },
    refreshDelay: {
        type: OptionType.SELECT,
        displayName: "Refresh delay",
        description: "Time between two background profile loads.",
        options: REFRESH_DELAYS.map(option => ({ ...option, default: option.value === DEFAULT_REFRESH_DELAY })),
        disabled() {
            return !this.store.autoRefresh;
        },
        onChange: () => restartAutoRefresh()
    },

    // Managed by the components above, hidden from the generic settings list
    friends: {
        type: OptionType.CUSTOM,
        default: {} as Record<string, FriendConfig>
    },
    defaultConfig: {
        type: OptionType.CUSTOM,
        default: { ...DEFAULT_FRIEND_CONFIG } as FriendConfig
    },
    /** Time of the newest change shown to the user, for the "new" marker of the top bar button */
    lastSeen: {
        type: OptionType.CUSTOM,
        default: 0
    }
});

/** A friend's own settings, or the default ones if they were never changed */
export function getFriendConfig(userId: string): FriendConfig {
    return settings.store.friends[userId] ?? settings.store.defaultConfig;
}

export function hasOwnConfig(userId: string) {
    return settings.store.friends[userId] != null;
}

export function updateFriendConfig(userId: string, patch: Partial<FriendConfig>) {
    // Replace the whole object so the change is written to disk once
    settings.store.friends[userId] = { ...DEFAULT_FRIEND_CONFIG, ...getFriendConfig(userId), ...patch };
}

export function resetFriendConfig(userId: string) {
    delete settings.store.friends[userId];
}

export function isTracked(userId: string, field: Field) {
    const config = getFriendConfig(userId);
    return !config.disabled && config[field] !== false;
}

export function shouldNotify(userId: string) {
    const config = getFriendConfig(userId);
    return settings.store.notify && !config.disabled && config.notify !== false;
}

/** Delay between two background profile loads, in milliseconds */
export function getRefreshDelayMs() {
    const seconds = Number(settings.store.refreshDelay);
    return (Number.isFinite(seconds) && seconds >= 60 ? seconds : DEFAULT_REFRESH_DELAY) * 1000;
}
