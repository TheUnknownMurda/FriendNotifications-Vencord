/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { classes } from "@utils/misc";
import type { User } from "@vencord/discord-types";
import { React, RelationshipStore, TextInput, useMemo, UserStore, useState, useStateFromStores } from "@webpack/common";

import { DEFAULT_FRIEND_CONFIG, Field, FIELD_TITLES, FIELDS, FriendConfig } from "./constants";
import { settings } from "./settings";
import { cl } from "./ui";

const PAGE_SIZE = 50;

type Column = Field | "notify";
const COLUMNS: Column[] = ["notify", ...FIELDS];

const COLUMN_LABELS: Record<Column, string> = {
    notify: "Notify",
    username: "User",
    globalName: "Name",
    pronouns: "Pron.",
    bio: "Bio",
    avatar: "Avatar",
    banner: "Banner",
    colors: "Colors"
};

const COLUMN_TITLES: Record<Column, string> = {
    ...FIELD_TITLES,
    notify: "Notifications (when off, the changes only go to the history)"
};

function friendName(id: string) {
    const user = UserStore.getUser(id) as User | undefined;
    return RelationshipStore.getNickname(id) || user?.globalName || user?.username || id;
}

interface CellProps {
    column: Column;
    config: FriendConfig;
    onChange(patch: Partial<FriendConfig>): void;
}

function Cell({ column, config, onChange }: CellProps) {
    const enabled = config[column] !== false;

    return (
        <button
            type="button"
            className={classes(cl("cell"), enabled && cl("cell-on"))}
            title={`${COLUMN_TITLES[column]}: ${enabled ? "on" : "off"}`}
            aria-pressed={enabled}
            onClick={() => onChange({ [column]: !enabled })}
        />
    );
}

interface HeaderProps {
    configs: FriendConfig[];
    onChangeAll(patch: Partial<FriendConfig>): void;
    userLabel: string;
}

function HeaderRow({ configs, onChangeAll, userLabel }: HeaderProps) {
    return (
        <div className={classes(cl("trow"), cl("header"))}>
            <button
                type="button"
                className={classes(cl("header-cell"), cl("header-user"))}
                title="Click to track every friend of the list, right-click to track none of them"
                onClick={() => onChangeAll({ disabled: false })}
                onContextMenu={e => {
                    e.preventDefault();
                    onChangeAll({ disabled: true });
                }}
            >
                {userLabel}
            </button>
            {COLUMNS.map(column => {
                // If the option is on for everyone, the click turns it off for everyone
                const allOn = configs.length > 0 && configs.every(config => config[column] !== false);
                return (
                    <button
                        key={column}
                        type="button"
                        className={cl("header-cell")}
                        title={`${COLUMN_TITLES[column]}. Click to turn it ${allOn ? "off" : "on"} for every friend of the list`}
                        onClick={() => onChangeAll({ [column]: !allOn })}
                    >
                        {COLUMN_LABELS[column]}
                    </button>
                );
            })}
            <div />
        </div>
    );
}

interface FriendRowProps {
    id: string;
    config: FriendConfig;
    custom: boolean;
    onChange(patch: Partial<FriendConfig>): void;
    onReset(): void;
}

function FriendRow({ id, config, custom, onChange, onReset }: FriendRowProps) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(id) as User | undefined, [id]);
    const name = friendName(id);

    return (
        <div className={classes(cl("trow"), config.disabled && cl("trow-disabled"))}>
            <div className={cl("user")}>
                <button
                    type="button"
                    className={cl("avatar-button")}
                    title={config.disabled ? "Not tracked. Click to track this friend" : "Tracked. Click to stop tracking this friend"}
                    onClick={() => onChange({ disabled: !config.disabled })}
                >
                    {user
                        ? <img className={cl("avatar")} src={user.getAvatarURL(undefined, 40, false)} alt="" />
                        : <span className={classes(cl("avatar"), cl("avatar-unknown"))}>?</span>}
                </button>
                <Span className={cl("name")} title={user ? `@${user.username}` : id}>{name}</Span>
            </div>
            {COLUMNS.map(column => (
                <Cell key={column} column={column} config={config} onChange={onChange} />
            ))}
            <div className={cl("reset")}>
                {custom && (
                    <button type="button" className={cl("reset-button")} title="Use the default settings again" onClick={onReset}>
                        ↺
                    </button>
                )}
            </div>
        </div>
    );
}

export function FriendList() {
    const { friends, defaultConfig } = settings.use(["friends", "defaultConfig"]);
    const friendIds = useStateFromStores([RelationshipStore], () => RelationshipStore.getFriendIDs());

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);
    const search = query.trim().toLowerCase();

    // Alphabetical order, names are resolved here so sorting survives pagination
    const ids = useMemo(() => {
        return friendIds
            .map(id => ({ id, name: friendName(id) }))
            .filter(({ id, name }) => !search || name.toLowerCase().includes(search) || id.includes(search))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ id }) => id);
    }, [friendIds, search]);

    const pageCount = Math.max(1, Math.ceil(ids.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const visibleIds = ids.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    const configOf = (id: string): FriendConfig => friends[id] ?? defaultConfig;

    function update(id: string, patch: Partial<FriendConfig>) {
        friends[id] = { ...DEFAULT_FRIEND_CONFIG, ...configOf(id), ...patch };
    }

    function updateAll(patch: Partial<FriendConfig>) {
        // Plain copies only, so the whole list is written to disk once
        const next: Record<string, FriendConfig> = {};
        for (const [id, config] of Object.entries(friends)) next[id] = { ...config };
        for (const id of ids) next[id] = { ...DEFAULT_FRIEND_CONFIG, ...configOf(id), ...patch };
        settings.store.friends = next;
    }

    if (!friendIds.length) return <Paragraph>You have no friends to track yet.</Paragraph>;

    return (
        <div className={cl("friend-list")}>
            <TextInput
                placeholder="Search a friend..."
                value={query}
                onChange={value => {
                    setQuery(value);
                    setPage(0);
                }}
            />
            <div className={cl("table")}>
                <HeaderRow userLabel="Friend" configs={ids.map(configOf)} onChangeAll={updateAll} />
                {visibleIds.map(id => (
                    <FriendRow
                        key={id}
                        id={id}
                        config={configOf(id)}
                        custom={friends[id] != null}
                        onChange={patch => update(id, patch)}
                        onReset={() => { delete friends[id]; }}
                    />
                ))}
                {!visibleIds.length && <Paragraph className={cl("empty")}>No friend matches your search.</Paragraph>}
            </div>
            {pageCount > 1 && (
                <div className={cl("pagination")}>
                    <Button size="small" variant="secondary" disabled={currentPage <= 0} onClick={() => setPage(currentPage - 1)}>
                        Previous
                    </Button>
                    <Span size="sm">Page {currentPage + 1} / {pageCount}</Span>
                    <Button size="small" variant="secondary" disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>
                        Next
                    </Button>
                </div>
            )}
        </div>
    );
}

export function DefaultRow() {
    const { defaultConfig } = settings.use(["defaultConfig"]);

    function update(patch: Partial<FriendConfig>) {
        settings.store.defaultConfig = { ...DEFAULT_FRIEND_CONFIG, ...defaultConfig, ...patch };
    }

    return (
        <div className={cl("table")}>
            <HeaderRow userLabel="" configs={[defaultConfig]} onChangeAll={update} />
            <div className={classes(cl("trow"), defaultConfig.disabled && cl("trow-disabled"))}>
                <div className={cl("user")}>
                    <button
                        type="button"
                        className={classes(cl("cell"), !defaultConfig.disabled && cl("cell-on"))}
                        title={defaultConfig.disabled ? "Friends are not tracked by default. Click to track them" : "Friends are tracked by default. Click to stop"}
                        onClick={() => update({ disabled: !defaultConfig.disabled })}
                    />
                    <Span className={cl("name")}>Default</Span>
                </div>
                {COLUMNS.map(column => (
                    <Cell key={column} column={column} config={defaultConfig} onChange={update} />
                ))}
                <div />
            </div>
        </div>
    );
}
