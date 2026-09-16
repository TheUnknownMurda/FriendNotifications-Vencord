/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { ExpandableSection } from "@components/ExpandableCard";
import { HeadingTertiary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { Span } from "@components/Span";
import { Switch } from "@components/Switch";
import { React, showToast, TextInput, Toasts, useEffect, useRef, useState } from "@webpack/common";

import { DEFAULT_NOTIFICATION_STRINGS, NOTIFICATION_KINDS, NotificationKind, SoundKey } from "./constants";
import { importBetterDiscordConfig } from "./importBD";
import { syncObservedWithRelationships } from "./observer";
import { settings } from "./settings";
import { fetchSoundFromUrl, getSoundConfig, playSound, removeSound, saveSound, setSoundMuted } from "./sounds";
import { openTimelog } from "./timelog";
import { cl } from "./ui";
import { AddStranger, DefaultsRow, UserList } from "./UserList";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function SectionTitle({ children }: { children: React.ReactNode; }) {
    return <Span weight="semibold" size="md">{children}</Span>;
}

// The content components are defined once at module level: ExpandableSection mounts `renderContent`
// as a component, so an inline arrow function would remount it (and reset search/pagination) on every render.
const DefaultsContent = () => <DefaultsRow />;
const FriendsContent = () => <UserList type="friends" />;
const StrangersContent = () => (
    <>
        <AddStranger />
        <UserList type="strangers" />
    </>
);

export function UsersSection() {
    const { observed } = settings.use(["observed"]);

    useEffect(() => {
        syncObservedWithRelationships();
    }, []);

    const friendCount = Object.keys(observed.friends).length;
    const strangerCount = Object.keys(observed.strangers).length;

    return (
        <div className={cl("section")}>
            <HeadingTertiary>Observed users</HeadingTertiary>
            <ExpandableSection renderContent={DefaultsContent}>
                <SectionTitle>Default settings for new users</SectionTitle>
            </ExpandableSection>
            <ExpandableSection renderContent={FriendsContent}>
                <SectionTitle>Friend list ({friendCount})</SectionTitle>
            </ExpandableSection>
            <ExpandableSection renderContent={StrangersContent}>
                <SectionTitle>Strangers ({strangerCount})</SectionTitle>
            </ExpandableSection>
        </div>
    );
}

function MessageRow({ kind }: { kind: NotificationKind; }) {
    const { notificationStrings } = settings.use(["notificationStrings"]);
    const saved = notificationStrings[kind] ?? "";
    const [draft, setDraft] = useState(saved);

    useEffect(() => setDraft(saved), [saved]);

    return (
        <div className={cl("message-row")}>
            <Span className={cl("message-label")} weight="medium">{capitalize(kind)}</Span>
            <TextInput
                value={draft}
                placeholder={DEFAULT_NOTIFICATION_STRINGS[kind]}
                onChange={setDraft}
                onBlur={() => {
                    if (draft !== saved) settings.store.notificationStrings[kind] = draft;
                }}
            />
        </div>
    );
}

const PLACEHOLDERS: [placeholder: string, description: string][] = [
    ["$user", "the display name"],
    ["$nick", "the friend nickname (falls back to $user when the message has no $user)"],
    ["$status", "the new status"],
    ["$statusOld", "the previous status"],
    ["$custom", "the custom status"],
    ["$game", "the game name"],
    ["$song", "the song name"],
    ["$artist", "the song artist"]
];

const MessagesContent = () => (
    <>
        <Paragraph>Configure your own message for each kind of change. Leave a field empty to use the default one.</Paragraph>
        <ul className={cl("placeholders")}>
            {PLACEHOLDERS.map(([placeholder, description]) => (
                <li key={placeholder}>
                    <strong>{placeholder}</strong> {description}
                </li>
            ))}
        </ul>
        <div className={cl("messages")}>
            {NOTIFICATION_KINDS.map(kind => <MessageRow key={kind} kind={kind} />)}
        </div>
    </>
);

export function MessagesSection() {
    return (
        <div className={cl("section")}>
            <ExpandableSection renderContent={MessagesContent}>
                <SectionTitle>Notification messages</SectionTitle>
            </ExpandableSection>
        </div>
    );
}

function SoundRow({ soundKey, label, defaultLabel }: { soundKey: SoundKey; label: string; defaultLabel: string; }) {
    settings.use(["notificationSounds"]);
    const config = getSoundConfig(soundKey);

    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const fileInput = useRef<HTMLInputElement>(null);

    async function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        try {
            await saveSound(soundKey, file, file.name);
            showToast("Sound saved", Toasts.Type.SUCCESS);
        } catch (err) {
            showToast(`Failed to save the sound: ${err instanceof Error ? err.message : err}`, Toasts.Type.FAILURE);
        }
    }

    async function downloadUrl() {
        const trimmed = url.trim();
        if (!trimmed || busy) return;

        setBusy(true);
        try {
            const { blob, name } = await fetchSoundFromUrl(trimmed);
            await saveSound(soundKey, blob, name);
            setUrl("");
            showToast("Sound saved", Toasts.Type.SUCCESS);
        } catch (err) {
            showToast(`Could not download the sound: ${err instanceof Error ? err.message : err}`, Toasts.Type.FAILURE);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={cl("sound-row")}>
            <div className={cl("sound-main")}>
                <Span className={cl("sound-label")} weight="medium">{label}</Span>
                <Span className={cl("sound-name")} title={config.name ?? undefined}>{config.name ?? defaultLabel}</Span>
                <label className={cl("sound-mute")}>
                    <Span size="sm">Mute</Span>
                    <Switch checked={config.mute} onChange={value => setSoundMuted(soundKey, value)} />
                </label>
                <Button size="small" variant="secondary" onClick={() => fileInput.current?.click()}>
                    Choose file
                </Button>
                <Button size="small" variant="secondary" disabled={!config.name} onClick={() => playSound(soundKey, { ignoreMute: true })}>
                    Test
                </Button>
                <Button size="small" variant="dangerSecondary" disabled={!config.name} onClick={() => removeSound(soundKey)}>
                    Remove
                </Button>
                <input
                    ref={fileInput}
                    type="file"
                    accept="audio/*,video/*"
                    style={{ display: "none" }}
                    onChange={onFilePicked}
                />
            </div>
            <div className={cl("sound-url")}>
                <TextInput
                    placeholder="...or a direct link (e.g. a Discord attachment ending in .mp3)"
                    value={url}
                    onChange={setUrl}
                    onKeyDown={e => e.key === "Enter" && downloadUrl()}
                />
                <Button size="small" disabled={busy || !url.trim()} onClick={downloadUrl}>
                    Download
                </Button>
            </div>
        </div>
    );
}

const SoundsContent = () => (
    <>
        <Paragraph>
            Sounds are stored locally in this client. Toast notifications are silent unless you set a sound;
            desktop notifications use the system sound unless you set or mute one.
            Links can only be downloaded from hosts Discord allows (like Discord attachments), otherwise pick a file.
        </Paragraph>
        {NOTIFICATION_KINDS.map(kind => (
            <div key={kind} className={cl("sound-group")}>
                <Span weight="semibold" size="md">{capitalize(kind)}</Span>
                <SoundRow soundKey={`toast-${kind}`} label="Toast" defaultLabel="No sound" />
                <SoundRow soundKey={`desktop-${kind}`} label="Desktop" defaultLabel="System sound" />
            </div>
        ))}
    </>
);

export function SoundsSection() {
    return (
        <div className={cl("section")}>
            <ExpandableSection renderContent={SoundsContent}>
                <SectionTitle>Notification sounds</SectionTitle>
            </ExpandableSection>
        </div>
    );
}

export function ToolsSection() {
    const fileInput = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        e.target.value = "";
        if (!file) return;

        setBusy(true);
        try {
            const message = await importBetterDiscordConfig(JSON.parse(await file.text()));
            showToast(message, Toasts.Type.SUCCESS);
        } catch (err) {
            showToast(`Import failed: ${err instanceof Error ? err.message : err}`, Toasts.Type.FAILURE);
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className={cl("section")}>
            <HeadingTertiary>Timelog</HeadingTertiary>
            <Paragraph>
                Overview of the logged status changes, kept across restarts (last 2000 entries). It can also be opened by clicking the online friend counter in the server list.
            </Paragraph>
            <div className={cl("tools-buttons")}>
                <Button onClick={openTimelog}>Open timelog</Button>
            </div>

            <HeadingTertiary>Import from BetterDiscord</HeadingTertiary>
            <Paragraph>
                Imports the settings, observed users, messages and sounds of the BetterDiscord plugin from its
                FriendNotifications.config.json file (in the BetterDiscord plugins folder).
                If the file holds several accounts, the one matching your current account is used.
            </Paragraph>
            <div className={cl("tools-buttons")}>
                <Button variant="secondary" disabled={busy} onClick={() => fileInput.current?.click()}>
                    Import BetterDiscord config...
                </Button>
            </div>
            <input
                ref={fileInput}
                type="file"
                accept=".json,application/json"
                style={{ display: "none" }}
                onChange={onImportFile}
            />
        </div>
    );
}
