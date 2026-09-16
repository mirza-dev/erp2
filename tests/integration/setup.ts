import dotenv from "dotenv";
import path from "path";

/**
 * Her worker'da: `.env.local` yüklenir (vitest onu kendiliğinden okumaz) ve hedef
 * FAIL-CLOSED doğrulanır. `preflight:env` yalnız CANLI ref'i tanır ("bilinmeyen = prod
 * değil"); bu kapı tersini yapar — yerel olmayan HER hedef reddedilir, çünkü testler
 * satır YAZAR ve siler. Bilinmeyen bir URL'de sessizce koşmak kabul edilemez.
 */
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

export function assertLocalTarget(url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""): URL {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`NEXT_PUBLIC_SUPABASE_URL geçersiz/boş (${JSON.stringify(url)}) — .env.local yerel profile mi bakıyor?`);
    }
    if (!LOCAL_HOSTS.has(parsed.hostname)) {
        throw new Error(
            `Entegrasyon kapısı YALNIZ yerel Supabase'e karşı koşar; hedef ${parsed.host}. ` +
            "`.env.local` canlı profile bakıyor — docs/yerel-gelistirme.md § Env geçişi.",
        );
    }
    return parsed;
}

assertLocalTarget();
