/**
 * GATE: RUM endpoint allowlist senkron (2026-08 Y5).
 *
 * `known-endpoints.ts` elle düzenlenmez — dosya sistemindeki gerçek route ve
 * sayfa dizininden türer. Yeni bir uç/sayfa eklenip listeye yansımazsa o ucun
 * performans ölçümü SESSİZCE düşer; liste bayat kalıp silinen route'ları
 * taşırsa da saldırı yüzeyi gereksiz büyür. Bu gate iki yönü de tutar.
 *
 * `route-guard-matrix` ile aynı kalıp: iddia dizini ENUMERATE eder.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { KNOWN_ENDPOINTS } from "@/lib/telemetry/known-endpoints";
import { normalizeEndpoint } from "@/lib/telemetry/endpoint";

/** Dosya yolundan normalize route şablonu üretir (jeneratörle AYNI kural). */
function templatesFrom(baseDir: string, prefix: string, leaf: string): string[] {
    const out: string[] = [];
    const walk = (dir: string, segs: string[]) => {
        for (const entry of readdirSync(dir)) {
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) {
                // route group `(x)` ve paralel `@x` segmentleri URL'de görünmez
                if (/^[(@]/.test(entry)) walk(p, segs);
                else walk(p, [...segs, entry]);
            } else if (entry === leaf) {
                const norm = segs.map((seg) => {
                    const m = seg.match(/^\[\.{0,3}(\w+)\]$/);
                    if (!m) return seg.toLowerCase();
                    // normalizeEndpoint DEĞERE bakar: uuid/sayı → [id], 24+ → [token]
                    return m[1].toLowerCase() === "token" ? "[token]" : "[id]";
                });
                out.push(`${prefix}${norm.length ? "/" + norm.join("/") : ""}`);
            }
        }
    };
    walk(baseDir, []);
    return out;
}

const actual = new Set([
    ...templatesFrom(join(process.cwd(), "src/app/api"), "/api", "route.ts"),
    ...templatesFrom(join(process.cwd(), "src/app/dashboard"), "/dashboard", "page.tsx"),
]);

describe("GATE — RUM endpoint allowlist", () => {
    it("tarama gerçekten koştu", () => {
        expect(actual.size).toBeGreaterThan(100);
    });

    it("dosya sistemindeki her route/sayfa listede var", () => {
        const missing = [...actual].filter((t) => !KNOWN_ENDPOINTS.has(t)).sort();
        expect(
            missing,
            `RUM allowlist'te EKSİK şablon(lar):\n  ${missing.join("\n  ")}\n` +
            "→ `src/lib/telemetry/known-endpoints.ts` yeniden üretilmeli; aksi hâlde bu " +
            "uçların performans ölçümü sessizce atılır (Y5).",
        ).toEqual([]);
    });

    it("listede dosya sisteminde karşılığı olmayan şablon yok (bayat kayıt)", () => {
        const stale = [...KNOWN_ENDPOINTS].filter((t) => !actual.has(t)).sort();
        expect(
            stale,
            `RUM allowlist'te BAYAT şablon(lar):\n  ${stale.join("\n  ")}\n` +
            "→ Silinen route'lar listeden de düşmeli.",
        ).toEqual([]);
    });

    it("listedeki her şablon normalizasyondan DEĞİŞMEDEN geçer", () => {
        // Aksi hâlde allowlist hiçbir zaman eşleşmezdi: `normalizeEndpoint`'in
        // çıktısı listeyle aynı biçimde olmak zorunda.
        const mismatched = [...KNOWN_ENDPOINTS]
            .filter((t) => normalizeEndpoint(t) !== t)
            .sort();
        expect(mismatched, mismatched.join("\n")).toEqual([]);
    });
});
