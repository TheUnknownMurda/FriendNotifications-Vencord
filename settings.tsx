/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import { DEFAULT_NOTIFICATION_STRINGS, DEFAULT_USER_CONFIG, NotificationKind, ObservedData, SoundConfig, SoundKey, UserConfig } from "./constants";
import { restartObserver } from "./observer";
import { MessagesSection, SoundsSection, ToolsSection, UsersSection } from "./SettingsSections";

export const settings = definePluginSettings({
    addOnlineCount: {
        type: OptionType.BOOLEAN,
        description: "Adds an online friend counter to the top of the server list (click it to open the timelog)",
        default: true
    },
    showTimestamp: {
        type: OptionType.BOOLEAN,
        description: "Adds the timestamp to notifications",
        default: false
    },
    muteOnDND: {
        type: OptionType.BOOLEAN,
        description: "Does not notify you while you are in Do Not Disturb (changes are still written to the timelog)",
        default: false
    },
    openOnClick: {
        type: OptionType.BOOLEAN,
        description: "Opens the DM (or the voice channel for screenshares) when you click a notification",
        default: false
    },
    checkInterval: {
        type: OptionType.NUMBER,
        description: "Checks the observed users every X seconds (minimum 5)",
        default: 10,
        onChange: () => restartObserver()
    },
    logDateFormat: {
        type: OptionType.STRING,
        description: "Timestamp format for the timelog and notifications (moment.js syntax). Leave empty to use your locale's default",
        placeholder: "e.g. DD/MM/YYYY HH:mm:ss",
        default: ""
    },

    users: {
        type: OptionType.COMPONENT,
        component: UsersSection
    },
    messages: {
        type: OptionType.COMPONENT,
        component: MessagesSection
    },
    sounds: {
        type: OptionType.COMPONENT,
        component: SoundsSection
    },
    tools: {
        type: OptionType.COMPONENT,
        component: ToolsSection
    },

    // Data managed by the custom components above. Hidden from the generic settings UI.
    observed: {
        type: OptionType.CUSTOM,
        default: { friends: {}, strangers: {} } as ObservedData
    },
    defaultUserConfig: {
        type: OptionType.CUSTOM,
        default: { ...DEFAULT_USER_CONFIG } as UserConfig
    },
    notificationStrings: {
        type: OptionType.CUSTOM,
        default: { ...DEFAULT_NOTIFICATION_STRINGS } as Record<NotificationKind, string>
    },
    notificationSounds: {
        type: OptionType.CUSTOM,
        default: {} as Partial<Record<SoundKey, SoundConfig>>
    }
}, {
    checkInterval: {
        // Receives the text typed in the field, not a number
        isValid(value) {
            const seconds = Number(value);
            return (Number.isFinite(seconds) && seconds >= 5) || "Must be a number of at least 5 seconds";
        }
    }
});

/** Effective polling interval in milliseconds */
export function getCheckIntervalMs() {
    const seconds = Number(settings.store.checkInterval);
    return (Number.isFinite(seconds) && seconds >= 5 ? seconds : 10) * 1000;
}
