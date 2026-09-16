/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { requestPermission, showNotification } from "@api/Notifications";
import { openPrivateChannel } from "@utils/discord";
import { Logger } from "@utils/Logger";
import type { User } from "@vencord/discord-types";
import { ChannelRouter, React, RelationshipStore } from "@webpack/common";

import { DEFAULT_NOTIFICATION_STRINGS, NotificationKind, NotificationType, SoundKey, STATUS_COLORS, UserConfig } from "./constants";
import { formatPlain, formatRich, formatTimestamp, getStatusName, MessageVars } from "./format";
import type { PresenceSnapshot } from "./observer";
import { settings } from "./settings";
import { getSoundConfig, playSound } from "./sounds";
import { addTimelogEntry, TimelogEntry } from "./timelog";
import { cl, StatusDot } from "./ui";

const logger = new Logger("FriendNotifications");

export interface StatusChange {
    user: User;
    config: UserConfig;
    kind: NotificationKind;
    prev: PresenceSnapshot;
    next: PresenceSnapshot;
    /** True while the current user is in DnD and "muteOnDND" is enabled */
    muted: boolean;
}

function NotificationBody({ entry }: { entry: TimelogEntry; }) {
    return (
        <div className={cl("toast")}>
            <div className={cl("toast-text")}>
                <span>{formatRich(entry.template, entry.vars)}</span>
                <StatusDot status={entry.status} mobile={entry.mobile} className={cl("toast-status")} />
            </div>
            {settings.store.showTimestamp && (
                <div className={cl("toast-time")}>{formatTimestamp(entry.timestamp)}</div>
            )}
        </div>
    );
}

function plainMessage(entry: TimelogEntry) {
    return formatPlain(entry.template, entry.vars) + (entry.mobile ? " (mobile)" : "");
}

function openTarget(userId: string, voiceChannelId: string | null) {
    try {
        if (voiceChannelId) ChannelRouter.transitionToChannel(voiceChannelId);
        else openPrivateChannel(userId);
    } catch (e) {
        logger.error("Failed to open the channel from a notification", e);
    }
}

function sendToast(entry: TimelogEntry, kind: NotificationKind, onClick?: () => void) {
    const soundKey: SoundKey = `toast-${kind}`;
    void playSound(soundKey);

    // Position, timeout and "native vs in-app" follow Vencord's own notification settings
    showNotification({
        title: entry.name,
        body: plainMessage(entry) + (settings.store.showTimestamp ? ` (${formatTimestamp(entry.timestamp)})` : ""),
        richBody: <NotificationBody entry={entry} />,
        icon: entry.avatar,
        color: STATUS_COLORS[entry.status],
        onClick,
        dismissOnClick: true
    });
}

async function sendDesktop(entry: TimelogEntry, kind: NotificationKind, onClick?: () => void) {
    if (typeof Notification === "undefined" || !(await requestPermission())) {
        // Desktop notifications are unavailable (e.g. permission denied): fall back to the in-app one
        sendToast(entry, kind, onClick);
        return;
    }

    const soundKey: SoundKey = `desktop-${kind}`;
    const sound = getSoundConfig(soundKey);

    const body = [
        plainMessage(entry),
        settings.store.showTimestamp && formatTimestamp(entry.timestamp)
    ].filter(Boolean).join("\n\n");

    const notification = new Notification(entry.name, {
        body,
        icon: entry.avatar,
        // Silence the system sound when muted or when a custom sound replaces it
        silent: sound.mute || !!sound.name
    });
    notification.onclick = onClick ?? null;

    void playSound(soundKey);
}

export function notifyStatusChange({ user, config, kind, prev, next, muted }: StatusChange) {
    const name = user.globalName || user.username;
    const template = settings.store.notificationStrings[kind] || DEFAULT_NOTIFICATION_STRINGS[kind];
    const nickname = RelationshipStore.getNickname(user.id);
    const { activity } = next;

    const vars: MessageVars = {
        user: name,
        // $nick falls back to $user only when the template does not already show the user
        nick: nickname || (template.includes("$user") ? "" : name),
        status: getStatusName(next.status),
        statusOld: getStatusName(prev.status),
        game: activity?.name || activity?.details || "",
        song: activity?.name || activity?.details || "",
        artist: activity?.state || "",
        custom: next.custom ?? ""
    };

    const entry: TimelogEntry = {
        userId: user.id,
        name,
        avatar: user.getAvatarURL(undefined, 40, false),
        status: next.status,
        mobile: next.mobile,
        timestamp: Date.now(),
        template,
        vars
    };

    if (config.timelog !== false) addTimelogEntry(entry);
    if (muted) return;

    const onClick = settings.store.openOnClick
        ? () => openTarget(user.id, kind === "screensharing" ? next.screensharing : null)
        : undefined;

    if (config[kind] === NotificationType.DESKTOP) void sendDesktop(entry, kind, onClick);
    else sendToast(entry, kind, onClick);
}
