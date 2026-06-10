/**
 * Uyarılar tutarlılık turu (2026-06-11) — regression kilitleri.
 *
 * Kilitlenen davranışlar:
 *  1. Sidebar/aktif sayaç open+acknowledged sayar (sayfa istatistiğiyle aynı tanım)
 *  2. Yoksay UI'da satırı SİLMEZ — dismissed işaretler (refetch tutarlılığı)
 *  3. order_deadline metin tazeleme yerinde olur; deadline_text_refresh churn'ü geri gelmez
 *  4. Takvim route'u parametresiz çağrıda sınırsız listeye dönmez
 *  5. AI üretimi toptan source-dismiss churn'üne geri dönmez
 *  6. Ölü satın alma zinciri (purchase/scan + suggestions + purchase-service) geri gelmez
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("data-context — aktif uyarı tanımı", () => {
    it("open + acknowledged birlikte sayılır (yalnız-open'a dönüş yasak)", () => {
        const src = read("src/lib/data-context.tsx");
        expect(src).toMatch(/a\.status === "open" \|\| a\.status === "acknowledged"/);
    });
});

describe("alerts page — yoksay davranışı", () => {
    const src = read("src/app/dashboard/alerts/page.tsx");

    it("tekil yoksay: satır silinmez, dismissed işaretlenir", () => {
        expect(src).toMatch(/patchStatus\(alertId, "dismissed"\)/);
    });

    it("toplu yoksay: map ile status patch (filter ile silme yok)", () => {
        expect(src).toMatch(/ok\.has\(a\.id\) \? \{ \.\.\.a, status: "dismissed" as const \} : a/);
    });
});

describe("alert-service — churn kilitleri", () => {
    const src = read("src/lib/services/alert-service.ts");

    it("order_deadline aynı severity'de dbUpdateActiveAlertContent ile tazelenir", () => {
        expect(src).toMatch(/dbUpdateActiveAlertContent\("order_deadline", entityId/);
        expect(src).not.toMatch(/deadline_text_refresh/);
    });

    it("AI üretimi toptan dbDismissAlertsBySource kullanmaz (seçici resolve/dismiss)", () => {
        expect(src).not.toMatch(/dbDismissAlertsBySource/);
        expect(src).toMatch(/ai_finding_cleared/);
        expect(src).toMatch(/legacy_entityless_ai_alert/);
    });

    it("AI bulguları entity-bağlı yazılır (entity_id: f.productId)", () => {
        expect(src).toMatch(/entity_id: f\.productId/);
    });
});

describe("takvim route — sınırlı pencere", () => {
    it("parametresiz çağrı dbListAlertsForCalendar kullanır", () => {
        const src = read("src/app/api/alerts/calendar/route.ts");
        expect(src).toMatch(/dbListAlertsForCalendar\(\)/);
    });

    it("dbListAlertsForCalendar: aktifler limitsiz pencere DEĞİL — explicit limit + kapanmışlara tarih penceresi", () => {
        const src = read("src/lib/supabase/alerts.ts");
        expect(src).toMatch(/\.limit\(5000\)/);
        expect(src).toMatch(/\.gte\("created_at", cutoff\.toISOString\(\)\)/);
    });
});

describe("ölü satın alma zinciri geri gelmez", () => {
    it.each([
        "src/app/api/purchase/scan/route.ts",
        "src/app/api/purchase/suggestions/route.ts",
        "src/lib/services/purchase-service.ts",
    ])("%s dosyası yok", (p) => {
        expect(existsSync(join(process.cwd(), p))).toBe(false);
    });
});
