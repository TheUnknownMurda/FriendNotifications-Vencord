/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Span } from "@components/Span";
import { classNameFactory } from "@utils/css";
import { classes } from "@utils/misc";
import { React } from "@webpack/common";

import { BaseStatus, STATUS_COLORS } from "./constants";

export const cl = classNameFactory("vc-friendnotif-");

export function StatusDot({ status, mobile, className }: { status: string; mobile?: boolean; className?: string; }) {
    const color = STATUS_COLORS[status as BaseStatus] ?? STATUS_COLORS.offline;

    if (mobile) {
        return (
            <svg className={classes(cl("status-mobile"), className)} viewBox="0 0 24 24" width="12" height="16" aria-label={`${status} (mobile)`}>
                <title>{status} (mobile)</title>
                <rect x="5" y="1" width="14" height="22" rx="2.5" fill={color} />
                <rect x="9.5" y="3.5" width="5" height="1.4" rx="0.7" fill="rgb(0 0 0 / 35%)" />
                <circle cx="12" cy="20" r="1.2" fill="rgb(0 0 0 / 35%)" />
            </svg>
        );
    }

    return <span className={classes(cl("status-dot"), className)} style={{ backgroundColor: color }} title={status} />;
}

export function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange(page: number): void; }) {
    if (pageCount <= 1) return null;

    return (
        <div className={cl("pagination")}>
            <Button size="small" variant="secondary" disabled={page <= 0} onClick={() => onChange(page - 1)}>
                Previous
            </Button>
            <Span size="sm">Page {page + 1} / {pageCount}</Span>
            <Button size="small" variant="secondary" disabled={page >= pageCount - 1} onClick={() => onChange(page + 1)}>
                Next
            </Button>
        </div>
    );
}
