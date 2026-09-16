import dotenv from "dotenv";
import path from "path";

/**
 * Bir kez: yerel yığın ayakta mı? Değilse her test "fetch failed" ile ayrı ayrı düşmesin;
 * tek, anlaşılır mesajla dur.
 */
export default async function globalSetup() {
    dotenv.config({ path: path.join(process.cwd(), ".env.local") });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const host = (() => { try { return new URL(url).hostname; } catch { return ""; } })();
    if (!["127.0.0.1", "localhost", "[::1]"].includes(host)) {
        throw new Error(`Entegrasyon kapısı yerel Supabase ister; NEXT_PUBLIC_SUPABASE_URL=${url || "(boş)"}`);
    }
    try {
        const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "" } });
        if (!res.ok) throw new Error(`REST ${res.status}`);
    } catch (err) {
        throw new Error(
            `Yerel Supabase yanıt vermiyor (${url}): ${err instanceof Error ? err.message : String(err)}\n` +
            "Başlat: `colima start && supabase start` (docs/yerel-gelistirme.md).",
        );
    }
}
