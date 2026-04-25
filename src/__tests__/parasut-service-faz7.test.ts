/**
 * parasut-service — Faz 7 coverage
 *
 * parasutInvoiceNumberInt: deterministik numara + edge case'ler
 * mapCurrency: tüm dallar (GBP dahil)
 * serviceSyncOrderToParasut: claim/lease RPC + orkestra guard'ları + step classification
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ParasutError } from "@/lib/parasut-adapter";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockDbGetOrderById   = vi.fn();
const mockDbGetCustomerById = vi.fn();
const mockDbGetProductById  = vi.fn();
const mockDbCreateSyncLog   = vi.fn();
const mockRpc               = vi.fn();

const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
const mockUpdate   = vi.fn(() => ({ eq: mockUpdateEq }));

// select mock for serviceSyncAllPending
let mockSelectResolve: { data: unknown[]; error: null | { message: string } } = { data: [], error: null };
const mockLimit   = vi.fn(() => Promise.resolve(mockSelectResolve));
const mockIs      = vi.fn().mockReturnThis();
const mockEqChain = vi.fn().mockReturnThis();
const mockNot     = vi.fn().mockReturnThis();
const mockNeq     = vi.fn().mockReturnThis();
const mockOrChain = vi.fn().mockReturnThis();
const mockSelect  = vi.fn(() => ({
    eq:    mockEqChain,
    is:    mockIs,
    not:   mockNot,
    neq:   mockNeq,
    or:    mockOrChain,
    limit: mockLimit,
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById: (...args: unknown[]) => mockDbGetOrderById(...args),
}));

vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...args: unknown[]) => mockDbGetCustomerById(...args),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...args: unknown[]) => mockDbGetProductById(...args),
}));

vi.mock("@/lib/supabase/sync-log", () => ({
    dbCreateSyncLog: (...args: unknown[]) => mockDbCreateSyncLog(...args),
    dbGetSyncLog:    vi.fn(),
    dbUpdateSyncLog: vi.fn(),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbCreateAlert: vi.fn(),
}));

vi.mock("@/lib/parasut", () => ({
    sendInvoiceToParasut: vi.fn(),
    getParasutAdapter:    vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({ update: mockUpdate, select: mockSelect }),
        rpc:  mockRpc,
    }),
}));

import {
    parasutInvoiceNumberInt,
    mapCurrency,
    serviceSyncOrderToParasut,
    serviceSyncAllPending,
} from "@/lib/services/parasut-service";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<{
    commercial_status:  string;
    fulfillment_status: string;
    customer_id:        string | null;
    order_number:       string;
    parasut_retry_count: number;
    lines: Array<{ product_id: string }>;
}> = {}) {
    return {
        id:                  "order-1",
        commercial_status:   overrides.commercial_status  ?? "approved",
        fulfillment_status:  overrides.fulfillment_status ?? "shipped",
        order_number:        overrides.order_number       ?? "ORD-2026-0042",
        created_at:          new Date().toISOString(),
        currency:            "USD",
        customer_id:         overrides.customer_id !== undefined ? overrides.customer_id : "cust-1",
        customer_name:       "Test Müşteri",
        parasut_retry_count: overrides.parasut_retry_count ?? 0,
        lines:               overrides.lines ?? [],
    };
}

function makeCustomerWithContact() {
    return {
        id:                 "cust-1",
        name:               "Test Müşteri",
        email:              "test@example.com",
        tax_number:         "1234567890",
        tax_office:         null,
        parasut_contact_id: "existing-contact-id",
    };
}

function makeProductWithId() {
    return {
        id:                "prod-1",
        name:              "Test Ürün",
        sku:               "SKU-001",
        price:             250,
        parasut_product_id: "existing-product-id",
        available_now:     10,
    };
}

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
    vi.clearAllMocks();
    saved.PARASUT_ENABLED = process.env.PARASUT_ENABLED;
    process.env.PARASUT_ENABLED = "true";
    mockSelectResolve = { data: [], error: null };
    mockDbCreateSyncLog.mockResolvedValue({ id: "log-new" });
    // Default: claim wins, release succeeds
    mockRpc.mockResolvedValue({ data: true, error: null });
    mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());
    mockDbGetProductById.mockResolvedValue(makeProductWithId());
});

afterEach(() => {
    process.env.PARASUT_ENABLED = saved.PARASUT_ENABLED;
});

// ─── parasutInvoiceNumberInt ──────────────────────────────────────────────────

describe("parasutInvoiceNumberInt", () => {
    it("'ORD-2026-0042' → 20260042", () => {
        expect(parasutInvoiceNumberInt("ORD-2026-0042")).toBe(20260042);
    });

    it("'ORD-2026-1' → 20260001 (padStart 4)", () => {
        expect(parasutInvoiceNumberInt("ORD-2026-1")).toBe(20260001);
    });

    it("'ORD-2026-12345' → 202612345 (5 hane, padStart idempotent)", () => {
        expect(parasutInvoiceNumberInt("ORD-2026-12345")).toBe(202612345);
    });

    it("'ORD-26-0042' → throws validation (yıl 4 hane değil)", () => {
        expect(() => parasutInvoiceNumberInt("ORD-26-0042")).toThrow(ParasutError);
        try {
            parasutInvoiceNumberInt("ORD-26-0042");
        } catch (err) {
            expect((err as ParasutError).kind).toBe("validation");
        }
    });

    it("'ord-2026-0042' → throws (case sensitive)", () => {
        expect(() => parasutInvoiceNumberInt("ord-2026-0042")).toThrow(ParasutError);
    });

    it("'ORD-2026-0042 ' (trailing space) → throws", () => {
        expect(() => parasutInvoiceNumberInt("ORD-2026-0042 ")).toThrow(ParasutError);
    });

    it("'ABC' → throws", () => {
        expect(() => parasutInvoiceNumberInt("ABC")).toThrow(ParasutError);
    });
});

// ─── mapCurrency ──────────────────────────────────────────────────────────────

describe("mapCurrency", () => {
    it("'USD' → 'USD'", () => expect(mapCurrency("USD")).toBe("USD"));
    it("'EUR' → 'EUR'", () => expect(mapCurrency("EUR")).toBe("EUR"));
    it("'GBP' → 'GBP'", () => expect(mapCurrency("GBP")).toBe("GBP"));
    it("'TRY' → 'TRL' (normalize)", () => expect(mapCurrency("TRY")).toBe("TRL"));
    it("bilinmeyen → 'TRL'", () => expect(mapCurrency("XYZ")).toBe("TRL"));
});

// ─── serviceSyncOrderToParasut — Faz 7 ───────────────────────────────────────

describe("serviceSyncOrderToParasut — PARASUT_ENABLED=false guard", () => {
    it("disabled → { success: false } döner, RPC çağrılmaz", async () => {
        delete process.env.PARASUT_ENABLED;
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/devre dışı/i);
        expect(mockRpc).not.toHaveBeenCalled();
    });
});

describe("serviceSyncOrderToParasut — claim path", () => {
    it("claim RPC error → { success: false, error } döner, skipped OLMAZ, release çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockRpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.skipped).toBeUndefined();
        expect(result.error).toMatch(/permission denied/i);
        // Release should NOT be called — we never held the lock
        expect(mockRpc).toHaveBeenCalledTimes(1);
    });

    it("claim RPC error → classifyAndPatch DB'ye yazılır (backoff/error_kind set)", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_retry_count: 2 }));
        mockRpc.mockResolvedValueOnce({ data: null, error: { message: "connection refused" } });

        await serviceSyncOrderToParasut("order-1");

        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "server", parasut_retry_count: 3 }),
        );
        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({ status: "error", error_kind: "server" }),
        );
    });

    it("claim returns false → { skipped: true, reason: 'not_eligible_or_locked' }", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockRpc.mockResolvedValueOnce({ data: false, error: null });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.skipped).toBe(true);
        expect(result.reason).toBe("not_eligible_or_locked");
        expect(result.success).toBe(false);
        // Release is NOT called when claim fails (try block never entered)
        expect(mockRpc).toHaveBeenCalledTimes(1);
        expect(mockRpc).toHaveBeenCalledWith("parasut_claim_sync", expect.any(Object));
    });

    it("claim returns true → claim and release her ikisi de çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // claim true, then stub throws (shipment), then release
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })  // claim
            .mockResolvedValueOnce({ data: null, error: null });  // release

        await serviceSyncOrderToParasut("order-1");

        expect(mockRpc).toHaveBeenCalledTimes(2);
        expect(mockRpc).toHaveBeenNthCalledWith(1, "parasut_claim_sync", expect.any(Object));
        expect(mockRpc).toHaveBeenNthCalledWith(2, "parasut_release_sync", expect.any(Object));
    });

    it("release RPC hatası → suppress edilir, orijinal hata korunur", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })       // claim
            .mockRejectedValueOnce(new Error("release DB error"));    // release

        // Should not throw; release error suppressed, original shipment error returned
        const result = await serviceSyncOrderToParasut("order-1");
        expect(result.success).toBe(false);
        expect(result.error).not.toMatch(/release DB error/i);
    });
});

describe("serviceSyncOrderToParasut — contact step", () => {
    it("contact step ParasutError → classified + step='contact' + release çağrılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // Customer has no contact id → serviceEnsureParasutContact will try to sync
        mockDbGetCustomerById.mockResolvedValue({
            id: "cust-1",
            name: "Test",
            tax_number: "", // empty → validation error
            parasut_contact_id: null,
        });
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })  // claim
            .mockResolvedValueOnce({ data: null, error: null });  // release

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(result.error).toMatch(/vergi numarası/i);
        // patch written to DB
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "contact", parasut_error_kind: "validation" }),
        );
        expect(mockRpc).toHaveBeenCalledTimes(2);
    });
});

describe("serviceSyncOrderToParasut — product step", () => {
    it("product step ParasutError → classified + step='product'", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({
            lines: [{ product_id: "prod-missing" }],
        }));
        // Contact already has ID (bypass)
        mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());
        // Product missing
        mockDbGetProductById.mockResolvedValue(null);
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })  // claim
            .mockResolvedValueOnce({ data: null, error: null });  // release

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "product", parasut_error_kind: "not_found" }),
        );
    });
});

describe("serviceSyncOrderToParasut — shipment step hata sınıflandırma", () => {
    it("shipment hatası → step='shipment' olarak classify edilir", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        // contact + product both bypass (IDs exist)
        mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })  // claim
            .mockResolvedValueOnce({ data: null, error: null });  // release

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_step: "shipment" }),
        );
    });

    it("shipment hatası → sync log step='shipment' ile yazılır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })
            .mockResolvedValueOnce({ data: null, error: null });

        await serviceSyncOrderToParasut("order-1");

        expect(mockDbCreateSyncLog).toHaveBeenCalledWith(
            expect.objectContaining({ step: "shipment", status: "error" }),
        );
    });

    it("non-ParasutError → server kind'a wrap edilir", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());
        // markStepDone (contact step) throws non-ParasutError
        mockUpdateEq.mockRejectedValueOnce(new TypeError("unexpected null"));
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })
            .mockResolvedValueOnce({ data: null, error: null });

        const result = await serviceSyncOrderToParasut("order-1");

        expect(result.success).toBe(false);
        expect(mockUpdate).toHaveBeenCalledWith(
            expect.objectContaining({ parasut_error_kind: "server" }),
        );
    });
});

describe("serviceSyncOrderToParasut — catch block DB write", () => {
    it("DB patch response error → sessizce loglanır, orijinal hata dönüyor", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })   // claim
            .mockResolvedValueOnce({ data: null, error: null });   // release
        // markStepDone contact, markStepDone product → ok; catch block patch → DB error
        mockUpdateEq
            .mockResolvedValueOnce({ error: null })                         // markStepDone contact
            .mockResolvedValueOnce({ error: null })                         // markStepDone product
            .mockResolvedValueOnce({ error: { message: "write failed" } }); // catch block patch

        const result = await serviceSyncOrderToParasut("order-1");

        // Original shipment error is returned, not the DB write error
        expect(result.success).toBe(false);
        expect(result.error).not.toMatch(/write failed/i);
    });
});

describe("serviceSyncOrderToParasut — retry_count drift fix", () => {
    it("retry_count sıfırlanır: shipment hatası başlangıç retry_count'u kullanır", async () => {
        mockDbGetOrderById.mockResolvedValue(makeOrder({ parasut_retry_count: 3 }));
        mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());
        mockRpc
            .mockResolvedValueOnce({ data: true, error: null })
            .mockResolvedValueOnce({ data: null, error: null });

        await serviceSyncOrderToParasut("order-1");

        // markStepDone (contact) resets to 0. shipment stub fails with retry_count=0 → patch has 0+1=1.
        // Distinguish catch-block patch from markStepDone: catch sets parasut_error_kind (non-null).
        const updatePatch = mockUpdate.mock.calls.find(
            (call: unknown[]) => (call[0] as Record<string, unknown>)?.parasut_error_kind != null,
        )?.[0] as Record<string, unknown>;
        expect(updatePatch?.parasut_retry_count).toBe(1);
    });
});

// ─── serviceSyncAllPending — skipped sayacı ───────────────────────────────────

describe("serviceSyncAllPending — skipped orders", () => {
    it("claim fail (skipped) → synced/failed artmaz", async () => {
        mockSelectResolve = {
            data: [{ id: "o1", order_number: "ORD-2026-0001" }],
            error: null,
        };
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockRpc.mockResolvedValue({ data: false, error: null }); // claim fails

        const result = await serviceSyncAllPending();

        expect(result.synced).toBe(0);
        expect(result.failed).toBe(0);
        expect(result.errors).toHaveLength(0);
    });

    it("1 skipped + 1 failed → synced=0, failed=1", async () => {
        mockSelectResolve = {
            data: [
                { id: "o1", order_number: "ORD-2026-0001" },
                { id: "o2", order_number: "ORD-2026-0002" },
            ],
            error: null,
        };
        mockDbGetOrderById.mockResolvedValue(makeOrder());
        mockDbGetCustomerById.mockResolvedValue(makeCustomerWithContact());

        // o1: claim fails (skipped); o2: claim wins → shipment stub → failed
        mockRpc
            .mockResolvedValueOnce({ data: false, error: null })  // o1 claim → skipped
            .mockResolvedValueOnce({ data: true, error: null })   // o2 claim
            .mockResolvedValueOnce({ data: null, error: null });   // o2 release

        const result = await serviceSyncAllPending();

        expect(result.synced).toBe(0);
        expect(result.failed).toBe(1);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0]).toContain("ORD-2026-0002");
    });
});
