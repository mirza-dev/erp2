/**
 * Performans Faz 1 — cache invalidation davranış testleri.
 *
 * Tüm write path'lerin başarı → revalidateTag("products","max") çağrıldığını,
 * hata durumlarında ise çağrılmadığını doğrular.
 *
 * next/cache setup.ts'de global mock'lanmış:
 *   unstable_cache → pass-through (caching yok, fonksiyon doğrudan çalışır)
 *   revalidateTag  → vi.fn()  ← her beforeEach'te vi.clearAllMocks() ile sıfırlanır
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { revalidateTag } from "next/cache";

// ── Mocks ─────────────────────────────────────────────────────────────────────

// @/lib/supabase/products
const mockDbCreateProduct       = vi.fn();
const mockDbUpdateProduct       = vi.fn();
const mockDbDeleteProduct       = vi.fn();
const mockDbGetProductById      = vi.fn();
const mockDbListProducts        = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbCreateProduct:          (...args: unknown[]) => mockDbCreateProduct(...args),
    dbUpdateProduct:          (...args: unknown[]) => mockDbUpdateProduct(...args),
    dbDeleteProduct:          (...args: unknown[]) => mockDbDeleteProduct(...args),
    dbGetProductById:         (...args: unknown[]) => mockDbGetProductById(...args),
    dbListProducts:           (...args: unknown[]) => mockDbListProducts(...args),
    dbGetQuotedQuantities:    (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
    dbLookupUserEmails:       vi.fn().mockResolvedValue(new Map()),
    dbGetQuotedBreakdownByProduct: vi.fn().mockResolvedValue([]),
}));

// @/lib/supabase/purchase-commitments
const mockDbGetIncomingQuantities = vi.fn();
const mockDbReceiveCommitment     = vi.fn();
const mockDbCancelCommitment      = vi.fn();

const { CommitmentConflictError } = vi.hoisted(() => {
    class CommitmentConflictError extends Error {
        constructor(id: string) {
            super(`Commitment bulunamadı veya pending değil: ${id}`);
            this.name = "CommitmentConflictError";
        }
    }
    return { CommitmentConflictError };
});

vi.mock("@/lib/supabase/purchase-commitments", () => ({
    CommitmentConflictError,
    dbGetIncomingQuantities: (...args: unknown[]) => mockDbGetIncomingQuantities(...args),
    dbReceiveCommitment:     (...args: unknown[]) => mockDbReceiveCommitment(...args),
    dbCancelCommitment:      (...args: unknown[]) => mockDbCancelCommitment(...args),
    dbListCommitments:       vi.fn().mockResolvedValue([]),
    dbCreateCommitment:      vi.fn(),
    dbGetCommitment:         vi.fn(),
}));

// @/lib/supabase/orders
const mockDbGetOrderById    = vi.fn();
const mockDbHardDeleteOrder = vi.fn();

vi.mock("@/lib/supabase/orders", () => ({
    dbGetOrderById:    (...args: unknown[]) => mockDbGetOrderById(...args),
    dbHardDeleteOrder: (...args: unknown[]) => mockDbHardDeleteOrder(...args),
}));

// @/lib/supabase/production
const mockDbReverseProduction = vi.fn();

vi.mock("@/lib/supabase/production", () => ({
    dbReverseProduction:     (...args: unknown[]) => mockDbReverseProduction(...args),
    dbListProductionEntries: vi.fn().mockResolvedValue([]),
}));

// @/lib/services/order-service
const mockServiceCreateOrder     = vi.fn();
const mockValidateOrderCreate    = vi.fn();
const mockServiceTransitionOrder = vi.fn();
const mockServiceGetOrder        = vi.fn();

vi.mock("@/lib/services/order-service", () => ({
    serviceListOrders:          vi.fn().mockResolvedValue([]),
    serviceCreateOrder:         (...args: unknown[]) => mockServiceCreateOrder(...args),
    validateOrderCreate:        (...args: unknown[]) => mockValidateOrderCreate(...args),
    serviceTransitionOrder:     (...args: unknown[]) => mockServiceTransitionOrder(...args),
    serviceGetOrder:            (...args: unknown[]) => mockServiceGetOrder(...args),
    serviceUpdateQuoteDeadline: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/ai-service", () => ({
    aiScoreOrder: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/parasut-service", () => ({
    serviceSyncOrderToParasut: vi.fn().mockResolvedValue(undefined),
}));

// @/lib/services/production-service
const mockServiceCreateProductionEntry = vi.fn();

vi.mock("@/lib/services/production-service", () => ({
    serviceCreateProductionEntry: (...args: unknown[]) => mockServiceCreateProductionEntry(...args),
}));

// @/lib/services/import-service
const mockServiceConfirmBatch = vi.fn();

vi.mock("@/lib/services/import-service", () => ({
    serviceConfirmBatch: (...args: unknown[]) => mockServiceConfirmBatch(...args),
}));

// @/lib/supabase/server — POST /api/orders auth.getUser için
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: {
            getUser: () => Promise.resolve({ data: { user: { id: "user-1" } } }),
        },
    }),
}));

// ── Route imports ─────────────────────────────────────────────────────────────

import { POST as productsPost }                    from "@/app/api/products/route";
import { PATCH as productIdPatch,
         DELETE as productIdDelete }               from "@/app/api/products/[id]/route";
import { POST as ordersPost }                      from "@/app/api/orders/route";
import { PATCH as orderIdPatch,
         DELETE as orderIdDelete }                 from "@/app/api/orders/[id]/route";
import { POST as productionPost }                  from "@/app/api/production/route";
import { DELETE as productionIdDelete }            from "@/app/api/production/[id]/route";
import { POST as importConfirmPost }               from "@/app/api/import/[batchId]/confirm/route";
import { PATCH as commitmentIdPatch }              from "@/app/api/purchase-commitments/[id]/route";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(url: string, method: string, body?: unknown): NextRequest {
    return new NextRequest(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
}

function idCtx(id: string) {
    return { params: Promise.resolve({ id }) };
}

function batchCtx(batchId: string) {
    return { params: Promise.resolve({ batchId }) };
}

const VALID_ORDER = {
    customer_id: "cust-1",
    customer_name: "Test Müşteri",
    commercial_status: "draft",
    currency: "USD",
    lines: [{
        product_id: "p1", product_name: "P", product_sku: "S",
        unit: "adet", quantity: 5, unit_price: 100, discount_pct: 0, line_total: 500,
    }],
};

const STUB_ORDER = {
    id: "ord-1",
    commercial_status: "approved",
    fulfillment_status: "allocated",
    order_number: "SIP-001",
    customer_name: "Test Müşteri",
    grand_total: 500,
    currency: "USD",
    lines: [],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    // products
    mockDbListProducts.mockResolvedValue([]);
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbGetIncomingQuantities.mockResolvedValue(new Map());
    mockDbCreateProduct.mockResolvedValue({ id: "prod-new", name: "Test Ürün" });
    mockDbUpdateProduct.mockResolvedValue({ id: "prod-1", name: "Güncel İsim" });
    mockDbDeleteProduct.mockResolvedValue(undefined);
    mockDbGetProductById.mockResolvedValue({ id: "prod-1", name: "Ürün" });
    // orders
    mockDbGetOrderById.mockResolvedValue({ id: "ord-1", commercial_status: "draft" });
    mockDbHardDeleteOrder.mockResolvedValue(undefined);
    mockValidateOrderCreate.mockReturnValue({ valid: true, errors: [] });
    mockServiceCreateOrder.mockResolvedValue({ id: "ord-new" });
    mockServiceTransitionOrder.mockResolvedValue({ success: true });
    mockServiceGetOrder.mockResolvedValue(STUB_ORDER);
    // production
    mockDbReverseProduction.mockResolvedValue({ success: true });
    mockServiceCreateProductionEntry.mockResolvedValue({ success: true, entry_id: "entry-1" });
    // import
    mockServiceConfirmBatch.mockResolvedValue({ added: 1, updated: 0, skipped: 0, errors: [] });
    // purchase-commitments
    mockDbReceiveCommitment.mockResolvedValue(undefined);
    mockDbCancelCommitment.mockResolvedValue(undefined);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

// ─── POST /api/products ───────────────────────────────────────────────────────

describe("POST /api/products — cache invalidation", () => {
    it("başarılı ürün oluşturmada revalidateTag çağrılır", async () => {
        const res = await productsPost(
            makeReq("http://localhost/api/products", "POST", { name: "Vana", sku: "VN-001", unit: "adet" })
        );
        expect(res.status).toBe(201);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("name boş → 400, revalidateTag çağrılmaz", async () => {
        const res = await productsPost(
            makeReq("http://localhost/api/products", "POST", { name: "", sku: "VN-001", unit: "adet" })
        );
        expect(res.status).toBe(400);
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("duplicate SKU (unique constraint) → 409, revalidateTag çağrılmaz", async () => {
        mockDbCreateProduct.mockRejectedValue(new Error("unique constraint violation"));
        const res = await productsPost(
            makeReq("http://localhost/api/products", "POST", { name: "Vana", sku: "VN-001", unit: "adet" })
        );
        expect(res.status).toBe(409);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── PATCH /api/products/[id] ─────────────────────────────────────────────────

describe("PATCH /api/products/[id] — cache invalidation", () => {
    it("başarılı güncellemede revalidateTag çağrılır", async () => {
        const res = await productIdPatch(
            makeReq("http://localhost/api/products/prod-1", "PATCH", { name: "Yeni İsim" }),
            idCtx("prod-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("DB hatası → 500, revalidateTag çağrılmaz", async () => {
        mockDbUpdateProduct.mockRejectedValue(new Error("DB bağlantı hatası"));
        const res = await productIdPatch(
            makeReq("http://localhost/api/products/prod-1", "PATCH", { name: "Yeni" }),
            idCtx("prod-1")
        );
        expect(res.status).toBe(500);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── DELETE /api/products/[id] ────────────────────────────────────────────────

describe("DELETE /api/products/[id] — cache invalidation", () => {
    it("başarılı silinmede revalidateTag çağrılır", async () => {
        const res = await productIdDelete(
            makeReq("http://localhost/api/products/prod-1", "DELETE"),
            idCtx("prod-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });
});

// ─── POST /api/orders ─────────────────────────────────────────────────────────

describe("POST /api/orders — cache invalidation", () => {
    it("başarılı sipariş oluşturmada revalidateTag çağrılır", async () => {
        const res = await ordersPost(
            makeReq("http://localhost/api/orders", "POST", VALID_ORDER)
        );
        expect(res.status).toBe(201);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("validation hatası → 400, revalidateTag çağrılmaz", async () => {
        mockValidateOrderCreate.mockReturnValue({ valid: false, errors: ["lines boş"] });
        const res = await ordersPost(
            makeReq("http://localhost/api/orders", "POST", { ...VALID_ORDER, lines: [] })
        );
        expect(res.status).toBe(400);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── PATCH /api/orders/[id] — durum geçişi ────────────────────────────────────

describe("PATCH /api/orders/[id] — cache invalidation", () => {
    it("başarılı durum geçişinde revalidateTag çağrılır", async () => {
        const res = await orderIdPatch(
            makeReq("http://localhost/api/orders/ord-1", "PATCH", { transition: "approved" }),
            idCtx("ord-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("başarısız geçiş (stok yok) → 400, revalidateTag çağrılmaz", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: false, error: "Yetersiz stok" });
        const res = await orderIdPatch(
            makeReq("http://localhost/api/orders/ord-1", "PATCH", { transition: "approved" }),
            idCtx("ord-1")
        );
        expect(res.status).toBe(400);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── DELETE /api/orders/[id] — soft cancel ────────────────────────────────────

describe("DELETE /api/orders/[id] soft cancel — cache invalidation", () => {
    it("başarılı iptal → revalidateTag çağrılır", async () => {
        const res = await orderIdDelete(
            makeReq("http://localhost/api/orders/ord-1", "DELETE"),
            idCtx("ord-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("iptal başarısız → 400, revalidateTag çağrılmaz", async () => {
        mockServiceTransitionOrder.mockResolvedValue({ success: false, error: "Geçersiz geçiş" });
        const res = await orderIdDelete(
            makeReq("http://localhost/api/orders/ord-1", "DELETE"),
            idCtx("ord-1")
        );
        expect(res.status).toBe(400);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── DELETE /api/orders/[id] — hard delete ────────────────────────────────────

describe("DELETE /api/orders/[id] hard delete — cache invalidation", () => {
    it("başarılı kalıcı silme → revalidateTag çağrılır", async () => {
        // default: dbGetOrderById → { commercial_status: "draft" } ✓
        const res = await orderIdDelete(
            makeReq("http://localhost/api/orders/ord-1?permanent=1", "DELETE"),
            idCtx("ord-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("approved sipariş kalıcı silinemez → 409, revalidateTag çağrılmaz", async () => {
        mockDbGetOrderById.mockResolvedValue({ id: "ord-1", commercial_status: "approved" });
        const res = await orderIdDelete(
            makeReq("http://localhost/api/orders/ord-1?permanent=1", "DELETE"),
            idCtx("ord-1")
        );
        expect(res.status).toBe(409);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── POST /api/production ─────────────────────────────────────────────────────

describe("POST /api/production — cache invalidation", () => {
    it("başarılı üretim kaydında revalidateTag çağrılır", async () => {
        const res = await productionPost(
            makeReq("http://localhost/api/production", "POST", { product_id: "prod-1", produced_qty: 10 })
        );
        expect(res.status).toBe(201);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("produced_qty sıfır → 400, revalidateTag çağrılmaz", async () => {
        const res = await productionPost(
            makeReq("http://localhost/api/production", "POST", { product_id: "prod-1", produced_qty: 0 })
        );
        expect(res.status).toBe(400);
        expect(revalidateTag).not.toHaveBeenCalled();
    });

    it("üretim servisi başarısız (success:false) → 400, revalidateTag çağrılmaz", async () => {
        mockServiceCreateProductionEntry.mockResolvedValue({ success: false, error: "BOM eksik malzeme" });
        const res = await productionPost(
            makeReq("http://localhost/api/production", "POST", { product_id: "prod-1", produced_qty: 5 })
        );
        expect(res.status).toBe(400);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── DELETE /api/production/[id] ─────────────────────────────────────────────

describe("DELETE /api/production/[id] — cache invalidation", () => {
    it("başarılı geri almada revalidateTag çağrılır", async () => {
        const res = await productionIdDelete(
            makeReq("http://localhost/api/production/entry-1", "DELETE"),
            idCtx("entry-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("geri alma başarısız (success:false) → 409, revalidateTag çağrılmaz", async () => {
        mockDbReverseProduction.mockResolvedValue({ success: false, error: "Hareket bulunamadı" });
        const res = await productionIdDelete(
            makeReq("http://localhost/api/production/entry-1", "DELETE"),
            idCtx("entry-1")
        );
        expect(res.status).toBe(409);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── POST /api/import/[batchId]/confirm ──────────────────────────────────────

describe("POST /api/import/[batchId]/confirm — cache invalidation", () => {
    it("başarılı batch onayında revalidateTag çağrılır", async () => {
        const res = await importConfirmPost(
            makeReq("http://localhost/api/import/batch-1/confirm", "POST"),
            batchCtx("batch-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("serviceConfirmBatch hata fırlatırsa → 500, revalidateTag çağrılmaz", async () => {
        mockServiceConfirmBatch.mockRejectedValue(new Error("DB hatası"));
        const res = await importConfirmPost(
            makeReq("http://localhost/api/import/batch-1/confirm", "POST"),
            batchCtx("batch-1")
        );
        expect(res.status).toBe(500);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});

// ─── PATCH /api/purchase-commitments/[id] ────────────────────────────────────

describe("PATCH /api/purchase-commitments/[id] — cache invalidation", () => {
    it("action=receive → revalidateTag çağrılır", async () => {
        const res = await commitmentIdPatch(
            makeReq("http://localhost/api/purchase-commitments/commit-1", "PATCH", { action: "receive" }),
            idCtx("commit-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("action=cancel → revalidateTag çağrılır", async () => {
        const res = await commitmentIdPatch(
            makeReq("http://localhost/api/purchase-commitments/commit-1", "PATCH", { action: "cancel" }),
            idCtx("commit-1")
        );
        expect(res.status).toBe(200);
        expect(revalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("CommitmentConflictError → 409, revalidateTag çağrılmaz", async () => {
        mockDbReceiveCommitment.mockRejectedValue(new CommitmentConflictError("commit-1"));
        const res = await commitmentIdPatch(
            makeReq("http://localhost/api/purchase-commitments/commit-1", "PATCH", { action: "receive" }),
            idCtx("commit-1")
        );
        expect(res.status).toBe(409);
        expect(revalidateTag).not.toHaveBeenCalled();
    });
});
