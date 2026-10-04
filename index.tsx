/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavContextMenuPatchCallback } from "@api/ContextMenu";
import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";
import type { User } from "@vencord/discord-types";
import { Menu, React, RelationshipStore } from "@webpack/common";

import { FIELD_TITLES, FIELDS, PLUGIN_NAME } from "./constants";
import { HeaderButton } from "./HeaderButton";
import { loadHistory, openHistory } from "./history";
import { resetFriendConfig, settings, updateFriendConfig } from "./settings";
import managedStyle from "./styles.css?managed";
import { scheduleScan, startTracker, stopTracker } from "./tracker";

const UserContextMenuPatch: NavContextMenuPatchCallback = (children, { user }: { user?: User; }) => {
    if (!user || !RelationshipStore.isFriend(user.id)) return;

    // Re-renders the menu when a checkbox below is clicked
    const { friends, defaultConfig } = settings.use(["friends", "defaultConfig"]);
    const config = friends[user.id] ?? defaultConfig;
    const update = (patch: Parameters<typeof updateFriendConfig>[1]) => updateFriendConfig(user.id, patch);

    children.push(
        <Menu.MenuGroup>
            <Menu.MenuItem id="vc-profileupdate" label="Profile tracking">
                <Menu.MenuGroup>
                    <Menu.MenuItem
                        id="vc-profileupdate-history"
                        label="Open change history"
                        action={() => openHistory(user.id)}
                    />
                </Menu.MenuGroup>
                <Menu.MenuGroup>
                    <Menu.MenuCheckboxItem
                        id="vc-profileupdate-track"
                        label="Track this friend"
                        checked={!config.disabled}
                        action={() => update({ disabled: !config.disabled })}
                    />
                    <Menu.MenuCheckboxItem
                        id="vc-profileupdate-notify"
                        label="Notifications"
                        checked={config.notify !== false}
                        disabled={config.disabled}
                        action={() => update({ notify: config.notify === false })}
                    />
                </Menu.MenuGroup>
                <Menu.MenuGroup>
                    {FIELDS.map(field => (
                        <Menu.MenuCheckboxItem
                            key={field}
                            id={`vc-profileupdate-${field}`}
                            label={FIELD_TITLES[field]}
                            checked={config[field] !== false}
                            disabled={config.disabled}
                            action={() => update({ [field]: config[field] === false })}
                        />
                    ))}
                </Menu.MenuGroup>
                {friends[user.id] != null && (
                    <Menu.MenuGroup>
                        <Menu.MenuItem
                            id="vc-profileupdate-reset"
                            label="Use the default settings"
                            action={() => resetFriendConfig(user.id)}
                        />
                    </Menu.MenuGroup>
                )}
            </Menu.MenuItem>
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

    patches: [
        {
            // Top bar of Discord (inbox and help buttons). Inserted at the start of the buttons list, so it also
            // works when the VencordToolbox plugin wraps that list
            find: '?"BACK_FORWARD_NAVIGATION":',
            replacement: {
                match: /(?<=trailing:.{0,150}?(?:\.Fragment|\.TrailingWrapper),\{children:\[)/,
                replace: "$self.renderHeaderButton(),"
            }
        }
    ],

    contextMenus: {
        "user-context": UserContextMenuPatch
    },

    toolboxActions: {
        "Open friend profile changes": () => openHistory()
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

    renderHeaderButton() {
        return (
            <ErrorBoundary key="vc-profileupdate-button" noop>
                <HeaderButton />
            </ErrorBoundary>
        );
    },

    start() {
        loadHistory();
        startTracker();
    },

    stop() {
        stopTracker();
    }
});
