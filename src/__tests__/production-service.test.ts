/**
 * production-service — serviceCreateProductionEntry
 * Covers:
 *   - Validation fast-fail (product_id eksik, produced_qty <= 0)
 *   - dbCompleteProduction çağrısı (happy path)
 *   - Başarı ve hata sonuçları
 *   - Shortage resolution non-fatal (throw etse bile success döner)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbCompleteProduction = vi.fn();
const mockDbTryResolveShortages = vi.fn();

vi.mock("@/lib/supabase/production", () => ({
    dbCompleteProduction: (...args: unknown[]) => mockDbCompleteProduction(...args),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbTryResolveShortages: (...args: unknown[]) => mockDbTryResolveShortages(...args),
}));

import { serviceCreateProductionEntry } from "@/lib/services/production-service";

beforeEach(() => {
    mockDbCompleteProduction.mockReset();
    mockDbTryResolveShortages.mockReset();
    mockDbTryResolveShortages.mockResolvedValue(undefined);
});

describe("serviceCreateProductionEntry — validation", () => {
    it("product_id eksikse hata döner, dbCompleteProduction çağrılmaz", async () => {
        const result = await serviceCreateProductionEntry({
            product_id: "",
            produced_qty: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(mockDbCompleteProduction).not.toHaveBeenCalled();
    });

    it("produced_qty = 0 → hata döner, dbCompleteProduction çağrılmaz", async () => {
        const result = await serviceCreateProductionEntry({
            product_id: "prod-1",
            produced_qty: 0,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
        expect(mockDbCompleteProduction).not.toHaveBeenCalled();
    });

    it("produced_qty negatif → hata döner", async () => {
        const result = await serviceCreateProductionEntry({
            product_id: "prod-1",
            produced_qty: -5,
        });

        expect(result.success).toBe(false);
        expect(mockDbCompleteProduction).not.toHaveBeenCalled();
    });
});

describe("serviceCreateProductionEntry — happy path", () => {
    it("geçerli input → dbCompleteProduction doğru args ile çağrılır", async () => {
        mockDbCompleteProduction.mockResolvedValue({ success: true, entry_id: "entry-1" });

        await serviceCreateProductionEntry({
            product_id: "prod-1",
            produced_qty: 5,
            scrap_qty: 1,
            notes: "test",
        });

        expect(mockDbCompleteProduction).toHaveBeenCalledWith(
            expect.objectContaining({
                product_id: "prod-1",
                produced_qty: 5,
                scrap_qty: 1,
                notes: "test",
            })
        );
    });

    it("dbCompleteProduction success → { success: true, entry_id } döner", async () => {
        mockDbCompleteProduction.mockResolvedValue({ success: true, entry_id: "entry-42" });

        const result = await serviceCreateProductionEntry({
            product_id: "prod-1",
            produced_qty: 10,
        });

        expect(result.success).toBe(true);
        expect(result.entry_id).toBe("entry-42");
    });

    it("dbCompleteProduction success → dbTryResolveShortages çağrılır", async () => {
        mockDbCompleteProduction.mockResolvedValue({ success: true, entry_id: "entry-1" });

        await serviceCreateProductionEntry({ product_id: "prod-1", produced_qty: 10 });

        expect(mockDbTryResolveShortages).toHaveBeenCalledWith("prod-1");
    });
});

describe("serviceCreateProductionEntry — hata durumları", () => {
    it("dbCompleteProduction failure → { success: false, error, shortages } döner", async () => {
        const shortages = [{ component_product_id: "comp-1", required_qty: 5, available_qty: 2 }];
        mockDbCompleteProduction.mockResolvedValue({
            success: false,
            error: "Yetersiz bileşen stoğu",
            shortages,
        });

        const result = await serviceCreateProductionEntry({
            product_id: "prod-1",
            produced_qty: 10,
        });

        expect(result.success).toBe(false);
        expect(result.error).toBe("Yetersiz bileşen stoğu");
        expect(result.shortages).toEqual(shortages);
    });

    it("dbTryResolveShortages throw ederse sonuç hâlâ success (non-fatal)", async () => {
        mockDbCompleteProduction.mockResolvedValue({ success: true, entry_id: "entry-1" });
        mockDbTryResolveShortages.mockRejectedValue(new Error("shortage resolution failed"));

        const result = await serviceCreateProductionEntry({
            product_id: "prod-1",
            produced_qty: 10,
        });

        expect(result.success).toBe(true);
        expect(result.entry_id).toBe("entry-1");
    });
});
