/**
 * GATE: Route-guard matrisi — src/app/api altındaki TÜM route.ts dosyalarını
 * enumerate eder; her exported HTTP METHOD'unun gövdesi ayrı ayrı taranır.
 * Guard çağrısı içermeyen METHOD, GUARDLESS_BASELINE'da (path + method) gerekçeli
 * kayıtla eşleşmek ZORUNDA.
 *
 * A3 (2026-06-19) — METHOD-SEVİYE: Eski sürüm `guarded`'ı DOSYA-seviye hesaplıyordu
 * (`src.includes(guard)`) → bir method (örn. POST) guard kullanınca tüm dosya
 * "korunmuş" sayılıyor, guard'sız kardeş GET görünmüyordu (kampanya B'nin tekrar
 * tekrar elle bulduğu kör nokta: import/orders/customers/products-quotes/alerts).
 * Artık her method gövdesi ayrı taranır + file-local guard-helper'lar (gövdesinde
 * guard çağrısı olan dosya-yerel fonksiyon, örn. calendar-notes `context`) çözülür.
 *
 *  - Guard'sız YENİ method → test kırılır (ya guard ekle ya baseline'a gerekçeli kayıt).
 *  - Baseline'daki method guard kazanır / export'tan kalkar → STALE kayıt da kırar.
 *
 * Arka plan: docs/audit/2026-06-guvenlik-dogruluk-bulgulari.md (Y1) + A3.
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
    "requireInternalOperatorFor(",
    "guardAiRoute(",        // IP rate-limit (AI maliyet kapısı — bilinçli sınıf)
    "requireAdmin(",        // admin/users lokal guard'ı (gövdesi inline; ad direkt eşleşir)
    "checkAuth(",           // seed route'unun CRON/admin kombinasyonu
    "CRON_SECRET",          // route-içi process.env.CRON_SECRET doğrulaması (alerts/scan)
    "requireCronSecret(",   // cron-guard helper (ai-suggest, email/outbox/process)
];

const HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"];

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

/** `from`'dan sonraki ilk `{`'tan başlayıp brace-eşlemeli bloğu döndürür. */
function blockAfter(src: string, from: number): string {
    const open = src.indexOf("{", from);
    if (open === -1) return "";
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") {
            depth--;
            if (depth === 0) return src.slice(open, i + 1);
        }
    }
    return src.slice(open);
}

/**
 * File-local guard-helper'lar: gövdesinde bir GUARD_PATTERN içeren dosya-yerel
 * function/const (HTTP method'ları hariç). Bunları çağıran method "guarded" sayılır
 * (örn. calendar-notes/[id] `context()` → içinde requirePermission). admin/users
 * `requireAdmin` zaten GUARD_PATTERNS'te direkt eşleşir (gövdesi inline check).
 */
function localGuardHelpers(src: string): Set<string> {
    const names = new Set<string>();
    for (const m of src.matchAll(/(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\(/g)) {
        if (HTTP_METHODS.includes(m[1])) continue;
        if (GUARD_PATTERNS.some((g) => blockAfter(src, m.index!).includes(g))) names.add(m[1]);
    }
    for (const m of src.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::[^=]*)?=>/g)) {
        if (GUARD_PATTERNS.some((g) => blockAfter(src, m.index!).includes(g))) names.add(m[1]);
    }
    return names;
}

interface MethodStatus { name: string; guarded: boolean; }

function methodStatuses(src: string): MethodStatus[] {
    const marks = [...src.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)]
        .map((m) => ({ name: m[1], idx: m.index! }));
    const tokens = [...GUARD_PATTERNS, ...[...localGuardHelpers(src)].map((h) => h + "(")];
    return marks.map((mk, i) => {
        const end = i + 1 < marks.length ? marks[i + 1].idx : src.length;
        const body = src.slice(mk.idx, end);
        return { name: mk.name, guarded: tokens.some((t) => body.includes(t)) };
    });
}

const files = walkRoutes(API_ROOT);
const inventory = files.map((f) => ({
    key: routeKey(f),
    methods: methodStatuses(readFileSync(f, "utf8")),
}));

/** path → kasıtlı guard'sız method seti */
const baselineByPath = new Map<string, Set<string>>();
for (const b of GUARDLESS_BASELINE) {
    if (!baselineByPath.has(b.path)) baselineByPath.set(b.path, new Set());
    for (const m of b.methods) baselineByPath.get(b.path)!.add(m);
}

describe("GATE — route-guard matrisi (method-seviye)", () => {
    it("api altında en az 100 route var (enumerasyon çalışıyor)", () => {
        expect(files.length).toBeGreaterThanOrEqual(100);
    });

    it("guard'sız her METHOD baseline'da gerekçeli kayıtla eşleşir", () => {
        const violations: string[] = [];
        for (const r of inventory) {
            const allowed = baselineByPath.get(r.key) ?? new Set<string>();
            for (const m of r.methods) {
                if (!m.guarded && !allowed.has(m.name)) violations.push(`${r.key} ${m.name}`);
            }
        }
        expect(
            violations,
            `Guard'sız method(lar) baseline dışında:\n  ${violations.join("\n  ")}\n` +
            "→ Ya guard ekleyin ya da src/__tests__/gate/route-guard-baseline.ts'e " +
            "(path + method) sınıf+gerekçeyle kayıt düşün (review'da görünür karar).",
        ).toEqual([]);
    });

    it("baseline'da stale kayıt yok (guard kazanan / kalkan method düşürülür)", () => {
        const byKey = new Map(inventory.map((r) => [r.key, r]));
        const stale: string[] = [];
        for (const b of GUARDLESS_BASELINE) {
            const r = byKey.get(b.path);
            if (!r) { stale.push(`${b.path} → route dosyası artık yok`); continue; }
            for (const m of b.methods) {
                const mm = r.methods.find((x) => x.name === m);
                if (!mm) stale.push(`${b.path} ${m} → method artık export edilmiyor`);
                else if (mm.guarded) stale.push(`${b.path} ${m} → artık guard'lı, baseline'dan silin`);
            }
        }
        expect(stale, stale.join("\n")).toEqual([]);
    });

    it("ACIK-BULGU sınıfı kayıtlar rapora referans verir (gerekçe boş olamaz)", () => {
        for (const b of GUARDLESS_BASELINE) {
            expect(b.reason.length, `${b.path} gerekçesiz`).toBeGreaterThan(5);
        }
    });
});
