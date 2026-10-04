/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { classNameFactory } from "@utils/css";
import { IconUtils, moment } from "@webpack/common";

import type { Field } from "./constants";

export const cl = classNameFactory("vc-profilechanges-");

export function formatTimestamp(timestamp: number) {
    return moment(timestamp).format("L LTS");
}

/** CDN url of an avatar or banner hash, as it was when the change was logged */
export function getImageUrl(field: Field, userId: string, hash: string) {
    try {
        if (field === "avatar") {
            return IconUtils.getUserAvatarURL({ id: userId, avatar: hash || null, discriminator: "0" } as any, true, 128);
        }
        if (field === "banner" && hash) {
            return IconUtils.getUserBannerURL({ id: userId, banner: hash, canAnimate: true, size: 480 });
        }
    } catch { /* Discord changed its icon helpers, show no image */ }
    return undefined;
}

/** "#5865f2 #eb459e" -> ["#5865f2", "#eb459e"] */
export function parseColors(value: string) {
    return value.split(" ").filter(Boolean);
}

export function truncate(text: string, max: number) {
    const singleLine = text.replace(/\s+/g, " ").trim();
    return singleLine.length > max ? singleLine.slice(0, max - 1) + "…" : singleLine;
}
