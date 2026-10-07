/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import ErrorBoundary from "@components/ErrorBoundary";
import { TooltipContainer } from "@components/TooltipContainer";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { onceReady } from "@webpack";
import { Menu, PresenceStore, React, RelationshipStore, useStateFromStores } from "@webpack/common";

import { PLUGIN_NAME } from "./constants";
import { handlePresenceUpdates, onLastSeenConnectionClosed, onLastSeenConnectionOpen, onLastSeenConnectionResumed, startLastSeen, stopLastSeen } from "./lastSeen";
import { LastSeenMenuLabel, openLastSeen, openLastSeenList, renderFriendRowLabel } from "./LastSeenUI";
import { onPresencesLoaded, restartObserver, stopObserver, syncObservedWithRelationships } from "./observer";
import { settings } from "./settings";
import { clearSoundCache } from "./sounds";
import managedStyle from "./styles.css?managed";
import { loadTimelog, openTimelog } from "./timelog";
import { cl } from "./ui";

function countOnlineFriends() {
    let count = 0;
    for (const id of RelationshipStore.getFriendIDs()) {
        if ((PresenceStore.getStatus(id) ?? "offline") !== "offline") count++;
    }
    return count;
}

function OnlineFriendsCounter() {
    const { addOnlineCount } = settings.use(["addOnlineCount"]);
    const count = useStateFromStores([RelationshipStore, PresenceStore], countOnlineFriends);

    if (!addOnlineCount) return null;

    return (
        <TooltipContainer text="Open the timelog">
            <button type="button" className={cl("online-counter")} onClick={openTimelog}>
                {count} online
            </button>
        </TooltipContainer>
    );
}

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !RelationshipStore.isFriend(user.id)) return;

    children.push(
        <Menu.MenuGroup key="vc-friendnotif-lastseen">
            <Menu.MenuItem
                id="vc-friendnotif-lastseen"
                label={<LastSeenMenuLabel userId={user.id} />}
                action={() => openLastSeen(user.id)}
            />
        </Menu.MenuGroup>
    );
};

let started = false;

export default definePlugin({
    name: PLUGIN_NAME,
    description: "Shows a notification when a friend, or a user you chose to observe, changes their status, and records when each friend was last connected. Port of DevilBro's BetterDiscord plugin.",
    authors: [
        { name: "TheUnknownMurda", id: 338163169782398977n },
        { name: "DevilBro (original BetterDiscord plugin)", id: 278543574059057154n }
    ],
    tags: ["Friends", "Notifications"],
    dependencies: ["ServerListAPI"],
    settings,
    managedStyle,

    patches: [
        {
            // Friends list row: "Seen 3 h ago" before the message / more buttons. Same spot as Vencord's UserVoiceShow
            find: "null!=this.peopleListItemRef.current",
            replacement: {
                match: /\.isProvisional.{0,50}?className:\i\.\i,children:\[/,
                replace: "$&$self.renderFriendRowLabel(this?.props?.user?.id),"
            }
        }
    ],

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    toolboxActions: {
        "Open last seen": openLastSeenList
    },

    flux: {
        // Every presence change Discord receives, for the last seen history
        PRESENCE_UPDATES: handlePresenceUpdates,
        // Presences are (re)loaded on connect and the account may have changed: start from fresh snapshots
        CONNECTION_OPEN() {
            if (started) restartObserver();
            onLastSeenConnectionOpen();
        },
        // Friend presences only arrive with READY_SUPPLEMENTAL, shortly after CONNECTION_OPEN
        CONNECTION_OPEN_SUPPLEMENTAL() {
            if (started) onPresencesLoaded();
            onLastSeenConnectionOpen();
        },
        CONNECTION_RESUMED: onLastSeenConnectionResumed,
        CONNECTION_CLOSED: onLastSeenConnectionClosed,
        RELATIONSHIP_ADD() {
            if (started) syncObservedWithRelationships();
        },
        RELATIONSHIP_REMOVE() {
            if (started) syncObservedWithRelationships();
        }
    },

    OnlineFriendsCounter: ErrorBoundary.wrap(OnlineFriendsCounter, { noop: true }),
    renderFriendRowLabel,

    start() {
        started = true;
        addServerListElement(ServerListRenderPosition.Above, this.OnlineFriendsCounter);
        loadTimelog();
        startLastSeen();

        // Wait for the initial presences, otherwise every online friend would be reported as "just came online"
        onceReady.then(() => {
            if (started) restartObserver();
        });
    },

    stop() {
        started = false;
        removeServerListElement(ServerListRenderPosition.Above, this.OnlineFriendsCounter);
        stopObserver();
        stopLastSeen();
        clearSoundCache();
    }
});
