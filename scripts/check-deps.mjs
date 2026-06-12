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
    // ŞU AN İSTİSNA YOK (2026-06-12, Next 16.2.9 yükseltmesi sonrası):
    //  - xlsx 2 GHSA → CDN 0.20.3 pin ile kapandı (Tur D)
    //  - next 16.1.7 paket-seviyesi 14 advisory → 16.2.9 yükseltmesiyle kapandı
    //  - fast-uri 2 GHSA → 3.1.2'ye update ile kapandı
    // Yeni kayıt formatı: { ghsa: "GHSA-...", pkg, reason, added } — paket-seviyesi
    // istisna ({ pkg, reason, added }, ghsa'sız) yalnız planlı yükseltmeye köprü olarak.
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
