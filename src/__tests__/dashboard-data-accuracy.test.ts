/**
 * Dashboard doğruluk turu kilitleri (2026-06-12 denetim bulguları):
 *  1. Üretim verisi pencereli+yüksek limitle çekilir — eski parametresiz çağrı
 *     default limit 50'ye düşüyordu, dönem KPI'ları sessizce eksik sayıyordu.
 *  2. Ciro yalnız approved (mig.088 pending-teklif şişirmesi) — view-model testinde.
 *  3. Kur çözülemeyince hariç tut + görünür uyarı — view-model + page kilidi.
 *  4. "Açık Alacak" kartı kaldırıldı, geri gelmez.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { productionFetchUrl } from "@/lib/data-context";

describe("üretim fetch penceresi", () => {
    it("productionFetchUrl: since = 120 gün önce + limit=5000", () => {
        const url = productionFetchUrl(new Date(2026, 5, 15)); // 15 Haziran 2026
        expect(url).toBe("/api/production?since=2026-02-15&limit=5000");
    });

    it("data-context üretimi parametresiz ÇEKMEZ (limit-50 regresyonu)", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/data-context.tsx"), "utf8");
        expect(src).not.toContain('fetch("/api/production")');
        expect(src.match(/fetch\(productionFetchUrl\(\)\)/g)?.length).toBe(3);
    });

    it("production route ?since regex-valide eder, tavan 5000", () => {
        const src = readFileSync(join(process.cwd(), "src/app/api/production/route.ts"), "utf8");
        expect(src).toMatch(/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
        expect(src).toMatch(/, 5000\)/);
    });

    it("dbListProductionEntries since → gte(production_date)", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/supabase/production.ts"), "utf8");
        expect(src).toMatch(/if \(since\) query = query\.gte\("production_date", since\)/);
    });
});

describe("kur uyarısı + Açık Alacak kaldırma (page kilitleri)", () => {
    const page = readFileSync(join(process.cwd(), "src/app/dashboard/page.tsx"), "utf8");

    it("kur uyarısı yalnız fetch settle olduktan sonra (ratesResolved guard — flash yok)", () => {
        expect(page).toMatch(/if \(!ratesResolved\) return \[\]/);
        expect(page).toContain("Kur verisi alınamadı");
        expect(page).toMatch(/setRatesResolved\(true\)/);
    });

    it("Açık Alacak page'de geri gelmez; KpiPerms yalnız canViewSalesPrices", () => {
        expect(page).not.toContain("Açık Alacak");
        expect(page).not.toContain("canViewFinancialSummary");
        expect(page).toMatch(/\{ canViewSalesPrices \}/);
    });
});
