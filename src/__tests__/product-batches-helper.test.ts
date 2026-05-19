/**
 * Faz 2a — product_batches helper (validation + CRUD) tests.
 *
 * Covers:
 *   dbCreateBatch — heat_no/initial_qty/remaining_qty validation
 *   dbUpdateBatch — partial patch validation
 *   dbListBatchesByProduct — sıralama order argümanları
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom   = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockSelect = vi.fn();
const mockEq     = vi.fn();
const mockOrder  = vi.fn();
const mockSingle = vi.fn();

let _listResult: { data: unknown; error: unknown } = { data: [], error: null };
function setListResult(v: { data: unknown; error: unknown }) { _listResult = v; }

const makeChain = () => {
    const c: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(_listResult).then(resolve),
    };
    c.insert = (v: unknown) => { mockInsert(v); return c; };
    c.update = (v: unknown) => { mockUpdate(v); return c; };
    c.delete = () => c;
    c.select = (v?: unknown) => { mockSelect(v); return c; };
    c.eq     = (k: unknown, v: unknown) => { mockEq(k, v); return c; };
    c.order  = (v: unknown, o?: unknown) => { mockOrder(v, o); return c; };
    c.single = () => mockSingle();
    return c;
};

const mockSupabase = {
    from: (table: string) => { mockFrom(table); return makeChain(); },
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => mockSupabase,
}));

beforeEach(() => {
    mockFrom.mockReset();
    mockInsert.mockReset();
    mockUpdate.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockOrder.mockReset();
    mockSingle.mockReset();
    setListResult({ data: [], error: null });
});

const PRODUCT_ID = "00000000-0000-4000-8000-000000000001";

describe("dbCreateBatch validation", () => {
    it("heat_no boş → reddedilir", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        await expect(dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "  ",
            initial_qty: 100,
        })).rejects.toThrow("Parti numarası");
    });

    it("initial_qty=0 → reddedilir", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        await expect(dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "H-001",
            initial_qty: 0,
        })).rejects.toThrow("pozitif");
    });

    it("remaining_qty > initial_qty → reddedilir", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        await expect(dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "H-001",
            initial_qty: 50,
            remaining_qty: 60,
        })).rejects.toThrow("büyük olamaz");
    });

    it("batch_date geçersiz format → reddedilir", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        await expect(dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "H-001",
            initial_qty: 50,
            batch_date: "19.05.2026",
        })).rejects.toThrow("YYYY-MM-DD");
    });

    it("happy path — remaining_qty default = initial_qty, DB insert tetiklenir", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        mockSingle.mockResolvedValueOnce({
            data: {
                id: "b-1", product_id: PRODUCT_ID, heat_no: "H-100",
                initial_qty: 80, remaining_qty: 80, batch_date: null,
                certificate_attachment_id: null, notes: null,
                created_at: "2026-05-19T00:00:00Z", updated_at: "2026-05-19T00:00:00Z",
            },
            error: null,
        });
        await dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "H-100",
            initial_qty: 80,
        });
        expect(mockInsert).toHaveBeenCalled();
        const payload = mockInsert.mock.calls[0][0] as Record<string, unknown>;
        expect(payload.heat_no).toBe("H-100");
        expect(payload.initial_qty).toBe(80);
        expect(payload.remaining_qty).toBe(80); // default = initial
    });
});

describe("dbUpdateBatch validation", () => {
    it("heat_no boş → reddedilir", async () => {
        const { dbUpdateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        await expect(dbUpdateBatch("b-1", { heat_no: "" })).rejects.toThrow("Parti numarası");
    });

    it("initial_qty negatif → reddedilir", async () => {
        const { dbUpdateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        // initial_qty patch'i existing fetch tetikler
        mockSingle.mockResolvedValueOnce({
            data: { id: "b-1", initial_qty: 50, remaining_qty: 20 },
            error: null,
        });
        await expect(dbUpdateBatch("b-1", { initial_qty: -5 })).rejects.toThrow("pozitif");
    });
});

describe("validateCertificateAttachment (dbCreateBatch üzerinden)", () => {
    it("certificate_attachment_id başka ürüne ait → throw", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        mockSingle.mockResolvedValueOnce({
            data: { id: "att-1", product_id: "00000000-0000-4000-8000-000000000099", kind: "certificate" },
            error: null,
        });
        await expect(dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "H-001",
            initial_qty: 50,
            certificate_attachment_id: "att-1",
        })).rejects.toThrow("bu ürüne ait değil");
    });

    it("certificate_attachment_id kind=image → throw", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        mockSingle.mockResolvedValueOnce({
            data: { id: "att-2", product_id: PRODUCT_ID, kind: "image" },
            error: null,
        });
        await expect(dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "H-001",
            initial_qty: 50,
            certificate_attachment_id: "att-2",
        })).rejects.toThrow("türünde olmalıdır");
    });

    it("certificate_attachment_id bulunamadı → throw", async () => {
        const { dbCreateBatch } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");
        mockSingle.mockResolvedValueOnce({ data: null, error: { message: "not found" } });
        await expect(dbCreateBatch({
            product_id: PRODUCT_ID,
            heat_no: "H-001",
            initial_qty: 50,
            certificate_attachment_id: "att-missing",
        })).rejects.toThrow("bulunamadı");
    });
});

describe("dbListBatchesByProduct sıralama", () => {
    it("batch_date DESC NULLS LAST + created_at DESC ile sıralanır", async () => {
        const { dbListBatchesByProduct } = await vi.importActual<typeof import("@/lib/supabase/product-batches")>("@/lib/supabase/product-batches");

        setListResult({ data: [], error: null });
        await dbListBatchesByProduct(PRODUCT_ID);

        const orderCalls = mockOrder.mock.calls;
        expect(orderCalls.length).toBeGreaterThanOrEqual(2);
        expect(orderCalls[0][0]).toBe("batch_date");
        expect(orderCalls[0][1]).toMatchObject({ ascending: false, nullsFirst: false });
        expect(orderCalls[1][0]).toBe("created_at");
        expect(orderCalls[1][1]).toMatchObject({ ascending: false });
    });
});
