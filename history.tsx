/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Button } from "@components/Button";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { openUserProfile } from "@utils/discord";
import { Logger } from "@utils/Logger";
import type { RenderModalProps } from "@vencord/discord-types";
import { Alerts, Modal, openModal, React, TextInput, useEffect, useReducer, useState } from "@webpack/common";

import { DATASTORE_PREFIX, Field, FIELD_LABELS, FIELDS, IMAGE_FIELDS, PLUGIN_NAME } from "./constants";
import { settings } from "./settings";
import { cl, formatTimestamp, getImageUrl, parseColors } from "./ui";

export interface HistoryEntry {
    userId: string;
    /** Name of the friend when the change was logged */
    name: string;
    /** Current avatar url of the friend when the change was logged */
    avatar: string;
    field: Field;
    oldValue: string;
    newValue: string;
    timestamp: number;
}

const MAX_ENTRIES = 1000;
const PAGE_SIZE = 30;
const STORE_KEY = `${DATASTORE_PREFIX}history`;

const logger = new Logger(PLUGIN_NAME);

// Newest first, kept in IndexedDB so it survives restarts
let entries: HistoryEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

const entryKey = (entry: HistoryEntry) => `${entry.userId}-${entry.field}-${entry.timestamp}`;

function isValidEntry(entry: any): entry is HistoryEntry {
    return entry != null
        && typeof entry.userId === "string"
        && typeof entry.timestamp === "number"
        && FIELDS.includes(entry.field)
        && typeof entry.oldValue === "string"
        && typeof entry.newValue === "string";
}

function persist() {
    // Never write before the stored history was read, it would be overwritten with only the newest entries
    if (!loaded) return;
    DataStore.set(STORE_KEY, entries).catch(e => logger.error("Failed to save the history", e));
}

export async function loadHistory() {
    try {
        const stored = await DataStore.get<HistoryEntry[]>(STORE_KEY);
        if (Array.isArray(stored)) {
            const known = new Set(entries.map(entryKey));
            entries = [...entries, ...stored.filter(entry => isValidEntry(entry) && !known.has(entryKey(entry)))]
                .slice(0, MAX_ENTRIES);
        }
    } catch (e) {
        logger.error("Failed to load the history", e);
    }
    loaded = true;
    persist();
    emit();
}

export function addHistoryEntries(newEntries: HistoryEntry[]) {
    if (!newEntries.length) return;
    entries = [...newEntries, ...entries].slice(0, MAX_ENTRIES);
    persist();
    emit();
}

function clearHistory() {
    entries = [];
    DataStore.del(STORE_KEY).catch(e => logger.error("Failed to clear the stored history", e));
    emit();
}

export function useHistory() {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(forceUpdate);
        return () => void listeners.delete(forceUpdate);
    }, []);
    return entries;
}

function ColorSwatches({ value }: { value: string; }) {
    const colors = parseColors(value);
    if (!colors.length) return <span className={cl("empty-value")}>none</span>;

    return (
        <span className={cl("swatches")}>
            {colors.map(color => (
                <span key={color} className={cl("swatch")} style={{ backgroundColor: color }} title={color} />
            ))}
            <span className={cl("swatch-text")}>{colors.join(" / ")}</span>
        </span>
    );
}

function ImageValue({ entry, value }: { entry: HistoryEntry; value: string; }) {
    const [broken, setBroken] = useState(false);
    const url = getImageUrl(entry.field, entry.userId, value);

    if (!value && entry.field === "banner") return <span className={cl("empty-value")}>none</span>;
    if (!url || broken) return <span className={cl("empty-value")}>image no longer available</span>;

    return (
        <img
            className={cl(entry.field === "avatar" ? "image-avatar" : "image-banner")}
            src={url}
            alt=""
            onError={() => setBroken(true)}
        />
    );
}

function Value({ entry, value }: { entry: HistoryEntry; value: string; }) {
    if (IMAGE_FIELDS.has(entry.field)) return <ImageValue entry={entry} value={value} />;
    if (entry.field === "colors") return <ColorSwatches value={value} />;
    if (!value) return <span className={cl("empty-value")}>empty</span>;
    return <span className={cl("text-value")}>{value}</span>;
}

function HistoryRow({ entry, isNew }: { entry: HistoryEntry; isNew: boolean; }) {
    return (
        <div className={cl("row")}>
            <div className={cl("row-header")}>
                <button
                    type="button"
                    className={cl("row-user")}
                    onClick={() => openUserProfile(entry.userId).catch(e => logger.error("Failed to open the profile", e))}
                >
                    <img className={cl("row-avatar")} src={entry.avatar} alt="" />
                    <strong>{entry.name}</strong>
                </button>
                <span>changed their {FIELD_LABELS[entry.field]}</span>
                {isNew && <span className={cl("new-badge")}>New</span>}
                <span className={cl("row-time")}>{formatTimestamp(entry.timestamp)}</span>
            </div>
            <div className={cl("row-values")}>
                <div className={cl("value-box")}>
                    <span className={cl("value-label")}>Before</span>
                    <Value entry={entry} value={entry.oldValue} />
                </div>
                <div className={cl("value-box")}>
                    <span className={cl("value-label")}>After</span>
                    <Value entry={entry} value={entry.newValue} />
                </div>
            </div>
        </div>
    );
}

function HistoryModal({ modalProps, userId, seenBefore }: { modalProps: RenderModalProps; userId?: string; seenBefore: number; }) {
    const allEntries = useHistory();
    const [onlyUser, setOnlyUser] = useState(userId);
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);

    const search = query.trim().toLowerCase();
    const filtered = allEntries.filter(entry =>
        (!onlyUser || entry.userId === onlyUser)
        && (!search || entry.name.toLowerCase().includes(search) || FIELD_LABELS[entry.field].includes(search))
    );

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
    const userName = onlyUser && allEntries.find(entry => entry.userId === onlyUser)?.name;

    return (
        <Modal
            {...modalProps}
            size="lg"
            title="Friend profile changes"
            subtitle={`${allEntries.length} change${allEntries.length === 1 ? "" : "s"} logged (the last ${MAX_ENTRIES} are kept)`}
            actions={[{
                text: "Clear",
                variant: "critical-primary",
                disabled: allEntries.length === 0,
                onClick: () => Alerts.show({
                    title: "Clear history",
                    body: "Are you sure you want to clear the profile change history?",
                    confirmText: "Clear",
                    cancelText: "Cancel",
                    onConfirm: clearHistory
                })
            }]}
        >
            <div className={cl("history")}>
                {onlyUser && (
                    <div className={cl("filter")}>
                        <Span size="sm">Showing the changes of {userName || "this friend"} only.</Span>
                        <Button size="small" variant="secondary" onClick={() => { setOnlyUser(undefined); setPage(0); }}>
                            Show everyone
                        </Button>
                    </div>
                )}
                <TextInput
                    placeholder="Search by name or by what changed (bio, avatar...)"
                    value={query}
                    onChange={value => {
                        setQuery(value);
                        setPage(0);
                    }}
                    autoFocus
                />
                {visible.length === 0
                    ? (
                        <Paragraph className={cl("history-empty")}>
                            {filtered.length !== allEntries.length || search
                                ? "No changes match your search."
                                : "No profile changes have been logged yet."}
                        </Paragraph>
                    )
                    : (
                        <div className={cl("list")}>
                            {visible.map(entry => <HistoryRow key={entryKey(entry)} entry={entry} isNew={entry.timestamp > seenBefore} />)}
                        </div>
                    )}
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
        </Modal>
    );
}

/** Opens the history, optionally showing only one friend's changes */
export function openHistory(userId?: string) {
    // Everything logged so far is now seen, the rows newer than the previous visit get a "New" badge
    const seenBefore = settings.store.lastSeen;
    if (entries.length && entries[0].timestamp > seenBefore) settings.store.lastSeen = entries[0].timestamp;

    openModal(props => (
        <ErrorBoundary>
            <HistoryModal modalProps={props} userId={userId} seenBefore={seenBefore} />
        </ErrorBoundary>
    ));
}
