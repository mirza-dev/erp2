/**
 * Faz 6 (V7-A4) — serviceSyncOrderToParasut header iskonto guard'ı.
 * discount_amount > 0 → claim ÖNCESİ early return + ZORUNLU sync_issue alert;
 * parasut_claim_sync (RPC) çağrılmaz, parasut_step/error/retry marker yazılmaz.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockGetOrder    = vi.fn();
const mockCreateAlert = vi.fn();
const mockRpc         = vi.fn();
const mockFrom        = vi.fn();
const mockCreateSyncLog = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: (...a: unknown[]) => mockGetOrder(...a) }));
vi.mock("@/lib/supabase/alerts", () => ({ dbCreateAlert: (...a: unknown[]) => mockCreateAlert(...a) }));
vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog: (...a: unknown[]) => mockCreateSyncLog(...a),
    dbGetSyncLog: vi.fn(),
    dbUpdateSyncLog: vi.fn(),
}));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ rpc: mockRpc, from: mockFrom }),
}));
vi.mock("@/lib/supabase/customers", () => ({ dbGetCustomerById: vi.fn() }));
vi.mock("@/lib/supabase/products", () => ({ dbGetProductById: vi.fn() }));
vi.mock("@/lib/services/email-service", () => ({ notifyUsersByEmail: vi.fn() }));
vi.mock("@/lib/parasut", () => ({ getParasutAdapter: vi.fn() }));

import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";

const OID = "00000000-0000-4000-8000-0000000000aa";

const baseOrder = (discount: number) => ({
    id: OID,
    order_number: "SIP-2026-001",
    commercial_status: "approved",
    fulfillment_status: "shipped",
    customer_id: "cust-1",
    discount_amount: discount,
    parasut_step: null,
    parasut_retry_count: 0,
    lines: [],
});

beforeEach(() => {
    vi.clearAllMocks();
    process.env.PARASUT_ENABLED = "true";
    mockCreateAlert.mockResolvedValue({ id: "alert-1" });
});
afterEach(() => { delete process.env.PARASUT_ENABLED; });

describe("serviceSyncOrderToParasut — iskonto guard (V7-A4)", () => {
    it("discount_amount > 0 → skipped + parasut_claim_sync ÇAĞRILMAZ", async () => {
        mockGetOrder.mockResolvedValue(baseOrder(150));
        const r = await serviceSyncOrderToParasut(OID);
        expect(r.success).toBe(false);
        expect(r.skipped).toBe(true);
        expect(r.reason).toBe("discount_unsupported");
        expect(mockRpc).not.toHaveBeenCalled();          // claim yok
        expect(mockFrom).not.toHaveBeenCalled();         // sales_orders marker UPDATE yok
        expect(mockCreateSyncLog).not.toHaveBeenCalled();// error sync_log yok
    });

    it("discount_amount > 0 → ZORUNLU sync_issue alert (entity sales_order)", async () => {
        mockGetOrder.mockResolvedValue(baseOrder(150));
        await serviceSyncOrderToParasut(OID);
        expect(mockCreateAlert).toHaveBeenCalledTimes(1);
        const arg = mockCreateAlert.mock.calls[0][0];
        expect(arg.type).toBe("sync_issue");
        expect(arg.entity_type).toBe("sales_order");
        expect(arg.entity_id).toBe(OID);
        expect(arg.description).toMatch(/iskonto/i);
    });

    it("discount_amount = 0 → guard atlanır, normal akışa girer (claim çağrılır)", async () => {
        mockGetOrder.mockResolvedValue(baseOrder(0));
        // claim null → not_eligible_or_locked ile erken çıkar; amaç: guard'a TAKILMADIĞINI doğrula.
        mockRpc.mockResolvedValue({ data: null, error: null });
        const r = await serviceSyncOrderToParasut(OID);
        expect(mockCreateAlert).not.toHaveBeenCalled();  // iskonto alert'i yok
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.objectContaining({ p_order_id: OID }));
        expect(r.skipped).toBe(true);
        expect(r.reason).toBe("not_eligible_or_locked");
    });
});
