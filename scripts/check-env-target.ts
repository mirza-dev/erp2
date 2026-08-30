/**
 * KAPI — geliştirme canlı veritabanına bağlanmasın (READ-ONLY).
 *
 * `.env.local` canlı projeye (`PROD_PROJECT_REF`) bakıyorken `npm run dev` ve
 * E2E koşumları DURDURULUR. Kaçış kapısı bilinçli ve görünür:
 * `ALLOW_PROD_TARGET=1 npm run dev`.
 *
 * Bağlanmayanlar ve nedenleri:
 *   • `npm run backup`  — yedek ZATEN canlıyı hedeflemeli
 *   • `npm run build` / `start` — Coolify prod build'i meşru biçimde canlıyı hedefler
 *
 * Tasarım: check-auth-preflight.ts / check-migrations.ts deseni — env'i elle
 * yükler, hiçbir ağ çağrısı yapmaz, hiçbir mutasyon yok.
 *
 * Kullanım: npm run preflight:env   (predev ve pretest:e2e* ile otomatik)
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PROD_PROJECT_REF, isProdTarget, projectRefFromUrl } from "../src/lib/env-target";

// .env.local'ı elle yükle (dotenv bağımlılığı eklememek için)
const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

/**
 * Kaçış kapısı mesajında önerilecek komut. `predev` → `dev`, `pretest:e2e` →
 * `test:e2e`. `preflight:env` bir pre-hook DEĞİL (doğrudan çağrılan kapı adı),
 * ondan "pre" kırpmak `flight:env` gibi var olmayan bir komut üretirdi.
 */
function suggestedScript(): string {
    const event = process.env.npm_lifecycle_event ?? "";
    return event.startsWith("pre") && event !== "preflight:env" ? event.slice(3) : "dev";
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ref = projectRefFromUrl(url);

if (!isProdTarget(url)) {
    console.log(`[env-gate] OK — hedef: ${ref ?? "(tanınmayan/yerel)"} · canlı değil.`);
    process.exit(0);
}

if (process.env.ALLOW_PROD_TARGET === "1") {
    console.warn(
        `[env-gate] ⚠️  CANLI VERİTABANINA bağlanıyorsunuz (${PROD_PROJECT_REF}) — ` +
            "ALLOW_PROD_TARGET=1 ile bilerek izin verildi.",
    );
    process.exit(0);
}

console.error(`
[env-gate] ❌ DURDURULDU — hedef CANLI veritabanı (${PROD_PROJECT_REF}).

  Bu komut gerçek müşteri verisinin üstünde çalışacaktı: cariler, fiyatlar,
  siparişler, denetim kaydı. Geliştirme ayrı bir projede yapılmalı.

  Yapılacak:
    1) Ayrı bir Supabase projesi kurun — docs/musteri-kurulum.md
       (şema tek komutla hazır: npm run schema:bundle)
    2) .env.local'daki NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
       değerlerini o projeye çevirin

  Gerçekten canlıya bağlanmanız gerekiyorsa (hata kovalama, yedek doğrulama):
    ALLOW_PROD_TARGET=1 npm run ${suggestedScript()}
`);
process.exit(1);
