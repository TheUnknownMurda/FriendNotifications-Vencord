/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { runtimeHashMessageKey } from "@utils/intlHash";
import { i18n, moment, React } from "@webpack/common";

import { BaseStatus } from "./constants";
import { settings } from "./settings";

export interface MessageVars {
    user: string;
    nick: string;
    status: string;
    statusOld: string;
    game: string;
    song: string;
    artist: string;
    custom: string;
}

// "$statusOld" must be listed before "$status"
const PLACEHOLDER = /\$(user|nick|statusOld|status|game|song|artist|custom)/g;
// Like the BetterDiscord plugin, quotes around a placeholder are dropped when the value is rendered in bold
const QUOTED_PLACEHOLDER = /'?\$(user|nick|statusOld|status|game|song|artist|custom)'?/g;

export function formatPlain(template: string, vars: MessageVars) {
    return template.replace(PLACEHOLDER, (_, key: keyof MessageVars) => vars[key] ?? "");
}

export function formatRich(template: string, vars: MessageVars): React.ReactNode[] {
    const nodes: React.ReactNode[] = [];
    let last = 0;

    for (const match of template.matchAll(QUOTED_PLACEHOLDER)) {
        const index = match.index!;
        if (index > last) nodes.push(template.slice(last, index));
        nodes.push(<strong key={index}>{vars[match[1] as keyof MessageVars] ?? ""}</strong>);
        last = index + match[0].length;
    }
    if (last < template.length) nodes.push(template.slice(last));

    return nodes;
}

export function formatTimestamp(timestamp: number) {
    const format = settings.store.logDateFormat?.trim();
    if (format) {
        try {
            return moment(timestamp).format(format);
        } catch { /* fall through to the locale default */ }
    }
    return new Date(timestamp).toLocaleString();
}

const STATUS_MESSAGES: Record<BaseStatus, [intlKey: string, fallback: string]> = {
    online: ["STATUS_ONLINE", "Online"],
    idle: ["STATUS_IDLE", "Idle"],
    dnd: ["STATUS_DND", "Do Not Disturb"],
    offline: ["STATUS_OFFLINE", "Offline"],
    streaming: ["STATUS_STREAMING", "Streaming"]
};

/** Localized, lower-cased status name (e.g. "online", "en ligne", ...) */
export function getStatusName(status: BaseStatus) {
    const [intlKey, fallback] = STATUS_MESSAGES[status] ?? STATUS_MESSAGES.offline;
    try {
        const message = i18n.t[runtimeHashMessageKey(intlKey)];
        const text: string = message ? i18n.intl.string(message) : "";
        return (text || fallback).toLowerCase();
    } catch {
        return fallback.toLowerCase();
    }
}
