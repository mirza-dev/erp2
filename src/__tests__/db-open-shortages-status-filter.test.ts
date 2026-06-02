/**
 * dbGetOpenShortagesByProduct / dbGetOpenShortagesByProductId — status filtresi.
 * Migration 082: rezervasyon (+ shortage) artık pending_approval'da oluşuyor →
 * order_shortage uyarısı + drawer pending_approval shortage'larını da SAYMALI
 * (yoksa eksik sipariş onaylanana kadar uyarı akışında görünmez).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIn = vi.fn();
const mockEq2 = vi.fn();   // detail: ikinci .eq (status) sonrası .in
const mockEqStatus = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

const mockFrom = vi.fn();

import { dbGetOpenShortagesByProduct, dbGetOpenShortagesByProductId } from "@/lib/supabase/products";

beforeEach(() => {
    mockFrom.mockReset();
    mockIn.mockReset().mockResolvedValue({ data: [], error: null });
    mockEq2.mockReset();
    mockEqStatus.mockReset();
});

describe("dbGetOpenShortagesByProduct — pending_approval + approved sayar (082)", () => {
    it("filtre .in(['pending_approval','approved'])", async () => {
        // zincir: from('shortages').select().eq('status','open').in(commercial_status, [...])
        mockEqStatus.mockReturnValue({ in: mockIn });
        mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ in: mockIn }) }) });

        await dbGetOpenShortagesByProduct();

        expect(mockFrom).toHaveBeenCalledWith("shortages");
        expect(mockIn).toHaveBeenCalledWith(
            "sales_orders.commercial_status",
            ["pending_approval", "approved"],
        );
    });
});

describe("dbGetOpenShortagesByProductId — drawer da pending + approved (082)", () => {
    it("filtre .in(['pending_approval','approved'])", async () => {
        // zincir: from('shortages').select().eq('product_id').eq('status').in(commercial_status,[...])
        mockFrom.mockReturnValue({
            select: () => ({ eq: () => ({ eq: () => ({ in: mockIn }) }) }),
        });

        await dbGetOpenShortagesByProductId("prod-1");

        expect(mockIn).toHaveBeenCalledWith(
            "sales_orders.commercial_status",
            ["pending_approval", "approved"],
        );
    });
});
