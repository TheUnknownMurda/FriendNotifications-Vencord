/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { openUserProfile } from "@utils/discord";
import { classes } from "@utils/misc";
import type { RenderModalProps, User } from "@vencord/discord-types";
import { Alerts, Modal, openModal, React, RelationshipStore, TextInput, useEffect, useReducer, UserStore, useState, useStateFromStores } from "@webpack/common";

import { formatTimestamp, getStatusName } from "./format";
import { clearAllLastSeen, clearLastSeen, FriendRecord, getLastSeenRecord, getLastSeenStatus, Session, subscribeLastSeen } from "./lastSeen";
import { settings } from "./settings";
import { cl, StatusDot } from "./ui";

// ---------- Formatting ----------

function formatTime(timestamp: number) {
    return new Date(timestamp).toLocaleTimeString();
}

function isSameDay(a: number, b: number) {
    return new Date(a).toDateString() === new Date(b).toDateString();
}

export function formatAgo(timestamp: number, now = Date.now()) {
    const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
    return `on ${new Date(timestamp).toLocaleDateString()}`;
}

export function formatDuration(ms: number) {
    if (ms < 1000) return `${(Math.max(ms, 0) / 1000).toFixed(1)} s`;
    const seconds = Math.round(ms / 1000);
    if (seconds < 60) return `${seconds} s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min${seconds % 60 ? ` ${seconds % 60} s` : ""}`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} h${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
    const days = Math.floor(hours / 24);
    return `${days} d${hours % 24 ? ` ${hours % 24} h` : ""}`;
}

/** "Online now", "Last seen 3 h ago" */
function describe(record: FriendRecord | undefined, now = Date.now()) {
    if (record?.online) return "Online now";
    if (record?.lastOnline == null) return "Not seen yet";
    return `Last seen ${formatAgo(record.lastOnline, now)}`;
}

function getName(userId: string, user?: User) {
    return RelationshipStore.getNickname(userId) || user?.globalName || user?.username || `Unknown user (${userId})`;
}

// ---------- Hooks ----------

// One shared timer refreshes every "x min ago"
const tickListeners = new Set<() => void>();
let tickTimer: ReturnType<typeof setInterval> | undefined;

function useTick() {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        tickListeners.add(forceUpdate);
        tickTimer ??= setInterval(() => tickListeners.forEach(listener => listener()), 30_000);
        return () => {
            tickListeners.delete(forceUpdate);
            if (tickListeners.size === 0) {
                clearInterval(tickTimer);
                tickTimer = undefined;
            }
        };
    }, []);
}

function useLastSeen() {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    useEffect(() => subscribeLastSeen(forceUpdate), []);
}

// ---------- Friends list ----------

function FriendRowLabel({ userId }: { userId: string; }) {
    useLastSeen();
    useTick();
    const { lastSeenFriendsList } = settings.use(["lastSeenFriendsList"]);
    const record = getLastSeenRecord(userId);

    if (!lastSeenFriendsList || record?.online || record?.lastOnline == null) return null;

    return (
        <div className={cl("lastseen-row-label")} title={`Last connected: ${formatTimestamp(record.lastOnline)}`}>
            Seen {formatAgo(record.lastOnline)}
        </div>
    );
}

export function renderFriendRowLabel(userId: unknown) {
    if (typeof userId !== "string") return null;
    return (
        <ErrorBoundary noop key="vc-friendnotif-lastseen">
            <FriendRowLabel userId={userId} />
        </ErrorBoundary>
    );
}

// ---------- Context menu ----------

export function LastSeenMenuLabel({ userId }: { userId: string; }) {
    useLastSeen();
    useTick();
    return <>{describe(getLastSeenRecord(userId))}</>;
}

// ---------- One friend ----------

function SessionRow({ session, now }: { session: Session; now: number; }) {
    const end = session.end ?? now;
    const duration = end - session.start;
    const uncertain = session.uncertainStart || session.uncertainEnd;

    let endText: string;
    if (session.end == null) endText = "now";
    else endText = (session.uncertainEnd ? "~" : "") + (isSameDay(session.start, session.end) ? formatTime(session.end) : formatTimestamp(session.end));

    const details = [
        session.statuses.map(status => getStatusName(status)).join(", "),
        session.platforms.join(", ")
    ].filter(Boolean).join(" · ");

    const notes = [
        session.uncertainStart && "connected at this time or before",
        session.uncertainEnd && "disconnected at this time or later"
    ].filter(Boolean).join(", ");

    return (
        <div className={cl("lastseen-session")}>
            <div className={cl("lastseen-session-statuses")}>
                {session.statuses.map(status => <StatusDot key={status} status={status} />)}
            </div>
            <div className={cl("lastseen-session-main")}>
                <Span size="sm" weight="semibold">
                    {session.uncertainStart ? "~" : ""}{formatTimestamp(session.start)} → {endText}
                </Span>
                <Span size="xs" className={cl("lastseen-muted")}>
                    {details}
                    {notes && ` · ~ ${notes} (your Discord was closed or offline)`}
                </Span>
            </div>
            <span
                className={classes(cl("lastseen-duration"), session.end != null && !uncertain && duration < 60_000 && cl("lastseen-duration-short"))}
                title={uncertain ? "At least this long" : undefined}
            >
                {uncertain ? "≥ " : ""}{formatDuration(duration)}{session.end == null ? " so far" : ""}
            </span>
        </div>
    );
}

function FriendModal({ modalProps, userId }: { modalProps: RenderModalProps; userId: string; }) {
    useLastSeen();
    useTick();
    const user = useStateFromStores([UserStore], () => UserStore.getUser(userId) as User | undefined, [userId]);
    const record = getLastSeenRecord(userId);
    const name = getName(userId, user);
    const now = Date.now();

    let subtitle: string;
    if (record?.online) {
        const current = record.sessions[0];
        subtitle = `Online now (${getStatusName(record.status ?? "online")})`;
        if (current) subtitle += `, connected since ${current.uncertainStart ? "~" : ""}${formatTimestamp(current.start)}`;
    } else if (record?.lastOnline != null) {
        subtitle = `Last connected ${formatAgo(record.lastOnline, now)} (${formatTimestamp(record.lastOnline)})`;
    } else {
        subtitle = "Not seen connected since the recording started";
    }

    return (
        <Modal
            {...modalProps}
            size="md"
            title={name}
            subtitle={subtitle}
            actions={[
                {
                    text: "Clear",
                    variant: "critical-primary",
                    disabled: !record?.sessions.length,
                    onClick: () => Alerts.show({
                        title: "Clear history",
                        body: `Delete everything recorded for ${name}?`,
                        confirmText: "Clear",
                        cancelText: "Cancel",
                        onConfirm: () => clearLastSeen(userId)
                    })
                },
                {
                    text: "Open profile",
                    variant: "secondary",
                    onClick: () => void openUserProfile(userId).catch(() => { })
                }
            ]}
        >
            {record?.sessions.length
                ? (
                    <div className={cl("lastseen-sessions")}>
                        {record.sessions.map(session => <SessionRow key={session.start} session={session} now={now} />)}
                    </div>
                )
                : <Paragraph className={cl("lastseen-empty")}>No connection recorded yet.</Paragraph>}
        </Modal>
    );
}

export function openLastSeen(userId: string) {
    openModal(props => (
        <ErrorBoundary>
            <FriendModal modalProps={props} userId={userId} />
        </ErrorBoundary>
    ));
}

// ---------- Every friend ----------

function sortKey(record: FriendRecord | undefined) {
    if (record?.online) return Infinity;
    return record?.lastOnline ?? -1;
}

function FriendRow({ userId, now }: { userId: string; now: number; }) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(userId) as User | undefined, [userId]);
    const record = getLastSeenRecord(userId);

    return (
        <button type="button" className={cl("lastseen-friend")} onClick={() => openLastSeen(userId)}>
            <span className={cl("lastseen-avatar-wrap")}>
                {user
                    ? <img className={cl("avatar")} src={user.getAvatarURL(undefined, 40, false)} alt="" />
                    : <span className={classes(cl("avatar"), cl("avatar-unknown"))}>?</span>}
                <StatusDot status={record?.online ? record.status ?? "online" : "offline"} className={cl("avatar-status")} />
            </span>
            <span className={cl("name")}>{getName(userId, user)}</span>
            <span
                className={classes(cl("lastseen-friend-seen"), record?.online && cl("lastseen-friend-online"))}
                title={record?.lastOnline != null && !record.online ? formatTimestamp(record.lastOnline) : undefined}
            >
                {describe(record, now)}
            </span>
        </button>
    );
}

function AllFriendsModal({ modalProps }: { modalProps: RenderModalProps; }) {
    useLastSeen();
    useTick();
    const [query, setQuery] = useState("");
    const friendIds = useStateFromStores([RelationshipStore], () => RelationshipStore.getFriendIDs());
    const { trackingSince } = getLastSeenStatus();
    const now = Date.now();

    const search = query.trim().toLowerCase();
    const ids = friendIds
        .filter(id => {
            if (!search) return true;
            const user = UserStore.getUser(id) as User | undefined;
            return getName(id, user).toLowerCase().includes(search) || !!user?.username.toLowerCase().includes(search);
        })
        .sort((a, b) => sortKey(getLastSeenRecord(b)) - sortKey(getLastSeenRecord(a)));

    return (
        <Modal
            {...modalProps}
            size="md"
            title="Last seen"
            subtitle={trackingSince ? `Recording since ${formatTimestamp(trackingSince)}` : undefined}
            actions={[{
                text: "Clear everything",
                variant: "critical-primary",
                onClick: () => Alerts.show({
                    title: "Clear everything",
                    body: "Delete everything recorded for every friend?",
                    confirmText: "Clear",
                    cancelText: "Cancel",
                    onConfirm: clearAllLastSeen
                })
            }]}
        >
            <div className={cl("lastseen-all")}>
                <TextInput placeholder="Search a friend" value={query} onChange={setQuery} autoFocus />
                <div className={cl("lastseen-friends")}>
                    {ids.map(id => <FriendRow key={id} userId={id} now={now} />)}
                    {ids.length === 0 && <Paragraph className={cl("lastseen-empty")}>No friend found.</Paragraph>}
                </div>
            </div>
        </Modal>
    );
}

export function openLastSeenList() {
    openModal(props => (
        <ErrorBoundary>
            <AllFriendsModal modalProps={props} />
        </ErrorBoundary>
    ));
}

// ---------- Settings ----------

export function LastSeenTools() {
    useLastSeen();
    const status = getLastSeenStatus();

    let text: string;
    let ok = false;
    if (status.error) text = `The saved data could not be read: ${status.error}`;
    else if (!status.running) text = "Not recording, the plugin is off.";
    else if (!status.loaded) text = "Starting...";
    else if (!status.live) text = "Paused while Discord reconnects.";
    else {
        ok = true;
        text = `Recording${status.trackingSince ? ` since ${formatTimestamp(status.trackingSince)}` : ""}.`;
    }

    return (
        <>
            <HeadingTertiary>Last seen</HeadingTertiary>
            <Paragraph>
                When each friend was last connected (online, idle or do not disturb), recorded live, even if they were
                only online for half a second. Also shown in the friends list and when you right-click a friend.
            </Paragraph>
            <div className={cl("lastseen-status")}>
                <StatusDot status={ok ? "online" : "offline"} />
                <Span size="sm">{text}</Span>
            </div>
            <div className={cl("tools-buttons")}>
                <Button onClick={openLastSeenList}>Open last seen</Button>
            </div>
        </>
    );
}
