/**
 * Faz 1 koruma kontrol listesi (no-silent-deletes) — kaynak regresyonu.
 * Takvim yeniden yazımı sonrası tüm mevcut davranışların page.tsx'te
 * korunduğunu kilitler. Davranışın kendisi endpoint/helper testleriyle
 * ayrıca kapsanır; bu dosya "kaybolmadı" güvencesidir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const src = readFileSync(resolve(process.cwd(), "src/app/dashboard/alerts/page.tsx"), "utf-8");

describe("alerts takvim — korunan davranışlar", () => {
    it("zengin fetch /api/alerts/calendar + /api/products", () => {
        expect(src).toContain("/api/alerts/calendar");
        expect(src).toContain("/api/products");
    });

    it("Tara (scan) → /api/alerts/scan?force=true", () => {
        expect(src).toContain("/api/alerts/scan?force=true");
        expect(src).toMatch(/const handleRefresh\s*=\s*async/);
    });

    it("AI Analiz (ai-suggest) → /api/alerts/ai-suggest + aiAvailable kontrolü", () => {
        expect(src).toContain("/api/alerts/ai-suggest");
        expect(src).toMatch(/data\.aiAvailable/);
    });

    it("acknowledge / resolve / dismiss → PATCH /api/alerts/[id]", () => {
        expect(src).toMatch(/status:\s*["']acknowledged["']/);
        expect(src).toMatch(/status:\s*["']resolved["']/);
        expect(src).toMatch(/status:\s*["']dismissed["']/);
        expect(src).toMatch(/\/api\/alerts\/\$\{alertId\}/);
    });

    it("toplu yoksay (gün) — 24h bypass mesajı korunur", () => {
        expect(src).toMatch(/const bulkDismiss\s*=\s*async/);
        expect(src).toMatch(/const dismissDay\s*=/);
        expect(src).toContain("24 saat içinde durum kötüleşmezse yeniden açılmaz");
        expect(src).toContain("Promise.allSettled");
    });

    it("ürün-bazlı toplu yoksay korunur (eski grup-yoksay paritesi)", () => {
        expect(src).toMatch(/const dismissProduct\s*=/);
        expect(src).toMatch(/a\.entity_id === entityId/);
        expect(src).toContain("onDismissProduct={dismissProduct}");
    });

    it("sync retry → /api/alerts/[id]/sync-retry", () => {
        expect(src).toMatch(/\/api\/alerts\/\$\{alertId\}\/sync-retry/);
        expect(src).toMatch(/const retrySyncAlert\s*=\s*async/);
    });

    it("demo guard tüm mutasyonlarda (DEMO_BLOCK_TOAST)", () => {
        // her mutasyon handler'ı başında isDemo guard
        const guards = src.match(/if \(isDemo\) \{ toast\(\{ type: "info", message: DEMO_BLOCK_TOAST \}\); return; \}/g) ?? [];
        expect(guards.length).toBeGreaterThanOrEqual(6); // refresh, ai, ack, resolve, dismiss, dismissDay, syncRetry
    });

    it("AI servisi kullanılamıyor banner'ı korunur", () => {
        expect(src).toContain("AiUnavailableBanner");
        expect(src).toMatch(/not_configured|ANTHROPIC_API_KEY/);
    });

    it("ürün stok istatistikleri drawer'a aktarılır (CalendarAlert.product)", () => {
        expect(src).toContain("toCalendarAlert");
        expect(src).toContain("computeCoverageDays");
        expect(src).toMatch(/shortReason|shortImpact/);
    });

    it("takvim bileşenleri + drawer mount edilir", () => {
        expect(src).toContain("CalendarHeader");
        expect(src).toContain("CalendarGrid");
        expect(src).toContain("DayDetailPanel");
        expect(src).toContain("AlertCalendarDrawer");
        expect(src).toContain("ClassificationTabs");
    });
});
