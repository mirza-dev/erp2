import { execFileSync } from "child_process";

/** Yerel Supabase bağlantı bilgileri (.env.local — setup.ts yükledi ve yerel olduğunu doğruladı). */
export function env() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!url || !anon || !service) throw new Error("NEXT_PUBLIC_SUPABASE_URL / ANON_KEY / SERVICE_ROLE_KEY eksik");
    return { url, anon, service };
}

export function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
    return { apikey: key, Authorization: `Bearer ${key}`, ...extra };
}

/** PostgREST / Storage isteği; gövde JSON ise parse edilir, değilse ham metin döner. */
export async function rest(
    pathname: string,
    key: string,
    init: { method?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
    const { url } = env();
    const res = await fetch(`${url}${pathname}`, {
        method: init.method ?? "GET",
        headers: headers(key, init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();
    let body: unknown = text;
    try { body = text ? JSON.parse(text) : null; } catch { /* ham metin kalır */ }
    return { status: res.status, body };
}

/** OpenAPI (`GET /rest/v1/`) tablo/görünüm listesi — service key ile (anon'da da açık ama tek kaynak). */
export async function openApiTables(): Promise<string[]> {
    const { service } = env();
    const { status, body } = await rest("/rest/v1/", service);
    if (status !== 200) throw new Error(`OpenAPI ${status}`);
    const defs = (body as { definitions?: Record<string, unknown> }).definitions ?? {};
    return Object.keys(defs).sort();
}

/**
 * `supabase db query --local` ile SQL — psql/pg bağımlılığı olmadan (`pg_class` gibi PostgREST'in
 * göremediği katmanlar için). CLI çıktısı "Connecting to local database..." satırı + JSON
 * (`{ boundary, rows }`); ilk `{` öncesi atılır.
 */
export function sql<T = Record<string, unknown>>(query: string): T[] {
    const out = execFileSync("supabase", ["db", "query", "--local", query], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 60_000,
    });
    const start = out.indexOf("{");
    if (start < 0) throw new Error(`supabase db query JSON döndürmedi: ${out.slice(0, 200)}`);
    const parsed = JSON.parse(out.slice(start)) as { rows?: T[] };
    return parsed.rows ?? [];
}
