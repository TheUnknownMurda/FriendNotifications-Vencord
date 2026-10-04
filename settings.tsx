/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { OptionType } from "@utils/types";
import { React } from "@webpack/common";

import type { Field } from "./constants";
import { openHistory } from "./history";
import { restartAutoRefresh } from "./tracker";
import { cl } from "./ui";

function HistorySection() {
    const { ignored } = settings.use(["ignored"]);

    return (
        <div className={cl("settings-section")}>
            <Paragraph>
                The history is kept across restarts (last 1000 changes). It can also be opened by right-clicking a friend.
            </Paragraph>
            <div className={cl("settings-buttons")}>
                <Button onClick={() => openHistory()}>Open history</Button>
                <Button
                    variant="secondary"
                    disabled={ignored.length === 0}
                    onClick={() => settings.store.ignored = []}
                >
                    Stop ignoring {ignored.length} friend{ignored.length === 1 ? "" : "s"}
                </Button>
            </div>
        </div>
    );
}

export const settings = definePluginSettings({
    history: {
        type: OptionType.COMPONENT,
        component: HistorySection
    },
    notify: {
        type: OptionType.BOOLEAN,
        description: "Shows a notification when a friend changes their profile (changes are always written to the history)",
        default: true
    },
    trackUsername: {
        type: OptionType.BOOLEAN,
        description: "Track username changes",
        default: true
    },
    trackGlobalName: {
        type: OptionType.BOOLEAN,
        description: "Track display name changes",
        default: true
    },
    trackPronouns: {
        type: OptionType.BOOLEAN,
        description: "Track pronoun changes (needs the profile to be loaded, see the README)",
        default: true
    },
    trackBio: {
        type: OptionType.BOOLEAN,
        description: "Track bio changes (needs the profile to be loaded, see the README)",
        default: true
    },
    trackAvatar: {
        type: OptionType.BOOLEAN,
        description: "Track avatar changes",
        default: true
    },
    trackBanner: {
        type: OptionType.BOOLEAN,
        description: "Track banner changes (needs the profile to be loaded, see the README)",
        default: true
    },
    trackColors: {
        type: OptionType.BOOLEAN,
        description: "Track profile color changes (needs the profile to be loaded, see the README)",
        default: true
    },
    autoRefresh: {
        type: OptionType.BOOLEAN,
        description: "Regularly loads your friends' profiles in the background, one at a time, to catch bio, pronoun, banner and color changes. Off by default: this sends extra requests to Discord (see the README)",
        default: false,
        onChange: () => restartAutoRefresh()
    },
    refreshDelay: {
        type: OptionType.NUMBER,
        description: "Seconds to wait between two background profile loads (minimum 60)",
        default: 120,
        onChange: () => restartAutoRefresh()
    },

    // Friends whose changes are ignored, managed from the user context menu
    ignored: {
        type: OptionType.CUSTOM,
        default: [] as string[]
    }
}, {
    refreshDelay: {
        isValid(value) {
            return (Number.isFinite(value) && value >= 60) || "Must be a number of at least 60 seconds";
        }
    }
});

const TRACK_SETTINGS: Record<Field, keyof typeof settings.store> = {
    username: "trackUsername",
    globalName: "trackGlobalName",
    pronouns: "trackPronouns",
    bio: "trackBio",
    avatar: "trackAvatar",
    banner: "trackBanner",
    colors: "trackColors"
};

export function isTracked(field: Field) {
    return settings.store[TRACK_SETTINGS[field]] !== false;
}

export function isIgnored(userId: string) {
    return settings.store.ignored.includes(userId);
}

export function toggleIgnored(userId: string) {
    const { ignored } = settings.store;
    settings.store.ignored = ignored.includes(userId)
        ? ignored.filter(id => id !== userId)
        : [...ignored, userId];
}

/** Delay between two background profile loads, in milliseconds */
export function getRefreshDelayMs() {
    const seconds = Number(settings.store.refreshDelay);
    return (Number.isFinite(seconds) && seconds >= 60 ? seconds : 120) * 1000;
}
