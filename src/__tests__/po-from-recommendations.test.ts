/**
 * Faz 6 — Suggested → PO Köprüsü: helper + API route tests (8 tests)
 *
 * Covers:
 *   dbGetPOsByRecommendationIds:
 *     - boş recIds → boş Map (Supabase çağrısı yok)
 *     - rec var → Map[recId]=[poInfo] doğru dönüşüm
 *     - aynı PO iki farklı po_line'dan → dedup (bir kez listelenir)
 *   POST /api/purchase-orders/from-recommendations:
 *     - viewer → 403
 *     - geçersiz recommendation_id (UUID değil) → 400
 *     - service "bulunamadı" throw (rejected rec) → 400
 *     - qty=metadata.suggestQty → 201, accepted patch yapılır (best-effort)
 *     - qty≠metadata.suggestQty → 201, edited patch yapılır
 *     - vendor pasif (RPC bubble) → 400
 *     - başarı → revalidateTag("purchase-orders","max") + revalidateTag("products","max")
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ── Supabase mock (helper layer) ──────────────────────────────

const mockFrom = vi.fn();
const mockRpc  = vi.fn();

let _chainResult: { data: unknown; error: unknown } = { data: [], error: null };

const makeChain = () => {
    const c = {
        select: (_v?: unknown) => c,
        eq:     (_k: unknown, _v: unknown) => c,
        in:     (_col: unknown, _vals: unknown): Promise<{ data: unknown; error: unknown }> =>
            Promise.resolve(_chainResult),
        single: (): Promise<{ data: unknown; error: unknown }> =>
            Promise.resolve(_chainResult),
        order:  (_v: unknown, _o?: unknown) => c,
    };
    return c;
};

const mockSupabase = {
    from: (table: string) => { mockFrom(table); return makeChain(); },
    rpc:  (...args: unknown[]) => mockRpc(...args),
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => mockSupabase,
}));

// ── Recommendations mock (service layer) ──────────────────────

const mockDbListRecs = vi.fn();
const mockDbUpdateRecStatus = vi.fn();

vi.mock("@/lib/supabase/recommendations", () => ({
    dbListRecommendations: (...a: unknown[]) => mockDbListRecs(...a),
    dbUpdateRecommendationStatus: (...a: unknown[]) => mockDbUpdateRecStatus(...a),
}));

// ── Service mock (route layer) ────────────────────────────────

const mockServiceCreatePO = vi.fn();

vi.mock("@/lib/services/purchase-order-service", async () => {
    const actual = await vi.importActual("@/lib/services/purchase-order-service") as typeof import("@/lib/services/purchase-order-service");
    return {
        ...actual,
        serviceCreatePOFromRecommendations: (...a: unknown[]) => mockServiceCreatePO(...a),
    };
});

// ── Role guard mock ───────────────────────────────────────────

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    getCurrentUserRole: vi.fn().mockResolvedValue("purchaser"),
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

// ── Next.js mocks ─────────────────────────────────────────────

const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
    revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
    unstable_cache: (_fn: () => unknown) => _fn,
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

// ── Imports ───────────────────────────────────────────────────

import { dbGetPOsByRecommendationIds } from "@/lib/supabase/purchase-orders";
import { POST } from "@/app/api/purchase-orders/from-recommendations/route";
import { NextRequest } from "next/server";

// ── Fixtures ──────────────────────────────────────────────────

const REC_ID  = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const REC_ID2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PO_ID   = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VID     = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const PROD_ID = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function makeRequest(body: unknown) {
    return new NextRequest("http://localhost/api/purchase-orders/from-recommendations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

const validBody = {
    vendor_id: VID,
    currency: "TRY",
    lines: [{ recommendation_id: REC_ID, quantity: 10, unit_price: 50 }],
};

beforeEach(() => {
    vi.clearAllMocks();
    _chainResult = { data: [], error: null };
    mockRequireRole.mockResolvedValue(null); // purchaser yetkili
    mockServiceCreatePO.mockResolvedValue({ id: PO_ID, po_number: "PO-2026-0001" });
    mockDbListRecs.mockResolvedValue([]);
    mockDbUpdateRecStatus.mockResolvedValue(undefined);
});

// ── Helper tests ──────────────────────────────────────────────

describe("dbGetPOsByRecommendationIds", () => {
    it("boş recIds → boş Map, Supabase'e çağrı yok", async () => {
        const result = await dbGetPOsByRecommendationIds([]);
        expect(result.size).toBe(0);
        expect(mockFrom).not.toHaveBeenCalled();
    });

    it("rec var → Map[recId] doğru PO bilgisiyle dönüşür", async () => {
        _chainResult = {
            data: [{
                recommendation_id: REC_ID,
                purchase_order_lines: [
                    { purchase_orders: { id: PO_ID, po_number: "PO-2026-0001", status: "draft" } },
                ],
            }],
            error: null,
        };
        const result = await dbGetPOsByRecommendationIds([REC_ID]);
        expect(result.size).toBe(1);
        const pos = result.get(REC_ID)!;
        expect(pos).toHaveLength(1);
        expect(pos[0]).toMatchObject({ id: PO_ID, po_number: "PO-2026-0001", status: "draft" });
    });

    it("aynı PO iki farklı po_line ile bağlıysa dedup: bir kez listelenir", async () => {
        _chainResult = {
            data: [{
                recommendation_id: REC_ID,
                purchase_order_lines: [
                    { purchase_orders: { id: PO_ID, po_number: "PO-2026-0001", status: "draft" } },
                    { purchase_orders: { id: PO_ID, po_number: "PO-2026-0001", status: "draft" } },
                ],
            }],
            error: null,
        };
        const result = await dbGetPOsByRecommendationIds([REC_ID]);
        const pos = result.get(REC_ID)!;
        expect(pos).toHaveLength(1); // dedup
    });
});

// ── Route tests ───────────────────────────────────────────────

describe("POST /api/purchase-orders/from-recommendations", () => {
    it("viewer → 403", async () => {
        const { NextResponse } = await import("next/server");
        mockRequireRole.mockResolvedValueOnce(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(403);
    });

    it("geçersiz recommendation_id (UUID değil) → 400", async () => {
        const body = { ...validBody, lines: [{ recommendation_id: "not-a-uuid", quantity: 10, unit_price: 50 }] };
        const res = await POST(makeRequest(body));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/UUID/);
    });

    it("service 'bulunamadı' throw (örn. rejected rec) → 400 döner", async () => {
        mockServiceCreatePO.mockRejectedValueOnce(new Error("Öneri bulunamadı veya geçersiz statüde: " + REC_ID));
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/bulunamadı/);
    });

    it("vendor pasif (RPC bubble 'pasif' içeren hata) → 400 döner", async () => {
        mockServiceCreatePO.mockRejectedValueOnce(new Error("Tedarikçi pasif durumda, sipariş oluşturulamaz."));
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/pasif/);
    });

    it("başarılı PO → 201 ve { id, po_number } döner", async () => {
        const res = await POST(makeRequest(validBody));
        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data).toMatchObject({ id: PO_ID, po_number: "PO-2026-0001" });
    });

    it("başarılı PO → revalidateTag('purchase-orders','max') + revalidateTag('products','max') çağrılır", async () => {
        await POST(makeRequest(validBody));
        expect(mockRevalidateTag).toHaveBeenCalledWith("purchase-orders", "max");
        expect(mockRevalidateTag).toHaveBeenCalledWith("products", "max");
    });

    it("serviceCreatePOFromRecommendations'a doğru satırlar iletilir", async () => {
        const body = {
            vendor_id: VID,
            currency: "USD",
            expected_date: "2026-07-01",
            notes: "test notu",
            lines: [
                { recommendation_id: REC_ID,  quantity: 10, unit_price: 50, discount_pct: 5 },
                { recommendation_id: REC_ID2, quantity: 20, unit_price: 25 },
            ],
        };
        await POST(makeRequest(body));
        expect(mockServiceCreatePO).toHaveBeenCalledWith(
            {
                vendor_id:     VID,
                currency:      "USD",
                expected_date: "2026-07-01",
                notes:         "test notu",
                lines: [
                    { recommendation_id: REC_ID,  quantity: 10, unit_price: 50, discount_pct: 5, notes: null },
                    { recommendation_id: REC_ID2, quantity: 20, unit_price: 25, discount_pct: 0, notes: null },
                ],
            },
            undefined, // actor
        );
    });

    it("geçersiz currency (TRY/USD/EUR dışı) → 400", async () => {
        const res = await POST(makeRequest({ ...validBody, currency: "GBP" }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/para birimi/i);
    });
});

// ── Fix 4b: Silent zero tests (unit_price null/"") ────────────

describe("route — unit_price silent zero reject", () => {
    it("unit_price: null → 400 (zorunludur)", async () => {
        const res = await POST(makeRequest({
            ...validBody,
            lines: [{ recommendation_id: REC_ID, quantity: 10, unit_price: null }],
        }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/unit_price/);
    });

    it('unit_price: "" → 400 (zorunludur)', async () => {
        const res = await POST(makeRequest({
            ...validBody,
            lines: [{ recommendation_id: REC_ID, quantity: 10, unit_price: "" }],
        }));
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error).toMatch(/unit_price/);
    });
});

// ── Fix 4a: Service direkt testler ───────────────────────────

describe("serviceCreatePOFromRecommendations (direkt)", () => {
    type ServiceFn = (
        input: {
            vendor_id: string;
            currency: string;
            expected_date?: string | null;
            notes?: string | null;
            lines: Array<{
                recommendation_id: string;
                quantity: number;
                unit_price: number;
                discount_pct?: number;
                notes?: string | null;
            }>;
        },
        actor?: string,
    ) => Promise<{ id: string; po_number: string }>;

    let realCreatePO: ServiceFn;

    beforeAll(async () => {
        const mod = await vi.importActual(
            "@/lib/services/purchase-order-service",
        ) as { serviceCreatePOFromRecommendations: ServiceFn };
        realCreatePO = mod.serviceCreatePOFromRecommendations;
    });

    const baseRec = {
        id: REC_ID,
        status: "suggested",
        entity_id: PROD_ID,
        entity_type: "product",
        recommendation_type: "purchase_suggestion",
        metadata: { suggestQty: 10 },
        body: "Test öneri",
        created_at: new Date().toISOString(),
    };

    it("qty=suggestQty → dbCreatePurchaseOrder doğru payload, accepted patch yapılır", async () => {
        mockDbListRecs.mockResolvedValue([baseRec]);
        mockRpc.mockResolvedValue({ data: [{ po_id: PO_ID, po_number: "PO-2026-0001" }], error: null });

        const result = await realCreatePO({
            vendor_id: VID,
            currency: "TRY",
            lines: [{ recommendation_id: REC_ID, quantity: 10, unit_price: 50 }],
        });

        expect(result).toMatchObject({ id: PO_ID, po_number: "PO-2026-0001" });
        expect(mockRpc).toHaveBeenCalledWith(
            "create_purchase_order_with_lines",
            expect.objectContaining({
                p_vendor_id: VID,
                p_lines: expect.arrayContaining([
                    expect.objectContaining({ source_recommendation_ids: [REC_ID] }),
                ]),
            }),
        );
        expect(mockDbUpdateRecStatus).toHaveBeenCalledWith(REC_ID, "accepted", undefined);
    });

    it("qty≠suggestQty → edited patch yapılır", async () => {
        mockDbListRecs.mockResolvedValue([baseRec]);
        mockRpc.mockResolvedValue({ data: [{ po_id: PO_ID, po_number: "PO-2026-0001" }], error: null });

        await realCreatePO({
            vendor_id: VID,
            currency: "TRY",
            lines: [{ recommendation_id: REC_ID, quantity: 15, unit_price: 50 }],
        });

        expect(mockDbUpdateRecStatus).toHaveBeenCalledWith(
            REC_ID,
            "edited",
            { editedMetadata: { suggestQty: 15 } },
        );
    });

    it("aktif PO'su olan rec → 'aktif siparişe bağlı' throw (Fix 1a regression lock)", async () => {
        mockDbListRecs.mockResolvedValue([baseRec]);
        _chainResult = {
            data: [{
                recommendation_id: REC_ID,
                purchase_order_lines: [
                    { purchase_orders: { id: PO_ID, po_number: "PO-2026-0001", status: "draft" } },
                ],
            }],
            error: null,
        };

        await expect(realCreatePO({
            vendor_id: VID,
            currency: "TRY",
            lines: [{ recommendation_id: REC_ID, quantity: 10, unit_price: 50 }],
        })).rejects.toThrow("aktif siparişe bağlı");
    });
});
