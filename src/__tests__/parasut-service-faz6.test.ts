/**
 * parasut-service — Faz 6 coverage
 * serviceEnsureParasutProduct: idempotent, sku guard,
 * findByCode (1/multi/0), TTL lease mutex.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ParasutError } from "@/lib/parasut-adapter";
import type { ParasutProduct } from "@/lib/parasut-adapter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeParasutProduct(id: string, code: string): ParasutProduct {
    return { id, attributes: { code, name: "Test Ürün", sales_price: 100 } };
}

function makeProduct(overrides: Partial<{
    id: string;
    name: string;
    sku: string;
    price: number | null;
    parasut_product_id: string | null;
}> = {}) {
    return {
        id:                 "prod-1",
        name:               "Test Ürün",
        sku:                "SKU-001",
        price:              250,
        parasut_product_id: null,
        available_now:      10,
        ...overrides,
    };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────
//
// Mock chain supports all Supabase query builder paths used by serviceEnsureParasutProduct:
//
//   writeProductId (find path):
//     .update().eq("id")                                    → thenable {error}
//
//   claimOrSkip (create path):
//     .update().eq("id").is(null).or(...).select("id")     → Promise<{data,error}>
//
//   finishCreate (create path):
//     .update().eq("id").eq(owner).select("id")            → Promise<{data,error}>
//
//   releaseCreate (best-effort):
//     .update().eq("id").eq(owner)                         → thenable {error}

const mockSelectFn     = vi.fn().mockResolvedValue({ data: [{ id: "x" }], error: null });
const mockOrFn         = vi.fn().mockReturnValue({ select: mockSelectFn });
const mockIsNullFn     = vi.fn().mockReturnValue({ select: mockSelectFn, or: mockOrFn });

// Second .eq() (finishCreate/releaseCreate) → thenable + { select }
function makeSecondEqResult(err: null | { message: string } = null) {
    const p = Promise.resolve({ data: err ? null : [{ id: "x" }], error: err });
    return Object.assign(p, { select: mockSelectFn });
}
const mockSecondEqFn = vi.fn().mockImplementation(() => makeSecondEqResult());

// First .eq("id") → thenable + { is, eq }
function makeEqResult(err: null | { message: string } = null) {
    const p = Promise.resolve({ error: err });
    return Object.assign(p, { is: mockIsNullFn, eq: mockSecondEqFn });
}

const mockUpdateEq  = vi.fn().mockImplementation(() => makeEqResult());
const mockUpdate    = vi.fn(() => ({ eq: mockUpdateEq }));
const mockFrom      = vi.fn(() => ({ update: mockUpdate }));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

const mockGetProductById = vi.fn();
vi.mock("@/lib/supabase/products", () => ({
    dbGetProductById: (...args: unknown[]) => mockGetProductById(...args),
}));

const mockFindByCode    = vi.fn<[], Promise<ParasutProduct[]>>();
const mockCreateProduct = vi.fn<[], Promise<ParasutProduct>>();

vi.mock("@/lib/parasut", () => ({
    sendInvoiceToParasut: vi.fn(),
    getParasutAdapter: () => ({
        findProductsByCode:  (...args: unknown[]) => mockFindByCode(...args),
        createProduct:       (...args: unknown[]) => mockCreateProduct(...args),
        // other methods not used by Faz 6
        findContactsByTaxNumber: vi.fn(),
        findContactsByEmail:     vi.fn(),
        createContact:           vi.fn(),
        updateContact:           vi.fn(),
    }),
}));

import { serviceEnsureParasutProduct } from "@/lib/services/parasut-service";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("serviceEnsureParasutProduct", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        process.env.PARASUT_ENABLED = "true";
        mockSelectFn.mockResolvedValue({ data: [{ id: "x" }], error: null });
    });

    afterEach(() => {
        delete process.env.PARASUT_ENABLED;
    });

    // ── Idempotent ────────────────────────────────────────────────────────────

    it("returns existing parasut_product_id without calling adapter", async () => {
        mockGetProductById.mockResolvedValue(makeProduct({ parasut_product_id: "existing-pid" }));
        const result = await serviceEnsureParasutProduct("prod-1");
        expect(result).toBe("existing-pid");
        expect(mockFindByCode).not.toHaveBeenCalled();
    });

    // ── Guards ────────────────────────────────────────────────────────────────

    it("throws not_found when product does not exist", async () => {
        mockGetProductById.mockResolvedValue(null);
        await expect(serviceEnsureParasutProduct("missing")).rejects.toMatchObject({
            kind: "not_found",
        });
    });

    it("throws validation when sku is empty string", async () => {
        mockGetProductById.mockResolvedValue(makeProduct({ sku: "" }));
        await expect(serviceEnsureParasutProduct("prod-1")).rejects.toMatchObject({
            kind: "validation",
        });
        expect(mockFindByCode).not.toHaveBeenCalled();
    });

    // ── findByCode: 1 eşleşme ─────────────────────────────────────────────────

    it("findByCode 1 match → writes DB, returns product id", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([makeParasutProduct("parasut-p1", "SKU-001")]);
        const result = await serviceEnsureParasutProduct("prod-1");
        expect(result).toBe("parasut-p1");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ parasut_product_id: "parasut-p1" }));
        expect(mockUpdateEq).toHaveBeenCalledWith("id", "prod-1");
        expect(mockCreateProduct).not.toHaveBeenCalled();
    });

    it("findByCode 1 match → sets parasut_synced_at", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([makeParasutProduct("parasut-p1", "SKU-001")]);
        await serviceEnsureParasutProduct("prod-1");
        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(typeof updateArgs.parasut_synced_at).toBe("string");
    });

    it("findByCode 1 match: DB write error → throws", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([makeParasutProduct("parasut-p1", "SKU-001")]);
        mockUpdateEq.mockImplementationOnce(() => makeEqResult({ message: "connection lost" }));
        await expect(serviceEnsureParasutProduct("prod-1")).rejects.toThrow("connection lost");
    });

    // ── findByCode: >1 eşleşme ────────────────────────────────────────────────

    it("findByCode >1 match → validation error", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([
            makeParasutProduct("p1", "SKU-001"),
            makeParasutProduct("p2", "SKU-001"),
        ]);
        await expect(serviceEnsureParasutProduct("prod-1")).rejects.toMatchObject({
            kind: "validation",
        });
        expect(mockCreateProduct).not.toHaveBeenCalled();
    });

    // ── findByCode: 0 eşleşme → createProduct ────────────────────────────────

    it("0 code match → createProduct called, returns id", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([]);
        mockCreateProduct.mockResolvedValue(makeParasutProduct("new-pid", "SKU-001"));
        const result = await serviceEnsureParasutProduct("prod-1");
        expect(result).toBe("new-pid");
        expect(mockCreateProduct).toHaveBeenCalledOnce();
    });

    it("0 code match → writes parasut_product_id to DB", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([]);
        mockCreateProduct.mockResolvedValue(makeParasutProduct("new-pid", "SKU-001"));
        await serviceEnsureParasutProduct("prod-1");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ parasut_product_id: "new-pid" }));
    });

    it("createProduct receives correct code, name, sales_price and vat_rate", async () => {
        mockGetProductById.mockResolvedValue(makeProduct({ sku: "SKU-001", name: "Test Ürün", price: 250 }));
        mockFindByCode.mockResolvedValue([]);
        mockCreateProduct.mockResolvedValue(makeParasutProduct("new-pid", "SKU-001"));
        await serviceEnsureParasutProduct("prod-1");
        expect(mockCreateProduct).toHaveBeenCalledWith({
            code:        "SKU-001",
            name:        "Test Ürün",
            sales_price: 250,
            vat_rate:    20,
        });
    });

    it("createProduct omits sales_price when product.price is null", async () => {
        mockGetProductById.mockResolvedValue(makeProduct({ price: null }));
        mockFindByCode.mockResolvedValue([]);
        mockCreateProduct.mockResolvedValue(makeParasutProduct("new-pid", "SKU-001"));
        await serviceEnsureParasutProduct("prod-1");
        const callArgs = mockCreateProduct.mock.calls[0][0];
        expect(callArgs.sales_price).toBeUndefined();
    });

    // ── TTL lease mutex ───────────────────────────────────────────────────────

    it("0 code match: claim wins → createProduct called, real id written", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([]);
        mockCreateProduct.mockResolvedValue(makeParasutProduct("new-pid", "SKU-001"));
        const result = await serviceEnsureParasutProduct("prod-1");
        expect(result).toBe("new-pid");
        expect(mockCreateProduct).toHaveBeenCalledOnce();
    });

    it("0 code match: claim fails, winner found → returns winner without createProduct", async () => {
        mockGetProductById.mockResolvedValueOnce(makeProduct());
        // claimOrSkip re-read: another caller already finished
        mockGetProductById.mockResolvedValueOnce(makeProduct({ parasut_product_id: "winner-pid" }));
        mockFindByCode.mockResolvedValue([]);
        mockSelectFn.mockResolvedValueOnce({ data: [], error: null });

        const result = await serviceEnsureParasutProduct("prod-1");
        expect(result).toBe("winner-pid");
        expect(mockCreateProduct).not.toHaveBeenCalled();
        expect(mockGetProductById).toHaveBeenCalledTimes(2);
    });

    it("0 code match: claim fails, active lease → throws retryable", async () => {
        mockGetProductById.mockResolvedValueOnce(makeProduct());
        // claimOrSkip re-read: no winner yet (active lease)
        mockGetProductById.mockResolvedValueOnce(makeProduct());
        mockFindByCode.mockResolvedValue([]);
        mockSelectFn.mockResolvedValueOnce({ data: [], error: null });

        await expect(serviceEnsureParasutProduct("prod-1")).rejects.toMatchObject({ kind: "server" });
        expect(mockCreateProduct).not.toHaveBeenCalled();
    });

    it("0 code match: claim DB error → throws", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([]);
        mockSelectFn.mockResolvedValueOnce({ data: null, error: { message: "DB unavailable" } });

        await expect(serviceEnsureParasutProduct("prod-1")).rejects.toThrow("DB unavailable");
        expect(mockCreateProduct).not.toHaveBeenCalled();
    });

    it("0 code match: finishCreate DB error → releases lease, rethrows", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([]);
        mockCreateProduct.mockResolvedValue(makeParasutProduct("new-pid", "SKU-001"));
        // 1st select (claimOrSkip wins), 2nd select (finishCreate DB error)
        mockSelectFn
            .mockResolvedValueOnce({ data: [{ id: "x" }], error: null })
            .mockResolvedValueOnce({ data: null, error: { message: "write failed" } });

        await expect(serviceEnsureParasutProduct("prod-1")).rejects.toThrow("write failed");
        // claim .eq() + finishCreate .eq() + releaseCreate .eq() = 3
        expect(mockUpdateEq).toHaveBeenCalledTimes(3);
    });

    it("0 code match: finishCreate lease lost → throws ParasutError server, releases lease", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([]);
        mockCreateProduct.mockResolvedValue(makeParasutProduct("new-pid", "SKU-001"));
        // 1st select (claim wins), 2nd select (finishCreate: 0 rows = lease lost)
        mockSelectFn
            .mockResolvedValueOnce({ data: [{ id: "x" }], error: null })
            .mockResolvedValueOnce({ data: [], error: null });

        await expect(serviceEnsureParasutProduct("prod-1")).rejects.toMatchObject({ kind: "server" });
        expect(mockUpdateEq).toHaveBeenCalledTimes(3);
    });

    // ── DB write details ──────────────────────────────────────────────────────

    it("DB write always uses .eq('id', productId)", async () => {
        mockGetProductById.mockResolvedValue(makeProduct());
        mockFindByCode.mockResolvedValue([makeParasutProduct("parasut-p1", "SKU-001")]);
        await serviceEnsureParasutProduct("prod-1");
        expect(mockUpdateEq).toHaveBeenCalledWith("id", "prod-1");
    });

    it("findProductsByCode is called with trimmed SKU", async () => {
        mockGetProductById.mockResolvedValue(makeProduct({ sku: "  SKU-001  " }));
        mockFindByCode.mockResolvedValue([makeParasutProduct("parasut-p1", "SKU-001")]);
        await serviceEnsureParasutProduct("prod-1");
        expect(mockFindByCode).toHaveBeenCalledWith("SKU-001");
    });
});
