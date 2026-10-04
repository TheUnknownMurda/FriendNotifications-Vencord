/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { ExpandableSection } from "@components/ExpandableCard";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { React, RelationshipStore, useStateFromStores } from "@webpack/common";

import { DefaultRow, FriendList } from "./FriendList";
import { openHistory, useHistory } from "./history";
import { settings } from "./settings";
import { cl } from "./ui";

function SectionTitle({ children }: { children: React.ReactNode; }) {
    return <Span weight="semibold" size="md">{children}</Span>;
}

export function HistorySection() {
    const entries = useHistory();
    const { lastSeen } = settings.use(["lastSeen"]);
    const unseen = entries.filter(entry => entry.timestamp > lastSeen).length;

    return (
        <div className={cl("history-card")}>
            <div>
                <SectionTitle>Change history</SectionTitle>
                <Paragraph>
                    {entries.length} change{entries.length === 1 ? "" : "s"} saved{unseen ? `, ${unseen} new` : ""}.
                    Also opens from the top bar button or by right-clicking a friend.
                </Paragraph>
            </div>
            <Button onClick={() => openHistory()}>Open history</Button>
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
