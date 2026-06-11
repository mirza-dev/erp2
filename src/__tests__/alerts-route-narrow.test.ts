/**
 * /api/alerts daraltma + finance cache (perf Faz 5) kilitleri.
 *  - GET /api/alerts dar kolon + limit geçer (~479KB → ~80KB); kolon listesi
 *    UI tüketicilerinin okuduğu TÜM alanları kapsar (OpenAlert + ürün
 *    sayfalarının entity_id/resolved_at kullanımı).
 *  - dbListAlerts default davranışı DEĞİŞMEZ (scan/dedup + ops-summary tam satır).
 *  - finance route COGS RPC'si products-tag'li unstable_cache arkasında;
 *    canViewCosts/reportingCurrency cache DIŞINDA kalır (RBAC sızmaz).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("GET /api/alerts — dar kolon + limit", () => {
    const route = read("src/app/api/alerts/route.ts");

    it("limit 500 + kolon listesi geçer", () => {
        expect(route).toMatch(/limit: 500/);
        expect(route).toMatch(/columns: "/);
    });

    it("kolon listesi UI'nin okuduğu tüm alanları kapsar", () => {
        const m = route.match(/columns: "([^"]+)"/);
        expect(m).not.toBeNull();
        const cols = new Set(m![1].split(","));
        // OpenAlert (data-context) alanları
        for (const f of ["id", "severity", "title", "description", "type", "source", "ai_confidence", "created_at", "entity_id"]) {
            expect(cols.has(f), f).toBe(true);
        }
        // status filtresi (alertsFetcher open+ack) + ürün sayfaları + Notlar alanları
        for (const f of ["status", "entity_type", "resolved_at", "due_date", "created_by"]) {
            expect(cols.has(f), f).toBe(true);
        }
        // büyük AI alanları listede TAŞINMAZ
        expect(cols.has("ai_inputs_summary")).toBe(false);
        expect(cols.has("ai_reason")).toBe(false);
    });
});

describe("dbListAlerts — default davranış korunur", () => {
    const src = read("src/lib/supabase/alerts.ts");

    it("opts verilmezse select('*') + limitsiz (scan/dedup kırılmaz)", () => {
        expect(src).toMatch(/\.select\(opts\.columns \?\? "\*"\)/);
        expect(src).toMatch(/if \(opts\.limit\)\s+query = query\.limit\(opts\.limit\)/);
    });

    it("alert-service scan/dedup yolları opts GEÇMEZ (tam satır okur)", () => {
        const svc = read("src/lib/services/alert-service.ts");
        // dbListAlerts çağrıları: serviceListAlerts passthrough dışındakiler tek argümanlı kalır
        const calls = svc.match(/dbListAlerts\(([^)]*)\)/g) ?? [];
        const nonPassthrough = calls.filter(c => !c.includes("opts"));
        for (const c of nonPassthrough) {
            expect(c).not.toMatch(/columns/);
        }
    });
});

describe("/api/dashboard/finance — COGS cache (1.7s RPC)", () => {
    const route = read("src/app/api/dashboard/finance/route.ts");

    it("dbGetMonthlyCogs unstable_cache arkasında, products tag'li", () => {
        expect(route).toMatch(/unstable_cache\(\s*async \(startStr: string\) => dbGetMonthlyCogs\(startStr\)/);
        expect(route).toMatch(/tags: \["products", "finance-cogs"\]/);
        expect(route).toMatch(/getCachedMonthlyCogs\(startStr\)/);
    });

    it("RBAC cache dışında: canViewCosts cache key'ine girmez", () => {
        // perms route handler'da per-request çözülür; cache fonksiyonu YALNIZ
        // startStr alır (perms/canViewCosts cache key'ine giremez — imza kilidi).
        expect(route).toMatch(/const perms = await getCurrentUserPermissions\(req\)/);
        expect(route).toMatch(/unstable_cache\(\s*async \(startStr: string\) => dbGetMonthlyCogs\(startStr\),/);
        expect(route).toMatch(/getCachedMonthlyCogs\(startStr\)/);
        expect(route).not.toMatch(/getCachedMonthlyCogs\([^)]*perms/);
    });
});
