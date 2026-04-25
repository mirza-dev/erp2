/**
 * parasut-service — guard coverage
 *
 * Tests validation guards (early returns) that don't depend on the full
 * orchestration. Success/failure path tests live in parasut-service-faz7.test.ts
 * and will be extended per faz as stubs are implemented.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbGetOrderById  = vi.fn();
const mockDbGetSyncLog    = vi.fn();
const mockDbUpdateSyncLog = vi.fn();
const mockDbCreateSyncLog = vi.fn();
const mockRpc             = vi.fn();

// select mock for serviceSyncAllPending
let mockSelectResolve: { data: unknown[]; error: null | { message: string } } = { data: [], error: null };
const mockLimit   = vi.fn(() => Promise.resolve(mockSelectResolve));
const mockIs      = vi.fn().mockReturnThis();
const mockEqChain = vi.fn().mockReturnThis();
const mockNot     = vi.fn().mockReturnThis();
const mockNeq     = vi.fn().mockReturnThis();
const mockOr      = vi.fn().mockReturnThis();
const mockSelect  = vi.fn(() => ({
    eq:    mockEqChain,
    is:    mockIs,
    not:   mockNot,
    neq:   mockNeq,
    or:    mockOr,
    limit: mockLimit,
}));

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate   = vi.fn(() => ({ eq: mockUpdateEq }));

vi.mock("@/lib/parasut", () => ({
    sendInvoiceToParasut: vi.fn(),
    getParasutAdapter:    vi.fn(),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...args: unknown[]) => mockDbGetOrderById(...args),
}));

vi.mock("@/lib/supabase/sync-log", () => ({
    dbGetSyncLog:    (...args: unknown[]) => mockDbGetSyncLog(...args),
    dbUpdateSyncLog: (...args: unknown[]) => mockDbUpdateSyncLog(...args),
    dbCreateSyncLog: (...args: unknown[]) => mockDbCreateSyncLog(...args),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({ update: mockUpdate, select: mockSelect }),
        rpc:  mockRpc,
    }),
}));

import {
    serviceSyncOrderToParasut,
    serviceRetrySyncLog,
    serviceSyncAllPending,
} from "@/lib/services/parasut-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<{
    commercial_status: string;
    fulfillment_status: string;
    customer_id: string | null;
    parasut_retry_count: number;
}> = {}) {
    return {
        id:                 "order-1",
        commercial_status:  overrides.commercial_status  ?? "approved",
        fulfillment_status: overrides.fulfillment_status ?? "shipped",
        order_number:       "ORD-2026-0001",
        created_at:         new Date().toISOString(),
        currency:           "USD",
        customer_id:        overrides.customer_id !== undefined ? overrides.customer_id : "cust-1",
        customer_name:      "Test Müşteri",
        parasut_retry_count: overrides.parasut_retry_count ?? 0,
        lines: [],
    };
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";
    mockSelectResolve = { data: [], error: null };
    mockDbCreateSyncLog.mockResolvedValue({ id: "log-new" });
    mockDbUpdateSyncLog.mockResolvedValue({ id: "log-1" });
    mockRpc.mockResolvedValue({ data: false, error: null });
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── serviceSyncOrderToParasut — validation guards ───────────────────────────

describe("serviceSyncOrderToParasut — validation (PARASUT_ENABLED=true)", () => {
    it("sipariş bulunamazsa { success: false } döner", async () => {
        mockDbGetOrderById.mockResolvedValue(null);
        const result = await serviceSyncOrderToParasut("order-missing");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/bulunamadı/i);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("commercial_status !== 'approved' → erken dönüş", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ commercial_status: "pending_approval" }));
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/onaylı/i);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("fulfillment_status !== 'shipped' → erken dönüş", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ fulfillment_status: "allocated" }));
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/sevk/i);
        expect(mockRpc).not.toHaveBeenCalled();
    });

    it("customer_id null → erken dönüş, RPC çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ customer_id: null }));
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/müşteri/i);
        expect(mockRpc).not.toHaveBeenCalled();
    });
});

// ─── serviceRetrySyncLog — guard dalları ─────────────────────────────────────

describe("serviceRetrySyncLog — PARASUT_ENABLED=true", () => {
    it("log bulunamazsa { success: false } döner", async () => {
        mockDbGetSyncLog.mockResolvedValue(null);
        const result = await serviceRetrySyncLog("log-missing");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/bulunamadı/i);
    });

    it("entity_id eksikse { success: false } döner", async () => {
        mockDbGetSyncLog.mockResolvedValue({ id: "log-1", entity_id: null, retry_count: 0 });
        const result = await serviceRetrySyncLog("log-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/entity_id/i);
    });

    it("retry_count >= 3 → maks. deneme aşıldı", async () => {
        mockDbGetSyncLog.mockResolvedValue({ id: "log-1", entity_id: "order-1", retry_count: 3 });
        const result = await serviceRetrySyncLog("log-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/maks/i);
    });

    it("geçerli log → dbUpdateSyncLog 'retrying' ile çağrılır, sonra RPC claim tetiklenir", async () => {
        mockDbGetSyncLog.mockResolvedValue({ id: "log-1", entity_id: "order-1", retry_count: 1 });
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // RPC claim returns false → skipped (no further orchestration needed)
        mockRpc.mockResolvedValueOnce({ data: false, error: null });

        await serviceRetrySyncLog("log-1");

        expect(mockDbUpdateSyncLog).toHaveBeenCalledWith("log-1",
            expect.objectContaining({ status: "retrying", retry_count: 2 }),
        );
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.any(Object));
    });

    it("skipped sonuç → log status 'error' güncellenmez, 'retrying' kalır", async () => {
        mockDbGetSyncLog.mockResolvedValue({ id: "log-1", entity_id: "order-1", retry_count: 0 });
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockRpc.mockResolvedValueOnce({ data: false, error: null }); // claim → skipped

        const result = await serviceRetrySyncLog("log-1");

        expect(result.skipped).toBe(true);
        // Only the first "retrying" mark written; no second update to "error"
        expect(mockDbUpdateSyncLog).toHaveBeenCalledTimes(1);
        expect(mockDbUpdateSyncLog).toHaveBeenCalledWith("log-1",
            expect.objectContaining({ status: "retrying" }),
        );
    });
});

// ─── serviceSyncAllPending ────────────────────────────────────────────────────

describe("serviceSyncAllPending — PARASUT_ENABLED=true", () => {
    it("pending order yoksa { synced: 0, failed: 0, errors: [] }", async () => {
        mockSelectResolve = { data: [], error: null };
        const result = await serviceSyncAllPending();
        expect(result).toEqual({ synced: 0, failed: 0, errors: [] });
    });

    it("DB hatası → throw", async () => {
        mockSelectResolve = { data: [], error: { message: "DB bağlantı hatası" } };
        await expect(serviceSyncAllPending()).rejects.toThrow("DB bağlantı hatası");
    });

    it("skipped sipariş synced/failed sayaçlarını artırmaz", async () => {
        mockSelectResolve = {
            data: [
                { id: "o1", order_number: "ORD-2026-0001" },
                { id: "o2", order_number: "ORD-2026-0002" },
            ],
            error: null,
        };
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // Both RPC claims return false → both skipped
        mockRpc.mockResolvedValue({ data: false, error: null });

        const result = await serviceSyncAllPending();

        expect(result.synced).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);
    });
});
