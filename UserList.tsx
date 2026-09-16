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
import { PresenceStore, React, RelationshipStore, showToast, TextInput, Toasts, useEffect, useMemo, UserStore, UserUtils, useState, useStateFromStores } from "@webpack/common";

import { NotificationType, ObservedType, STATUS_COLUMN_LABELS, STATUS_KEYS, StatusKey, UserConfig } from "./constants";
import { settings } from "./settings";
import { cl, Pagination, StatusDot } from "./ui";

const PAGE_SIZE = 50;

type ColumnKey = StatusKey | "timelog";
const COLUMNS: ColumnKey[] = [...STATUS_KEYS, "timelog"];

type CellState = "disabled" | "toast" | "desktop";
const CELL_STATE_LABELS: Record<CellState, string> = {
    disabled: "Disabled",
    toast: "Toast",
    desktop: "Desktop"
};

function cellState(column: ColumnKey, config: UserConfig): CellState {
    if (column === "timelog") return config.timelog ? "toast" : "disabled";
    switch (config[column]) {
        case NotificationType.TOAST: return "toast";
        case NotificationType.DESKTOP: return "desktop";
        default: return "disabled";
    }
}

/** Clicking the type that is already active disables the option */
function toggleType(current: NotificationType, clicked: NotificationType) {
    return current === clicked ? NotificationType.DISABLED : clicked;
}

/** Right-click on an avatar: switches every enabled option between Toast and Desktop */
function swapTypes(config: UserConfig): Partial<UserConfig> {
    const first = STATUS_KEYS.map(key => config[key]).find(value => value !== NotificationType.DISABLED);
    if (first === undefined) return {};

    const target = first === NotificationType.TOAST ? NotificationType.DESKTOP : NotificationType.TOAST;
    const patch: Partial<UserConfig> = {};
    for (const key of STATUS_KEYS) {
        if (config[key] !== NotificationType.DISABLED) patch[key] = target;
    }
    return patch;
}

function displayName(user: User | undefined, id: string) {
    return user ? (user.globalName || user.username) : `Unknown user (${id})`;
}

interface OptionCellProps {
    column: ColumnKey;
    config: UserConfig;
    onChange(patch: Partial<UserConfig>): void;
}

function OptionCell({ column, config, onChange }: OptionCellProps) {
    const state = cellState(column, config);
    const isLog = column === "timelog";

    return (
        <button
            type="button"
            className={classes(cl("cell"), cl(`cell-${state}`))}
            title={`${STATUS_COLUMN_LABELS[column].title}: ${CELL_STATE_LABELS[state]}`}
            onClick={() => onChange(isLog
                ? { timelog: !config.timelog }
                : { [column]: toggleType(config[column], NotificationType.TOAST) }
            )}
            onContextMenu={e => {
                e.preventDefault();
                if (!isLog) onChange({ [column]: toggleType(config[column], NotificationType.DESKTOP) });
            }}
        />
    );
}

function useUser(id: string) {
    const user = useStateFromStores([UserStore], () => UserStore.getUser(id) as User | undefined, [id]);

    useEffect(() => {
        // Strangers are not necessarily loaded in the client, try to fetch them once
        if (!user) UserUtils.getUser(id).catch(() => null);
    }, [id, user]);

    return user;
}

interface UserRowProps {
    id: string;
    config: UserConfig;
    onChange(patch: Partial<UserConfig>): void;
    onRemove?(): void;
}

function UserRow({ id, config, onChange, onRemove }: UserRowProps) {
    const user = useUser(id);
    const status = useStateFromStores([PresenceStore], () => PresenceStore.getStatus(id) ?? "offline", [id]);
    const name = displayName(user, id);

    return (
        <div className={classes(cl("row"), config.disabled && cl("row-disabled"))}>
            <div className={cl("user")}>
                <button
                    type="button"
                    className={cl("avatar-button")}
                    title={`${config.disabled ? "Click to enable" : "Click to disable"} notifications for this user. Right-click to switch all their options between Toast and Desktop`}
                    onClick={() => onChange({ disabled: !config.disabled })}
                    onContextMenu={e => {
                        e.preventDefault();
                        onChange(swapTypes(config));
                    }}
                >
                    {user
                        ? <img className={cl("avatar")} src={user.getAvatarURL(undefined, 40, false)} alt="" />
                        : <span className={classes(cl("avatar"), cl("avatar-unknown"))}>?</span>}
                    <StatusDot status={status} className={cl("avatar-status")} />
                </button>
                <Span className={cl("name")} title={user ? `@${user.username}` : id}>{name}</Span>
            </div>
            {COLUMNS.map(column => (
                <OptionCell key={column} column={column} config={config} onChange={onChange} />
            ))}
            <div className={cl("remove")}>
                {onRemove && (
                    <button type="button" className={cl("remove-button")} title="Stop observing this user" onClick={onRemove}>
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}

interface HeaderProps {
    configs: UserConfig[];
    onChangeAll(patch: (config: UserConfig) => Partial<UserConfig>): void;
}

function HeaderRow({ configs, onChangeAll }: HeaderProps) {
    function setColumnForAll(column: ColumnKey, type: NotificationType) {
        if (column === "timelog") {
            onChangeAll(() => ({ timelog: type === NotificationType.TOAST }));
            return;
        }
        // If every user already has this type, the click disables the option for all of them
        const allSet = configs.length > 0 && configs.every(config => config[column] === type);
        onChangeAll(() => ({ [column]: allSet ? NotificationType.DISABLED : type }));
    }

    return (
        <div className={classes(cl("row"), cl("header"))}>
            <button
                type="button"
                className={classes(cl("header-cell"), cl("header-user"))}
                title="Click to enable all users, right-click to disable all users"
                onClick={() => onChangeAll(() => ({ disabled: false }))}
                onContextMenu={e => {
                    e.preventDefault();
                    onChangeAll(() => ({ disabled: true }));
                }}
            >
                User
            </button>
            {COLUMNS.map(column => (
                <button
                    key={column}
                    type="button"
                    className={cl("header-cell")}
                    title={`${STATUS_COLUMN_LABELS[column].title}. Click to toggle Toast for all users${column === "timelog" ? "" : ", right-click to toggle Desktop for all users"}`}
                    onClick={() => setColumnForAll(column, NotificationType.TOAST)}
                    onContextMenu={e => {
                        e.preventDefault();
                        setColumnForAll(column, NotificationType.DESKTOP);
                    }}
                >
                    {STATUS_COLUMN_LABELS[column].short}
                </button>
            ))}
            <div className={cl("remove")} />
        </div>
    );
}

export function Legend() {
    return (
        <div className={cl("legend")}>
            <Paragraph>
                Click an option to toggle <span className={classes(cl("legend-tag"), cl("legend-toast"))}>Toast</span> notifications,
                right-click it to toggle <span className={classes(cl("legend-tag"), cl("legend-desktop"))}>Desktop</span> notifications.
                Clicking a column header applies it to every user.
            </Paragraph>
            <Paragraph>
                Click an avatar to enable/disable a user, right-click it to switch all their options between Toast and Desktop.
            </Paragraph>
        </div>
    );
}

export function UserList({ type }: { type: ObservedType; }) {
    const { observed } = settings.use(["observed"]);
    const configs = observed[type];

    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);
    const search = query.trim().toLowerCase();

    // Alphabetical order, like the BetterDiscord list. Names are resolved here so sorting survives pagination.
    const ids = useMemo(() => {
        return Object.keys(configs)
            .map(id => ({ id, name: displayName(UserStore.getUser(id) as User | undefined, id) }))
            .filter(({ id, name }) => !search || name.toLowerCase().includes(search) || id.includes(search))
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(({ id }) => id);
    }, [configs, search]);

    const pageCount = Math.max(1, Math.ceil(ids.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const visibleIds = ids.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    function update(id: string, patch: Partial<UserConfig>) {
        // Replace the whole object so the change is written to disk once
        configs[id] = { ...configs[id], ...patch };
    }

    function updateAll(patch: (config: UserConfig) => Partial<UserConfig>) {
        const next: Record<string, UserConfig> = {};
        for (const [id, config] of Object.entries(configs)) {
            next[id] = { ...config, ...patch(config) };
        }
        observed[type] = next;
    }

    if (Object.keys(configs).length === 0) {
        return (
            <Paragraph>
                {type === "friends"
                    ? "You have no friends to observe yet."
                    : "No strangers are observed. Add one above with their user ID or username."}
            </Paragraph>
        );
    }

    return (
        <div className={cl("list")}>
            <Legend />
            <TextInput
                placeholder="Search a user..."
                value={query}
                onChange={value => {
                    setQuery(value);
                    setPage(0);
                }}
            />
            <div className={cl("table")}>
                <HeaderRow configs={Object.values(configs)} onChangeAll={updateAll} />
                {visibleIds.map(id => (
                    <UserRow
                        key={id}
                        id={id}
                        config={configs[id]}
                        onChange={patch => update(id, patch)}
                        onRemove={type === "strangers" ? () => { delete configs[id]; } : undefined}
                    />
                ))}
                {visibleIds.length === 0 && <Paragraph className={cl("empty")}>No user matches your search.</Paragraph>}
            </div>
            <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
        </div>
    );
}

export function DefaultsRow() {
    const { defaultUserConfig } = settings.use(["defaultUserConfig"]);

    function update(patch: Partial<UserConfig>) {
        settings.store.defaultUserConfig = { ...defaultUserConfig, ...patch };
    }

    return (
        <div className={cl("list")}>
            <Paragraph>
                Options applied to new friends and newly added strangers. Existing users are not changed.
            </Paragraph>
            <div className={cl("table")}>
                <HeaderRow configs={[defaultUserConfig]} onChangeAll={patch => update(patch(defaultUserConfig))} />
                <div className={classes(cl("row"), defaultUserConfig.disabled && cl("row-disabled"))}>
                    <div className={cl("user")}>
                        <button
                            type="button"
                            className={classes(cl("cell"), cl(defaultUserConfig.disabled ? "cell-disabled" : "cell-toast"))}
                            title={defaultUserConfig.disabled ? "New users start disabled. Click to enable them" : "New users start enabled. Click to disable them"}
                            onClick={() => update({ disabled: !defaultUserConfig.disabled })}
                        />
                        <Span className={cl("name")}>New users</Span>
                    </div>
                    {COLUMNS.map(column => (
                        <OptionCell key={column} column={column} config={defaultUserConfig} onChange={update} />
                    ))}
                    <div className={cl("remove")} />
                </div>
            </div>
        </div>
    );
}

export function AddStranger() {
    const [value, setValue] = useState("");
    const [busy, setBusy] = useState(false);

    async function resolveUser(input: string): Promise<User | undefined> {
        const looksLikeId = /^\d{15,21}$/.test(input);

        if (looksLikeId) {
            const cached = UserStore.getUser(input) as User | undefined;
            if (cached) return cached;
        }

        const [username, discriminator] = input.replace(/^@/, "").split("#");
        const byTag = UserStore.findByTag(username, discriminator || undefined) ?? UserStore.findByTag(input);
        if (byTag) return byTag;

        if (looksLikeId) {
            setBusy(true);
            try {
                return await UserUtils.getUser(input);
            } catch {
                return undefined;
            } finally {
                setBusy(false);
            }
        }

        return undefined;
    }

    async function add() {
        const input = value.trim();
        if (!input || busy) return;

        const user = await resolveUser(input);
        const me = UserStore.getCurrentUser();

        if (!user) {
            showToast("No user found. Enter a user ID, or the username of a user your client already knows", Toasts.Type.FAILURE);
        } else if (user.id === me?.id) {
            showToast("Are you seriously trying to observe yourself?", Toasts.Type.FAILURE);
        } else if (RelationshipStore.isFriend(user.id)) {
            showToast("This user is already your friend, configure them in the friend list", Toasts.Type.FAILURE);
        } else if (settings.store.observed.strangers[user.id]) {
            showToast("This user is already observed as a stranger", Toasts.Type.FAILURE);
        } else {
            settings.store.observed.strangers[user.id] = { ...settings.store.defaultUserConfig };
            setValue("");
            showToast(`Now observing ${displayName(user, user.id)}`, Toasts.Type.SUCCESS);
        }
    }

    return (
        <div className={cl("add-stranger")}>
            <TextInput
                placeholder="User ID or username"
                value={value}
                onChange={setValue}
                onKeyDown={e => e.key === "Enter" && add()}
            />
            <Button onClick={add} disabled={busy || !value.trim()}>
                Add
            </Button>
        </div>
    );
}
