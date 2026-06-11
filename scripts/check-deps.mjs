#!/usr/bin/env node
/**
 * GATE: bağımlılık denetimi — `npm audit --omit=dev --json` çıktısını allowlist'le
 * karşılaştırır. Allowlist DIŞI high/critical açık → exit 1 (CI kırmızı).
 *
 * Kullanım: npm audit --omit=dev --json | node scripts/check-deps.mjs
 *   (CI'da .github/workflows/test.yml "deps-gate" job'u; npm audit'in exit
 *   code'u yutulur, karar BU script'indir.)
 *
 * Allowlist kaydı = bilinçli istisna: GHSA + gerekçe + tarih. Düzeltme çıktığında
 * kayıt silinir. Bulgu: Y5 (docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md).
 */

const ALLOWLIST = [
    {
        ghsa: "GHSA-4r6h-8v6p-xvw6",
        pkg: "xlsx",
        reason: "Prototype pollution — npm'de fix yok; izole parser/exceljs geçişi Tur D (2026-06 bulguları Y5)",
        added: "2026-06-12",
    },
    {
        ghsa: "GHSA-5pgg-2g8v-p4x9",
        pkg: "xlsx",
        reason: "ReDoS — npm'de fix yok; dosya boyu limiti mevcut, kalıcı çözüm Tur D (Y5)",
        added: "2026-06-12",
    },
    {
        // PAKET-SEVİYESİ istisna (zayıf — yalnız planlı yükseltmeye köprü):
        // next 16.1.7'de 14 high advisory (proxy/middleware bypass dahil).
        // Güvenlik yükseltmesi Tur D'de; yükseltme yapılınca BU KAYDI SİL →
        // gate yeni next advisory'lerini yeniden yakalamaya başlar.
        pkg: "next",
        reason: "Next 16.1.7 bilinen advisory seti — yükseltme Tur D (2026-06 bulguları, dış rapor Kritik-1)",
        added: "2026-06-12",
    },
    {
        ghsa: "GHSA-q3j6-qgpj-74h6",
        pkg: "fast-uri",
        reason: "Transitif (ajv zinciri) — üst paket yükseltmesiyle çözülür, Tur D",
        added: "2026-06-12",
    },
    {
        ghsa: "GHSA-v39h-62p7-jpjc",
        pkg: "fast-uri",
        reason: "Transitif (ajv zinciri) — üst paket yükseltmesiyle çözülür, Tur D",
        added: "2026-06-12",
    },
];

const FAIL_LEVELS = new Set(["high", "critical"]);

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let report;
try {
    report = JSON.parse(raw);
} catch {
    console.error("[deps-gate] npm audit JSON parse edilemedi — stdin boş mu?");
    process.exit(2);
}

const vulns = report.vulnerabilities ?? {};
const allowed = new Set(ALLOWLIST.filter((a) => a.ghsa).map((a) => a.ghsa));
const allowedPkgs = new Set(ALLOWLIST.filter((a) => !a.ghsa).map((a) => a.pkg));
const failures = [];

for (const [name, v] of Object.entries(vulns)) {
    if (!FAIL_LEVELS.has(v.severity)) continue;
    if (allowedPkgs.has(name)) continue; // paket-seviyesi geçici istisna
    // via: string (transitif zincir) veya advisory objesi olabilir
    const advisories = (v.via ?? []).filter((x) => typeof x === "object");
    const ghsas = advisories.map((a) => (a.url ?? "").split("/").pop()).filter(Boolean);
    const unallowed = ghsas.filter((g) => !allowed.has(g));
    if (ghsas.length === 0) {
        // yalnız transitif referans (kök advisory başka pakette raporlanır) → atla
        continue;
    }
    if (unallowed.length > 0) {
        failures.push(`${name} (${v.severity}): ${unallowed.join(", ")}`);
    }
}

if (failures.length > 0) {
    console.error("[deps-gate] Allowlist DIŞI high/critical açık(lar):");
    for (const f of failures) console.error("  - " + f);
    console.error("→ Yükseltin veya scripts/check-deps.mjs allowlist'ine GHSA+gerekçe+tarih ile kayıt düşün.");
    process.exit(1);
}

console.log(`[deps-gate] OK — high/critical: yalnız allowlist'teki ${ALLOWLIST.length} bilinen istisna.`);
