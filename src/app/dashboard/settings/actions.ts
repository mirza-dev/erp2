"use server";

function getBaseUrl() {
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    return `http://localhost:${process.env.PORT ?? 3000}`;
}

async function internalFetch(path: string, method: string): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    try {
        const base = getBaseUrl();
        const secret = process.env.CRON_SECRET;

        const res = await fetch(`${base}${path}`, {
            method,
            headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        });

        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            return { ok: false, error: body?.error ?? `HTTP ${res.status}` };
        }
        return { ok: true, data: body };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Bilinmeyen hata" };
    }
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
