/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findComponentByCodeLazy } from "@webpack";
import { React } from "@webpack/common";

import { openHistory, useHistory } from "./history";
import { settings } from "./settings";
import { cl } from "./ui";

// Discord's own top bar button (the one used for the inbox and help buttons)
const HeaderBarIcon = findComponentByCodeLazy(".HEADER_BAR_BADGE_BOTTOM,", 'position:"bottom"');

function HistoryIcon({ hasNew }: { hasNew: boolean; }) {
    return (
        <svg viewBox="0 0 24 24" width={20} height={20} className={cl("header-icon")}>
            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {/* Clock with an arrow going back in time */}
                <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
                <path d="M3.5 3.5v4.5H8" />
                <path d="M12 7.5V12l3 2" />
            </g>
            {hasNew && <circle cx="19.5" cy="4.5" r="4" className={cl("header-dot")} />}
        </svg>
    );
}

export function HeaderButton() {
    const { headerButton, lastSeen } = settings.use(["headerButton", "lastSeen"]);
    const entries = useHistory();

    if (!headerButton) return null;

    const newCount = entries.filter(entry => entry.timestamp > lastSeen).length;
    const tooltip = newCount
        ? `Friend profile changes (${newCount} new)`
        : "Friend profile changes";

    return (
        <HeaderBarIcon
            className={cl("header-button")}
            onClick={() => openHistory()}
            tooltip={tooltip}
            icon={() => <HistoryIcon hasNew={newCount > 0} />}
        />
    );
}
