/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import { Logger } from "@utils/Logger";

import { DATASTORE_PREFIX, SoundConfig, SoundKey } from "./constants";
import { settings } from "./settings";

const logger = new Logger("FriendNotifications");

// Audio files are kept as Blobs in IndexedDB (settings.json is not meant for binary data)
// and played through blob: URLs, which Discord's CSP allows unlike arbitrary external URLs.
const objectUrls = new Map<SoundKey, string>();

const storeKey = (key: SoundKey) => `${DATASTORE_PREFIX}sound:${key}`;

export function getSoundConfig(key: SoundKey): SoundConfig {
    return settings.store.notificationSounds[key] ?? { name: null, mute: false };
}

function revokeCachedUrl(key: SoundKey) {
    const url = objectUrls.get(key);
    if (url) URL.revokeObjectURL(url);
    objectUrls.delete(key);
}

export async function saveSound(key: SoundKey, blob: Blob, name: string) {
    await DataStore.set(storeKey(key), blob);
    revokeCachedUrl(key);
    settings.store.notificationSounds[key] = { ...getSoundConfig(key), name };
}

export async function removeSound(key: SoundKey) {
    await DataStore.del(storeKey(key));
    revokeCachedUrl(key);
    settings.store.notificationSounds[key] = { ...getSoundConfig(key), name: null };
}

export function setSoundMuted(key: SoundKey, mute: boolean) {
    settings.store.notificationSounds[key] = { ...getSoundConfig(key), mute };
}

async function getSoundUrl(key: SoundKey) {
    const cached = objectUrls.get(key);
    if (cached) return cached;

    const blob = await DataStore.get<Blob>(storeKey(key));
    if (!blob) return null;

    const url = URL.createObjectURL(blob);
    objectUrls.set(key, url);
    return url;
}

/** Plays the custom sound of a key, if one is set and not muted. Resolves to whether something was played. */
export async function playSound(key: SoundKey, { ignoreMute = false } = {}) {
    const config = getSoundConfig(key);
    if (!config.name || (config.mute && !ignoreMute)) return false;

    try {
        const url = await getSoundUrl(key);
        if (!url) return false;

        await new Audio(url).play();
        return true;
    } catch (e) {
        logger.error(`Failed to play the sound for "${key}"`, e);
        return false;
    }
}

/**
 * Downloads a remote audio file so it can be stored locally.
 * Discord's CSP only allows a few hosts (e.g. cdn.discordapp.com); other links will fail here.
 */
export async function fetchSoundFromUrl(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const type = response.headers.get("content-type") ?? "";
    if (!/audio|video|octet-stream/i.test(type)) {
        throw new Error("The link does not point to an audio or video file. Use a direct link ending in .mp3, .wav, .ogg, ...");
    }

    const blob = await response.blob();
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "") || "sound";
    return { blob, name };
}

export function clearSoundCache() {
    for (const key of objectUrls.keys()) revokeCachedUrl(key);
}
