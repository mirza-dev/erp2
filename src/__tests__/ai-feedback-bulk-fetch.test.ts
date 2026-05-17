/**
 * Faz 8 — dbGetRecentRejectionsForProducts bulk fetch helper.
 * RPC mock'lanır; sanitize JS-side davranışı doğrulanır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockRpc = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ rpc: mockRpc }),
    ConfigError: class ConfigError extends Error {
        readonly code = "CONFIG_ERROR";
        constructor(message: string) {
            super(message);
            this.name = "ConfigError";
        }
    },
}));

import { dbGetRecentRejectionsForProducts } from "@/lib/supabase/ai-feedback";

describe("dbGetRecentRejectionsForProducts", () => {
    beforeEach(() => {
        mockRpc.mockReset();
    });

    it("1. Empty productIds → boş Map, RPC çağrılmaz", async () => {
        const result = await dbGetRecentRejectionsForProducts([], 3);
        expect(result.size).toBe(0);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("2. 1 ürün + 1 not → 1 entry Map (sanitized)", async () => {
        mockRpc.mockResolvedValueOnce({
            data: [
                { entity_id: "prod-1", feedback_note: "MOQ yüksek, şu an gerek yok" },
            ],
            error: null,
        });
        const result = await dbGetRecentRejectionsForProducts(["prod-1"], 3);
        expect(result.size).toBe(1);
        expect(result.get("prod-1")).toEqual(["MOQ yüksek, şu an gerek yok"]);
    });

    it("3. 50 ürün → tek RPC çağrısı (.rpc 1 kez)", async () => {
        mockRpc.mockResolvedValueOnce({ data: [], error: null });
        const ids = Array.from({ length: 50 }, (_, i) => `prod-${i}`);
        await dbGetRecentRejectionsForProducts(ids, 3);
        expect(mockRpc).toHaveBeenCalledTimes(1);
        expect(mockRpc).toHaveBeenCalledWith(
            "get_recent_rejections_for_products",
            expect.objectContaining({ p_product_ids: ids, p_limit: 3 }),
        );
    });

    it("4. RPC hata → Error throw", async () => {
        mockRpc.mockResolvedValueOnce({ data: null, error: { message: "rpc-fail" } });
        await expect(dbGetRecentRejectionsForProducts(["prod-1"], 3))
            .rejects.toThrow("rpc-fail");
    });

    it("5. Sanitize edilince boş kalan not (sadece control char) → Map'e eklenmez", async () => {
        mockRpc.mockResolvedValueOnce({
            data: [
                { entity_id: "prod-1", feedback_note: "\x00\x01\x02" },
                { entity_id: "prod-1", feedback_note: "geçerli not" },
            ],
            error: null,
        });
        const result = await dbGetRecentRejectionsForProducts(["prod-1"], 3);
        expect(result.get("prod-1")).toEqual(["geçerli not"]);
    });

    it("6. Aynı ürünün 3 notu sıralı diziye birikir", async () => {
        mockRpc.mockResolvedValueOnce({
            data: [
                { entity_id: "prod-1", feedback_note: "en yeni" },
                { entity_id: "prod-1", feedback_note: "orta" },
                { entity_id: "prod-1", feedback_note: "en eski" },
            ],
            error: null,
        });
        const result = await dbGetRecentRejectionsForProducts(["prod-1"], 3);
        expect(result.get("prod-1")).toEqual(["en yeni", "orta", "en eski"]);
    });
});
