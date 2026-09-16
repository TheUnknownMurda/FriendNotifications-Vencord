/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import { Paragraph } from "@components/Paragraph";
import { Logger } from "@utils/Logger";
import type { RenderModalProps } from "@vencord/discord-types";
import { Alerts, Modal, openModal, React, TextInput, useEffect, useReducer, useState } from "@webpack/common";

import { BaseStatus, DATASTORE_PREFIX } from "./constants";
import { formatRich, formatTimestamp, MessageVars } from "./format";
import { cl, Pagination, StatusDot } from "./ui";

export interface TimelogEntry {
    userId: string;
    name: string;
    avatar: string;
    status: BaseStatus;
    mobile: boolean;
    timestamp: number;
    template: string;
    vars: MessageVars;
}

const MAX_ENTRIES = 2000;
const PAGE_SIZE = 50;
const STORE_KEY = `${DATASTORE_PREFIX}timelog`;

const logger = new Logger("FriendNotifications");

// Unlike the BetterDiscord plugin, the timelog is kept in IndexedDB so it survives restarts (newest first)
let entries: TimelogEntry[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
    for (const listener of listeners) listener();
}

const entryKey = (entry: TimelogEntry) => `${entry.userId}-${entry.timestamp}`;

function isValidEntry(entry: any): entry is TimelogEntry {
    return entry != null
        && typeof entry.userId === "string"
        && typeof entry.timestamp === "number"
        && typeof entry.template === "string"
        && typeof entry.vars === "object";
}

function persist() {
    // Never write before the stored log was read, it would be overwritten with only the newest entries
    if (!loaded) return;
    DataStore.set(STORE_KEY, entries).catch(e => logger.error("Failed to save the timelog", e));
}

export async function loadTimelog() {
    try {
        const stored = await DataStore.get<TimelogEntry[]>(STORE_KEY);
        if (Array.isArray(stored)) {
            // Entries logged while loading (or before a plugin restart) are newer, keep them first
            const known = new Set(entries.map(entryKey));
            entries = [...entries, ...stored.filter(entry => isValidEntry(entry) && !known.has(entryKey(entry)))]
                .slice(0, MAX_ENTRIES);
        }
    } catch (e) {
        logger.error("Failed to load the timelog", e);
    }
    loaded = true;
    persist();
    emit();
}

export function addTimelogEntry(entry: TimelogEntry) {
    entries = [entry, ...entries].slice(0, MAX_ENTRIES);
    persist();
    emit();
}

export function clearTimelog() {
    entries = [];
    DataStore.del(STORE_KEY).catch(e => logger.error("Failed to clear the stored timelog", e));
    emit();
}

export function getTimelog() {
    return entries;
}

function useTimelog() {
    const [, forceUpdate] = useReducer((x: number) => x + 1, 0);
    useEffect(() => {
        listeners.add(forceUpdate);
        return () => void listeners.delete(forceUpdate);
    }, []);
    return entries;
}

function TimelogRow({ entry }: { entry: TimelogEntry; }) {
    return (
        <div className={cl("timelog-row")}>
            <span className={cl("timelog-time")}>{formatTimestamp(entry.timestamp)}</span>
            <img className={cl("timelog-avatar")} src={entry.avatar} alt="" />
            <StatusDot status={entry.status} mobile={entry.mobile} />
            <span className={cl("timelog-text")}>{formatRich(entry.template, entry.vars)}</span>
        </div>
    );
}

function TimelogModal({ modalProps }: { modalProps: RenderModalProps; }) {
    const allEntries = useTimelog();
    const [query, setQuery] = useState("");
    const [page, setPage] = useState(0);

    const search = query.trim().toLowerCase();
    const filtered = search
        ? allEntries.filter(entry => entry.name.toLowerCase().includes(search))
        : allEntries;

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const currentPage = Math.min(page, pageCount - 1);
    const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

    return (
        <Modal
            {...modalProps}
            size="lg"
            title="LogIn/-Out Timelog"
            subtitle={`${allEntries.length} status change${allEntries.length === 1 ? "" : "s"} logged (the last ${MAX_ENTRIES} are kept)`}
            actions={[{
                text: "Clear",
                variant: "critical-primary",
                disabled: allEntries.length === 0,
                onClick: () => Alerts.show({
                    title: "Clear timelog",
                    body: "Are you sure you want to clear the timelog?",
                    confirmText: "Clear",
                    cancelText: "Cancel",
                    onConfirm: clearTimelog
                })
            }]}
        >
            <div className={cl("timelog")}>
                <TextInput
                    placeholder="Search by user name"
                    value={query}
                    onChange={value => {
                        setQuery(value);
                        setPage(0);
                    }}
                    autoFocus
                />
                {visible.length === 0
                    ? (
                        <Paragraph className={cl("timelog-empty")}>
                            {allEntries.length
                                ? "No entries match your search."
                                : "No status changes have been logged yet."}
                        </Paragraph>
                    )
                    : (
                        <div className={cl("timelog-list")}>
                            {visible.map(entry => (
                                <TimelogRow key={`${entry.userId}-${entry.timestamp}`} entry={entry} />
                            ))}
                        </div>
                    )}
                <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
            </div>
        </Modal>
    );
}

export function openTimelog() {
    openModal(props => (
        <ErrorBoundary>
            <TimelogModal modalProps={props} />
        </ErrorBoundary>
    ));
}
