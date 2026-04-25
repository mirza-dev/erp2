/**
 * parasut-service — branch coverage
 *
 * parasut-disabled.test.ts PARASUT_ENABLED=false guard'larını kapsar.
 * Bu dosya PARASUT_ENABLED=true senaryolarını kapsar:
 *   - mapCurrency: EUR, TRL (bilinmeyen) dalları
 *   - mapOrderToParasut: order_number parsing (normal + fallback)
 *   - serviceSyncOrderToParasut: validation dalları, success path, failure path
 *   - serviceRetrySyncLog: tüm hata dalları + success/failure path
 *   - serviceSyncAllPending: order loop, synced/failed sayımı
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockSendInvoice    = vi.fn();
const mockDbGetOrderById = vi.fn();
const mockDbGetSyncLog   = vi.fn();
const mockDbUpdateSyncLog = vi.fn();
const mockDbCreateSyncLog = vi.fn();

const mockEq     = vi.fn().mockResolvedValue(undefined);
const mockUpdate = vi.fn(() => ({ eq: mockEq }));

// select mock — per-test override ile kullanılır
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

vi.mock("@/lib/parasut", () => ({
    sendInvoiceToParasut: (...args: unknown[]) => mockSendInvoice(...args),
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
    currency: string;
    order_number: string;
    customer_id: string | null;
    customer_name: string;
    parasut_retry_count: number;
}> = {}) {
    return {
        id: "order-1",
        commercial_status: overrides.commercial_status ?? "approved",
        fulfillment_status: overrides.fulfillment_status ?? "shipped",
        order_number: overrides.order_number ?? "ORD-2026-0001",
        created_at: new Date().toISOString(),
        currency: overrides.currency ?? "USD",
        customer_id: overrides.customer_id !== undefined ? overrides.customer_id : "cust-1",
        customer_name: overrides.customer_name ?? "Test Müşteri",
        parasut_retry_count: overrides.parasut_retry_count ?? 0,
        lines: [{ quantity: 2, unit_price: 500, product_name: "Vana", product_sku: "VN-001", product_id: "prod-1", discount_pct: 10 }],
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
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── mapCurrency (dolaylı — mapOrderToParasut içinden çağrılıyor) ─────────────

describe("mapCurrency — EUR ve TRL dalları", () => {
    it("currency=EUR → sendInvoice EUR ile çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ currency: "EUR" }));
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-1", sentAt: new Date().toISOString() });

        await serviceSyncOrderToParasut("order-1");

        const payload = mockSendInvoice.mock.calls[0][0];
        expect(payload.data.attributes.currency).toBe("EUR");
    });

    it("currency=TRY (bilinmeyen) → TRL'ye normalize edilir", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ currency: "TRY" }));
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-2", sentAt: new Date().toISOString() });

        await serviceSyncOrderToParasut("order-1");

        const payload = mockSendInvoice.mock.calls[0][0];
        expect(payload.data.attributes.currency).toBe("TRL");
    });
});

// ─── mapOrderToParasut — order_number parsing ─────────────────────────────────

describe("mapOrderToParasut — order_number parsing", () => {
    it("'ORD-2026-0042' → invoice_id = 20260042", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ order_number: "ORD-2026-0042" }));
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-3", sentAt: new Date().toISOString() });

        await serviceSyncOrderToParasut("order-1");

        const payload = mockSendInvoice.mock.calls[0][0];
        expect(payload.data.attributes.invoice_id).toBe(20260042);
    });

    it("'ABC' (parts < 3) → invoice_id = Date.now() fallback (number)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ order_number: "ABC" }));
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-4", sentAt: new Date().toISOString() });

        await serviceSyncOrderToParasut("order-1");

        const payload = mockSendInvoice.mock.calls[0][0];
        expect(typeof payload.data.attributes.invoice_id).toBe("number");
    });

    it("customer_id null → customer_name ile ilişkilendirilir", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ customer_id: null, customer_name: "Acme A.Ş." }));
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-5", sentAt: new Date().toISOString() });

        await serviceSyncOrderToParasut("order-1");

        const payload = mockSendInvoice.mock.calls[0][0];
        expect(payload.data.relationships.contact.data.id).toBe("Acme A.Ş.");
    });
});

// ─── serviceSyncOrderToParasut — validation dalları ─────────────────────────

describe("serviceSyncOrderToParasut — validation (PARASUT_ENABLED=true)", () => {
    it("sipariş bulunamazsa { success: false } döner", async () => {
        mockDbGetOrderById.mockResolvedValue(null);
        const result = await serviceSyncOrderToParasut("order-missing");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/bulunamadı/i);
        expect(mockSendInvoice).not.toHaveBeenCalled();
    });

    it("commercial_status !== 'approved' → erken dönüş", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ commercial_status: "pending_approval" }));
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/onaylı/i);
        expect(mockSendInvoice).not.toHaveBeenCalled();
    });

    it("fulfillment_status !== 'shipped' → erken dönüş", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ fulfillment_status: "allocated" }));
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/sevk/i);
        expect(mockSendInvoice).not.toHaveBeenCalled();
    });
});

// ─── serviceSyncOrderToParasut — success path ────────────────────────────────

describe("serviceSyncOrderToParasut — success path", () => {
    it("sendInvoice success → supabase update + dbCreateSyncLog 'success' ile çağrılır", async () => {
        const sentAt = new Date().toISOString();
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-2026-9999", sentAt });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(true);
        expect(result.invoice_id).toBe("F-2026-9999");
        expect(result.sent_at).toBe(sentAt);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_invoice_id: "F-2026-9999", parasut_error: null })
        );
        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({ status: "success", external_id: "F-2026-9999" })
        );
    });
});

// ─── serviceSyncOrderToParasut — failure path ────────────────────────────────

describe("serviceSyncOrderToParasut — failure path", () => {
    it("sendInvoice failure → supabase error update + dbCreateSyncLog 'error' ile", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockSendInvoice.mockResolvedValue({ success: false, error: "API timeout" });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toBe("API timeout");
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error: "API timeout" })
        );
        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({ status: "error", error_message: "API timeout" })
        );
    });

    it("failure → classifyAndPatch alanları DB'ye yazılır (error_kind, step, last_failed_step, next_retry_at, retry_count)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_retry_count: 1 }));
        mockSendInvoice.mockResolvedValue({ success: false, error: "timeout" });

        await serviceSyncOrderToParasut("order-1");

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            parasut_error_kind:       "server",
            parasut_step:             "invoice",
            parasut_last_failed_step: "invoice",
            parasut_retry_count:      2,
        }));
        expect(mockUpdate.mock.calls[0][0].parasut_next_retry_at).toBeDefined();
    });

    it("failure → audit log step='invoice' ve error_kind='server' içeriyor", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockSendInvoice.mockResolvedValue({ success: false, error: "timeout" });

        await serviceSyncOrderToParasut("order-1");

        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(expect.objectContaining({
            step:       "invoice",
            error_kind: "server",
            status:     "error",
        }));
    });

    it("errorKind='auth' taşıyan result → parasut_error_kind='auth', next_retry_at=2099, retry_count değişmez", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_retry_count: 0 }));
        mockSendInvoice.mockResolvedValue({ success: false, error: "Unauthorized", errorKind: "auth" });

        await serviceSyncOrderToParasut("order-1");

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            parasut_error_kind:    "auth",
            parasut_next_retry_at: "2099-01-01T00:00:00.000Z",
        }));
        expect(mockUpdate.mock.calls[0][0].parasut_retry_count).toBeUndefined();
        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(expect.objectContaining({
            error_kind: "auth",
        }));
    });

    it("errorKind='rate_limit' taşıyan result → backoff, retry_count artıyor", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_retry_count: 0 }));
        mockSendInvoice.mockResolvedValue({ success: false, error: "Too Many Requests", errorKind: "rate_limit" });

        await serviceSyncOrderToParasut("order-1");

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            parasut_error_kind: "rate_limit",
        }));
        const next = mockUpdate.mock.calls[0][0].parasut_next_retry_at;
        expect(typeof next).toBe("string");
        expect(next).not.toBe("2099-01-01T00:00:00.000Z");
    });

    it("errorKind='validation' taşıyan result → next_retry_at=2099, audit log error_kind='validation'", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_retry_count: 0 }));
        mockSendInvoice.mockResolvedValue({ success: false, error: "VKN invalid", errorKind: "validation" });

        await serviceSyncOrderToParasut("order-1");

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            parasut_error_kind:    "validation",
            parasut_next_retry_at: "2099-01-01T00:00:00.000Z",
        }));
        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(expect.objectContaining({
            error_kind: "validation",
        }));
    });

    it("errorKind eksik (undefined) → varsayılan 'server' kullanılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_retry_count: 0 }));
        mockSendInvoice.mockResolvedValue({ success: false, error: "unknown" });

        await serviceSyncOrderToParasut("order-1");

        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
            parasut_error_kind: "server",
        }));
    });
});

// ─── serviceRetrySyncLog ──────────────────────────────────────────────────────

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

    it("geçerli log → dbUpdateSyncLog 'retrying' ile çağrılır, sonra order sync tetiklenir", async () => {
        mockDbGetSyncLog.mockResolvedValue({ id: "log-1", entity_id: "order-1", retry_count: 1 });
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-retry", sentAt: new Date().toISOString() });

        await serviceRetrySyncLog("log-1");

        expect(mockDbUpdateSyncLog).toHaveBeenCalledWith("log-1",
            expect.objectContaining({ status: "retrying", retry_count: 2 })
        );
        expect(mockSendInvoice).toHaveBeenCalledOnce();
    });

    it("retry başarılıysa log 'success' statüsüyle güncellenir", async () => {
        mockDbGetSyncLog.mockResolvedValue({ id: "log-1", entity_id: "order-1", retry_count: 0 });
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockSendInvoice.mockResolvedValue({ success: true, invoiceId: "F-ok", sentAt: new Date().toISOString() });

        const result = await serviceRetrySyncLog("log-1");

        expect(result.success).toBe(true);
        expect(mockDbUpdateSyncLog).toHaveBeenLastCalledWith("log-1",
            expect.objectContaining({ status: "success", external_id: "F-ok" })
        );
    });

    it("retry başarısızsa log 'error' statüsüyle güncellenir", async () => {
        mockDbGetSyncLog.mockResolvedValue({ id: "log-1", entity_id: "order-1", retry_count: 0 });
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockSendInvoice.mockResolvedValue({ success: false, error: "Timeout" });

        const result = await serviceRetrySyncLog("log-1");

        expect(result.success).toBe(false);
        expect(mockDbUpdateSyncLog).toHaveBeenLastCalledWith("log-1",
            expect.objectContaining({ status: "error", error_message: "Timeout" })
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

    it("2 order: 1 başarılı + 1 başarısız → doğru sayılar", async () => {
        mockSelectResolve = {
            data: [
                { id: "o1", order_number: "ORD-2026-0001" },
                { id: "o2", order_number: "ORD-2026-0002" },
            ],
            error: null,
        };
        mockDbGetOrderById.mockImplementation((id: string) => {
            return Promise.resolve(makeOrder({ order_number: id === "o1" ? "ORD-2026-0001" : "ORD-2026-0002" }));
        });
        mockSendInvoice
            .mockResolvedValueOnce({ success: true, invoiceId: "F-1", sentAt: new Date().toISOString() })
            .mockResolvedValueOnce({ success: false, error: "Duplicate" });

        const result = await serviceSyncAllPending();

        expect(result.synced).toBe(1);
        expect(result.failed).toBe(1);
        expect(result.errors[0]).toContain("Duplicate");
    });
});
