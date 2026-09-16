/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { addServerListElement, removeServerListElement, ServerListRenderPosition } from "@api/ServerList";
import ErrorBoundary from "@components/ErrorBoundary";
import { TooltipContainer } from "@components/TooltipContainer";
import definePlugin from "@utils/types";
import { onceReady } from "@webpack";
import { PresenceStore, React, RelationshipStore, useStateFromStores } from "@webpack/common";

import { PLUGIN_NAME } from "./constants";
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

let started = false;

export default definePlugin({
    name: PLUGIN_NAME,
    description: "Shows a notification when a friend, or a user you chose to observe, changes their status. Port of DevilBro's BetterDiscord plugin.",
    authors: [
        { name: "TheUnknownMurda", id: 338163169782398977n },
        { name: "DevilBro (original BetterDiscord plugin)", id: 278543574059057154n }
    ],
    tags: ["Friends", "Notifications"],
    dependencies: ["ServerListAPI"],
    settings,
    managedStyle,

    flux: {
        // Presences are (re)loaded on connect and the account may have changed: start from fresh snapshots
        CONNECTION_OPEN() {
            if (started) restartObserver();
        },
        // Friend presences only arrive with READY_SUPPLEMENTAL, shortly after CONNECTION_OPEN
        CONNECTION_OPEN_SUPPLEMENTAL() {
            if (started) onPresencesLoaded();
        },
        RELATIONSHIP_ADD() {
            if (started) syncObservedWithRelationships();
        },
        RELATIONSHIP_REMOVE() {
            if (started) syncObservedWithRelationships();
        }
    },

    OnlineFriendsCounter: ErrorBoundary.wrap(OnlineFriendsCounter, { noop: true }),

    start() {
        started = true;
        addServerListElement(ServerListRenderPosition.Above, this.OnlineFriendsCounter);
        loadTimelog();

        // Wait for the initial presences, otherwise every online friend would be reported as "just came online"
        onceReady.then(() => {
            if (started) restartObserver();
        });
    },

    stop() {
        started = false;
        removeServerListElement(ServerListRenderPosition.Above, this.OnlineFriendsCounter);
        stopObserver();
        clearSoundCache();
    }
});
