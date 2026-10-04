/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { Button } from "@components/Button";
import { ExpandableSection } from "@components/ExpandableCard";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { classes } from "@utils/misc";
import { React, RelationshipStore, useEffect, useReducer, UserStore, useStateFromStores } from "@webpack/common";

import { DefaultRow, FriendList } from "./FriendList";
import { openHistory, useHistory } from "./history";
import { settings } from "./settings";
import { getStatus, subscribeStatus } from "./tracker";
import { cl } from "./ui";

function SectionTitle({ children }: { children: React.ReactNode; }) {
    return <Span weight="semibold" size="md">{children}</Span>;
}

function useTrackerStatus() {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    useEffect(() => subscribeStatus(forceUpdate), []);
    return getStatus();
}

const formatTime = (timestamp: number) => new Date(timestamp).toLocaleTimeString();

function sendTestNotification() {
    const me = UserStore.getCurrentUser();
    showNotification({
        title: me?.globalName || me?.username || "FriendsRecentProfileUpdate",
        body: "changed their bio: this is a test notification, real ones look like this.",
        icon: me?.getAvatarURL(undefined, 64, false),
        onClick: () => openHistory()
    });
}

/** One line that shows whether the plugin is really watching, so a silent failure is visible */
function TrackerStatusLine() {
    const status = useTrackerStatus();
    const { autoRefresh } = settings.use(["autoRefresh"]);

    let text: string;
    if (status.error) text = `Not watching: ${status.error}`;
    else if (!status.running) text = "Not watching yet, starting...";
    else if (!status.lastCheck) text = "Watching, first check in progress...";
    else text = `Watching ${status.watched} profile${status.watched === 1 ? "" : "s"}, last check at ${formatTime(status.lastCheck)}.`;

    if (status.running && autoRefresh) {
        text += ` Background refresh: ${status.profilesLoaded} profile${status.profilesLoaded === 1 ? "" : "s"} loaded`;
        text += status.nextRefresh ? `, next one at ${formatTime(status.nextRefresh)}.` : ".";
    }

    return (
        <div className={cl("status")}>
            <span className={classes(cl("status-dot"), status.running && !status.error && cl("status-ok"))} />
            <Span size="sm">{text}</Span>
        </div>
    );
}

export function HistorySection() {
    const entries = useHistory();
    const { lastSeen } = settings.use(["lastSeen"]);
    const unseen = entries.filter(entry => entry.timestamp > lastSeen).length;

    return (
        <div className={cl("history-card")}>
            <div className={cl("history-card-top")}>
                <div>
                    <SectionTitle>Change history</SectionTitle>
                    <Paragraph>
                        {entries.length} change{entries.length === 1 ? "" : "s"} saved{unseen ? `, ${unseen} new` : ""}.
                        Also opens from the top bar button or by right-clicking a friend.
                    </Paragraph>
                </div>
                <div className={cl("history-card-buttons")}>
                    <Button variant="secondary" onClick={sendTestNotification}>Test notification</Button>
                    <Button onClick={() => openHistory()}>Open history</Button>
                </div>
            </div>
            <TrackerStatusLine />
        </div>
    );
}

// The content components are defined once at module level: ExpandableSection mounts `renderContent`
// as a component, so an inline arrow function would remount it (and reset search/pagination) on every render.
const DefaultContent = () => (
    <>
        <Paragraph className={cl("hint")}>
            Used for every friend you did not change in the list below, new friends included.
        </Paragraph>
        <DefaultRow />
    </>
);

const FriendsContent = () => (
    <>
        <Paragraph className={cl("hint")}>
            Click a square to turn an option on or off, a column title to change it for every friend, an avatar to stop tracking someone.
        </Paragraph>
        <FriendList />
    </>
);

export function FriendsSection() {
    const friendCount = useStateFromStores([RelationshipStore], () => RelationshipStore.getFriendIDs().length);

    return (
        <div className={cl("section")}>
            <SectionTitle>What to track</SectionTitle>
            <Paragraph className={cl("hint")}>
                Pronouns, bio, banner and colors are only checked when a profile gets loaded: when you open it, or with the background refresh.
            </Paragraph>
            <ExpandableSection renderContent={DefaultContent}>
                <SectionTitle>Default settings</SectionTitle>
            </ExpandableSection>
            <ExpandableSection renderContent={FriendsContent}>
                <SectionTitle>Friends ({friendCount})</SectionTitle>
            </ExpandableSection>
        </div>
    );
}
