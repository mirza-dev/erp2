/**
 * G11 audit 5. tur Fix 2 — page.tsx tüm hesaplar promisable üzerinden.
 *
 * Önceki: computeSuggestion + mobil kart + masaüstü tablo `p.available_now`
 * kullanıyordu → backend (purchase-copilot route) promisable kullandığından
 * UI'daki suggestQty/coverage/urgency backend'le çelişebiliyordu.
 *
 * Yeni: computeSuggestion ve computeRowStock helper'ları `p.promisable
 * ?? p.available_now` ile çalışır → backend ile semantik eşleşme.
 */
import { describe, it, expect, vi } from "vitest";
import type { Product } from "@/lib/mock-data";

// page.tsx React component import etmemek için side-effect chain mock'lanır
vi.mock("@/lib/data-context", () => ({ useData: () => ({ reorderSuggestions: [], refetchAll: () => {} }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

import { computeSuggestion, computeRowStock } from "@/app/dashboard/purchase/suggested/page";

function makeProduct(overrides: Partial<Product> = {}): Product {
    return {
        id: "p-1",
        name: "Test",
        sku: "T-1",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 50,
        reserved: 0,
        available_now: 50,
        quoted: 0,
        promisable: 50,
        incoming: 0,
        forecasted: 50,
        minStockLevel: 20,
        isActive: true,
        productType: "commercial",
        warehouse: "Ana Depo",
        reorderQty: 10,
        preferredVendor: null,
        dailyUsage: null,
        leadTimeDays: null,
        stockoutDate: null,
        orderDeadline: null,
        ...overrides,
    } as Product;
}

describe("computeSuggestion — promisable bazlı hesaplama", () => {
    it("promisable=10, target=40 → needed=30, suggestQty=30 (moq aliquot)", () => {
        // available_now=50, quoted=40 → promisable=10
        // target = min*2 = 40 (fallback formula, dailyUsage=null)
        // needed = max(0, 40-10) = 30
        // suggestQty = max(moq=10, ceil(30/10)*10) = 30
        const p = makeProduct({ available_now: 50, quoted: 40, promisable: 10, minStockLevel: 20, reorderQty: 10 });
        const result = computeSuggestion(p);
        expect(result.suggestQty).toBe(30);
        expect(result.target).toBe(40);
    });

    it("p.promisable null → fallback p.available_now (regresyon)", () => {
        // promisable null → kullanım p.available_now=50; target=40 → needed=0 → moq=10
        const p = makeProduct({ available_now: 50, quoted: 0, promisable: undefined as unknown as number, minStockLevel: 20 });
        const result = computeSuggestion(p);
        expect(result.suggestQty).toBe(10); // moq fallback
    });

    it("Quote yoksa (quoted=0, promisable=available_now) eski davranış (regresyon)", () => {
        // available=5, quoted=0, min=20 → promisable=5
        // target = min*2 = 40, needed = 35, suggestQty = max(10, ceil(35/10)*10) = 40
        const p = makeProduct({ available_now: 5, quoted: 0, promisable: 5, minStockLevel: 20, reorderQty: 10 });
        const result = computeSuggestion(p);
        expect(result.suggestQty).toBe(40);
    });

    it("promisable<0 (over-quoted) → needed=target, suggestQty target'ı karşılar", () => {
        // available=10, quoted=15 → promisable=-5 → needed=max(0, 40-(-5))=45 → suggestQty=50
        const p = makeProduct({ available_now: 10, quoted: 15, promisable: -5, minStockLevel: 20, reorderQty: 10 });
        const result = computeSuggestion(p);
        expect(result.suggestQty).toBe(50);
    });

    it("Backend hesabıyla aynı (regression to route.ts:138-145)", () => {
        // available=100, quoted=80 → promisable=20, target = lead-time formula
        // dailyUsage=2, leadTime=10 → leadTimeDemand=20, target=20+min(20)=40
        // needed = max(0, 40-20) = 20, suggestQty = max(10, ceil(20/10)*10) = 20
        const p = makeProduct({
            available_now: 100, quoted: 80, promisable: 20,
            minStockLevel: 20, reorderQty: 10,
            dailyUsage: 2, leadTimeDays: 10,
        });
        const result = computeSuggestion(p);
        expect(result.target).toBe(40);
        expect(result.suggestQty).toBe(20);
        expect(result.formula).toBe("lead_time");
    });
});

describe("computeRowStock — UI satır görüntülemesi promisable bazlı", () => {
    it("promisable=10, min=20 → stock=10, urgency=50%", () => {
        const p = makeProduct({ available_now: 50, quoted: 40, promisable: 10, minStockLevel: 20 });
        const r = computeRowStock(p);
        expect(r.stock).toBe(10);
        expect(r.urgency).toBe(50); // round((1 - 10/20) * 100)
    });

    it("promisable=0, min=20 → urgency=100% (kritik)", () => {
        const p = makeProduct({ available_now: 50, quoted: 50, promisable: 0, minStockLevel: 20 });
        const r = computeRowStock(p);
        expect(r.stock).toBe(0);
        expect(r.urgency).toBe(100);
    });

    it("promisable=20, dailyUsage=2 → daysLeft=10", () => {
        const p = makeProduct({ available_now: 100, quoted: 80, promisable: 20, dailyUsage: 2 });
        const r = computeRowStock(p);
        expect(r.daysLeft).toBe(10);
    });

    it("promisable null → fallback available_now (regresyon)", () => {
        const p = makeProduct({ available_now: 50, promisable: undefined as unknown as number, minStockLevel: 20 });
        const r = computeRowStock(p);
        expect(r.stock).toBe(50);
    });

    it("promisable<0 (over-quoted) → urgency clamp 100%", () => {
        const p = makeProduct({ available_now: 10, quoted: 15, promisable: -5, minStockLevel: 20 });
        const r = computeRowStock(p);
        expect(r.urgency).toBeGreaterThanOrEqual(100);
    });

    it("dailyUsage null → daysLeft null (veri yok)", () => {
        const p = makeProduct({ promisable: 10, dailyUsage: null });
        const r = computeRowStock(p);
        expect(r.daysLeft).toBeNull();
    });

    it("min=0 → urgency=100% (sentinel)", () => {
        const p = makeProduct({ available_now: 0, promisable: 0, minStockLevel: 0 });
        const r = computeRowStock(p);
        expect(r.urgency).toBe(100);
    });
});
