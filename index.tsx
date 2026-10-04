/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Menu, RelationshipStore } from "@webpack/common";

import { PLUGIN_NAME } from "./constants";
import { loadHistory, openHistory } from "./history";
import { isIgnored, settings, toggleIgnored } from "./settings";
import managedStyle from "./styles.css?managed";
import { scheduleScan, startTracker, stopTracker } from "./tracker";

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !RelationshipStore.isFriend(user.id)) return;

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem
                id="vc-profilechanges-history"
                label="Profile change history"
                action={() => openHistory(user.id)}
            />
            <Menu.MenuCheckboxItem
                id="vc-profilechanges-ignore"
                label="Ignore profile changes"
                checked={isIgnored(user.id)}
                action={() => toggleIgnored(user.id)}
            />
        </Menu.MenuGroup>
    );
};

export default definePlugin({
    name: PLUGIN_NAME,
    description: "Notifies you and keeps a history when a friend changes their bio, display name, pronouns, avatar, banner or profile colors.",
    authors: [{ name: "TheUnknownMurda", id: 338163169782398977n }],
    tags: ["Friends", "Notifications"],
    settings,
    managedStyle,

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    flux: {
        // Friends' data is (re)loaded on connect: compare it with what we knew before Discord was closed
        CONNECTION_OPEN() {
            scheduleScan();
        },
        CONNECTION_OPEN_SUPPLEMENTAL() {
            scheduleScan();
        }
    },

    start() {
        loadHistory();
        startTracker();
    },

    stop() {
        stopTracker();
    }
});
