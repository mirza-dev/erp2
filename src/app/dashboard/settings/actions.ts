"use server";

import { headers } from "next/headers";

async function internalFetch(path: string, method: string) {
    const h = await headers();
    const host = h.get("host") || "localhost:3000";
    const proto = h.get("x-forwarded-proto") || "http";
    const base = `${proto}://${host}`;
    const secret = process.env.CRON_SECRET;

    const res = await fetch(`${base}${path}`, {
        method,
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
        throw new Error(body?.error ?? `HTTP ${res.status}`);
    }
    return body;
}

export async function seedDelete() {
    return internalFetch("/api/seed", "DELETE");
}

export async function seedPost() {
    return internalFetch("/api/seed", "POST");
}

export async function alertScan() {
    return internalFetch("/api/alerts/scan?force=true", "POST");
}
