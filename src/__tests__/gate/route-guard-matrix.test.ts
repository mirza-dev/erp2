/**
 * GATE: Route-guard matrisi — src/app/api altındaki TÜM route.ts dosyalarını
 * enumerate eder; guard çağrısı içermeyenler GUARDLESS_BASELINE'da gerekçeli
 * kayıtla eşleşmek ZORUNDA.
 *
 *  - Guard'sız YENİ route → bu test kırılır (ya guard ekle ya baseline'a
 *    gerekçeli kayıt düş — PR'da görünür karar olur).
 *  - Baseline'daki route guard kazanırsa → STALE kayıt da kırar (liste yalnız
 *    küçülür; "bir kere ekle unut" çürümesi engellenir).
 *
 * Arka plan: docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md (Y1 — proxy
 * yalnız session bakar; route-içi guard'lar TEK yetki kontrolüdür).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { GUARDLESS_BASELINE } from "./route-guard-baseline";

const API_ROOT = join(process.cwd(), "src/app/api");

/** Route içinde "yetki kapısı" sayılan kalıplar (en az biri yeterli). */
const GUARD_PATTERNS = [
    "requirePermission(",
    "requireRole(",
    "requirePermissionFor(",
    "requireRoleFor(",
    "requireInternalOperator(",
    "guardAiRoute(",   // IP rate-limit (AI maliyet kapısı — bilinçli sınıf)
    "requireAdmin(",   // admin/users lokal guard'ı
    "checkAuth(",      // seed route'unun CRON/admin kombinasyonu
    "CRON_SECRET",     // route-içi cron secret doğrulaması
];

function walkRoutes(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) walkRoutes(p, acc);
        else if (entry === "route.ts") acc.push(p);
    }
    return acc;
}

function routeKey(absPath: string): string {
    return absPath
        .slice(API_ROOT.length + 1)
        .replace(/\/route\.ts$/, "")
        .replace(/\\/g, "/");
}

function exportedMethods(src: string): string[] {
    return [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)]
        .map((m) => m[1]);
}

const files = walkRoutes(API_ROOT);
const inventory = files.map((f) => {
    const src = readFileSync(f, "utf8");
    return {
        key: routeKey(f),
        methods: exportedMethods(src),
        guarded: GUARD_PATTERNS.some((g) => src.includes(g)),
    };
});

describe("GATE — route-guard matrisi", () => {
    it("api altında en az 100 route var (enumerasyon çalışıyor)", () => {
        expect(files.length).toBeGreaterThanOrEqual(100);
    });

    it("guard'sız her route baseline'da gerekçeli kayıtla eşleşir", () => {
        const baselinePaths = new Set(GUARDLESS_BASELINE.map((b) => b.path));
        const violations = inventory
            .filter((r) => r.methods.length > 0 && !r.guarded && !baselinePaths.has(r.key))
            .map((r) => `${r.key} [${r.methods.join(",")}]`);
        expect(
            violations,
            `Guard'sız route(lar) baseline dışında:\n  ${violations.join("\n  ")}\n` +
            "→ Ya guard ekleyin ya da src/__tests__/gate/route-guard-baseline.ts'e " +
            "sınıf+gerekçeyle kayıt düşün (review'da görünür karar).",
        ).toEqual([]);
    });

    it("baseline'da stale kayıt yok (guard kazanan/silinen route düşürülür)", () => {
        const byKey = new Map(inventory.map((r) => [r.key, r]));
        const stale: string[] = [];
        for (const b of GUARDLESS_BASELINE) {
            const r = byKey.get(b.path);
            if (!r) stale.push(`${b.path} → route dosyası artık yok`);
            else if (r.guarded) stale.push(`${b.path} → artık guard'lı, baseline'dan silin`);
        }
        expect(stale, stale.join("\n")).toEqual([]);
    });

    it("baseline metod listeleri gerçek export'larla uyumlu", () => {
        const byKey = new Map(inventory.map((r) => [r.key, r]));
        const drift: string[] = [];
        for (const b of GUARDLESS_BASELINE) {
            const r = byKey.get(b.path);
            if (!r) continue; // üstteki test yakalar
            const extra = r.methods.filter((m) => !b.methods.includes(m));
            if (extra.length > 0) {
                drift.push(`${b.path}: baseline dışı yeni metod ${extra.join(",")}`);
            }
        }
        expect(drift, drift.join("\n")).toEqual([]);
    });

    it("ACIK-BULGU sınıfı kayıtlar rapora referans verir (gerekçe boş olamaz)", () => {
        for (const b of GUARDLESS_BASELINE) {
            expect(b.reason.length, `${b.path} gerekçesiz`).toBeGreaterThan(5);
        }
    });
});
