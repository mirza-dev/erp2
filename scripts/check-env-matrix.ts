/**
 * Kurulum doğrulaması — env → özellik sağlığı tablosu (onboarding, 2026-09-16).
 *
 * `npm run kurulum:dogrula` zincirinin üçüncü halkası (preflight:auth →
 * check-migrations → BU). Ayarlar › Sistem Durumu kartıyla AYNI kaynağı okur
 * (`src/lib/system-status.ts`) — iki yüzey ayrışamaz. Değer basmaz, yalnız
 * VAR/YOK + etki.
 *
 * Çıkış kodu: zorunlu sınıfta `danger` varsa 1 (deploy'u durdur), aksi 0.
 * `sessiz`/`deger` sınıfındaki eksikler uyarı olarak listelenir, durdurmaz —
 * kapalı Paraşüt veya Redis'siz tek instance meşru teslim hâlleridir.
 *
 * Yalnız `.env.local` okunur (diğer preflight'larla aynı desen; dotenv yok).
 * Prod ortamını ölçmek için Coolify'da `npm run kurulum:dogrula` koşturulur —
 * orada `process.env` zaten dolu gelir.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { buildSystemStatus, type SystemStatusClass, type SystemStatusTone } from "../src/lib/system-status";

const envPath = join(process.cwd(), ".env.local");
if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
    }
}

// Script tarafında AI anahtarı probe EDİLMEZ (token yakmaz); kart "geçerlilik
// ölçülmedi" der. Gerçek geçerlilik Ayarlar › Sistem Durumu'nda görünür.
const report = buildSystemStatus(process.env, { reason: "unknown" });

const ICON: Record<SystemStatusTone, string> = { ok: "✅", warning: "⚠️", danger: "❌", info: "ℹ️" };
const TITLE: Record<SystemStatusClass, string> = {
    zorunlu: "ZORUNLU — eksikse uygulama açılmaz/kilitlenir",
    sessiz: "SESSİZCE KAPANAN — build yeşil, özellik ölü",
    deger: "DOĞRU DEĞER GEREKTİREN — yanlışsa yanlış çalışır",
};

console.log("[kurulum:dogrula] Sistem durumu (env → özellik)\n");
for (const klass of ["zorunlu", "sessiz", "deger"] as SystemStatusClass[]) {
    console.log(`── ${TITLE[klass]}`);
    for (const it of report.items.filter(i => i.klass === klass)) {
        console.log(`  ${ICON[it.tone]} ${it.label}: ${it.state}`);
        if (it.tone !== "ok") console.log(`     → ${it.impact}  [${it.env.join(", ")}]`);
    }
    console.log("");
}

const { summary } = report;
console.log(`Özet: ✅ ${summary.ok} · ⚠️ ${summary.warning} · ❌ ${summary.danger} · ℹ️ ${summary.info}`);

const blocking = report.items.filter(i => i.klass === "zorunlu" && i.tone === "danger");
if (blocking.length > 0) {
    console.error(`\n[kurulum:dogrula] DURDUR — zorunlu sınıfta ${blocking.length} eksik: ${blocking.map(b => b.label).join(", ")}`);
    process.exit(1);
}
console.log("\n[kurulum:dogrula] OK — zorunlu sınıf tam. Uyarıları Ayarlar › Sistem Durumu'ndan da izleyebilirsiniz.");
