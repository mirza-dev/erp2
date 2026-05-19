/**
 * Faz 1 — Product types API route tests.
 *
 * Covers:
 *   GET  /api/product-types — liste
 *   POST /api/product-types — admin-only, validation, 201
 *   GET  /api/product-types/[id] — 404, 200, withFields=1
 *   PATCH/DELETE /api/product-types/[id] — admin guard, 404, 409 (sistem tipi)
 *   GET/POST /api/product-types/[id]/fields — admin guard, validation
 *   PATCH/DELETE /api/product-types/[id]/fields/[fieldId] — admin guard
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────

const mockDbListProductTypes = vi.fn();
const mockDbGetProductType = vi.fn();
const mockDbGetProductTypeWithFields = vi.fn();
const mockDbCreateProductType = vi.fn();
const mockDbUpdateProductType = vi.fn();
const mockDbDeleteProductType = vi.fn();
const mockDbListProductTypeFields = vi.fn();
const mockDbAddProductTypeField = vi.fn();
const mockDbUpdateProductTypeField = vi.fn();
const mockDbDeleteProductTypeField = vi.fn();
const mockDbReorderProductTypes = vi.fn();
const mockDbReorderProductTypeFields = vi.fn();

vi.mock("@/lib/supabase/product-types", () => ({
    dbListProductTypes: (...a: unknown[]) => mockDbListProductTypes(...a),
    dbGetProductType: (...a: unknown[]) => mockDbGetProductType(...a),
    dbGetProductTypeWithFields: (...a: unknown[]) => mockDbGetProductTypeWithFields(...a),
    dbCreateProductType: (...a: unknown[]) => mockDbCreateProductType(...a),
    dbUpdateProductType: (...a: unknown[]) => mockDbUpdateProductType(...a),
    dbDeleteProductType: (...a: unknown[]) => mockDbDeleteProductType(...a),
    dbListProductTypeFields: (...a: unknown[]) => mockDbListProductTypeFields(...a),
    dbAddProductTypeField: (...a: unknown[]) => mockDbAddProductTypeField(...a),
    dbUpdateProductTypeField: (...a: unknown[]) => mockDbUpdateProductTypeField(...a),
    dbDeleteProductTypeField: (...a: unknown[]) => mockDbDeleteProductTypeField(...a),
    dbReorderProductTypes: (...a: unknown[]) => mockDbReorderProductTypes(...a),
    dbReorderProductTypeFields: (...a: unknown[]) => mockDbReorderProductTypeFields(...a),
}));

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requireRole: (...a: unknown[]) => mockRequireRole(...a),
}));

vi.mock("next/cache", () => ({
    unstable_cache: (_fn: () => unknown) => _fn,
    revalidateTag: vi.fn(),
}));

import { GET as typesGET, POST as typesPOST, PUT as typesPUT } from "@/app/api/product-types/route";
import {
    GET as typeIdGET,
    PATCH as typeIdPATCH,
    DELETE as typeIdDELETE,
} from "@/app/api/product-types/[id]/route";
import {
    GET as fieldsGET,
    POST as fieldsPOST,
    PUT as fieldsPUT,
} from "@/app/api/product-types/[id]/fields/route";
import {
    PATCH as fieldIdPATCH,
    DELETE as fieldIdDELETE,
} from "@/app/api/product-types/[id]/fields/[fieldId]/route";

// ── Helpers ─────────────────────────────────────────────────────

function makeReq(body?: unknown, method = "POST", url = "http://localhost/api/product-types"): Request {
    if (body === undefined) return new Request(url);
    return new Request(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

function makeParams<T>(p: T) {
    return { params: Promise.resolve(p) };
}

const sampleType = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Vana",
    description: "Vana ürünleri",
    icon: "🔧",
    sort_order: 10,
    is_system: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

const sampleField = {
    id: "f-1",
    product_type_id: sampleType.id,
    field_key: "dn",
    label_tr: "DN",
    label_en: "Nominal Diameter",
    field_type: "number" as const,
    unit: "mm",
    options: null,
    required: true,
    placeholder: null,
    help_text: null,
    sort_order: 10,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
    mockDbListProductTypes.mockReset();
    mockDbGetProductType.mockReset();
    mockDbGetProductTypeWithFields.mockReset();
    mockDbCreateProductType.mockReset();
    mockDbUpdateProductType.mockReset();
    mockDbDeleteProductType.mockReset();
    mockDbListProductTypeFields.mockReset();
    mockDbAddProductTypeField.mockReset();
    mockDbUpdateProductTypeField.mockReset();
    mockDbDeleteProductTypeField.mockReset();
    mockDbReorderProductTypes.mockReset();
    mockDbReorderProductTypeFields.mockReset();
    mockRequireRole.mockReset();
    mockRequireRole.mockResolvedValue(null); // varsayılan admin
});

// ── GET /api/product-types ──────────────────────────────────────

describe("GET /api/product-types", () => {
    it("200 + liste döner", async () => {
        mockDbListProductTypes.mockResolvedValue([sampleType]);
        const res = await typesGET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body[0].name).toBe("Vana");
    });
});

// ── POST /api/product-types ─────────────────────────────────────

describe("POST /api/product-types", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await typesPOST(makeReq({ name: "Yeni" }) as unknown as Parameters<typeof typesPOST>[0]);
        expect(res.status).toBe(403);
    });

    it("name boş → 400", async () => {
        mockDbCreateProductType.mockRejectedValue(new Error("Tip adı zorunludur."));
        const res = await typesPOST(makeReq({ name: "" }) as unknown as Parameters<typeof typesPOST>[0]);
        expect(res.status).toBe(400);
    });

    it("aynı isimde tip zaten var → 400", async () => {
        mockDbCreateProductType.mockRejectedValue(new Error("Bu isimde bir tip zaten var."));
        const res = await typesPOST(makeReq({ name: "Vana" }) as unknown as Parameters<typeof typesPOST>[0]);
        expect(res.status).toBe(400);
    });

    it("başarılı → 201", async () => {
        mockDbCreateProductType.mockResolvedValue(sampleType);
        const res = await typesPOST(makeReq({ name: "Yeni Tip" }) as unknown as Parameters<typeof typesPOST>[0]);
        expect(res.status).toBe(201);
        const body = await res.json();
        expect(body.name).toBe("Vana");
    });
});

// ── PUT /api/product-types (reorder) ────────────────────────────

describe("PUT /api/product-types", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await typesPUT(makeReq({ ids: ["a", "b"] }, "PUT") as unknown as Parameters<typeof typesPUT>[0]);
        expect(res.status).toBe(403);
    });

    it("ids dizi değil → 400", async () => {
        const res = await typesPUT(makeReq({ ids: "not-array" }, "PUT") as unknown as Parameters<typeof typesPUT>[0]);
        expect(res.status).toBe(400);
    });

    it("ids içinde non-string → 400", async () => {
        const res = await typesPUT(makeReq({ ids: ["a", 123] }, "PUT") as unknown as Parameters<typeof typesPUT>[0]);
        expect(res.status).toBe(400);
    });

    it("başarılı reorder → 200", async () => {
        mockDbReorderProductTypes.mockResolvedValue(undefined);
        const res = await typesPUT(makeReq({ ids: ["a", "b", "c"] }, "PUT") as unknown as Parameters<typeof typesPUT>[0]);
        expect(res.status).toBe(200);
    });
});

// ── GET /api/product-types/[id] ─────────────────────────────────

describe("GET /api/product-types/[id]", () => {
    it("yok → 404", async () => {
        mockDbGetProductType.mockResolvedValue(null);
        const res = await typeIdGET(makeReq(undefined, "GET", "http://localhost/api/product-types/t-x") as unknown as Parameters<typeof typeIdGET>[0], makeParams({ id: "t-x" }));
        expect(res.status).toBe(404);
    });

    it("withFields=1 → tip + alanlar", async () => {
        mockDbGetProductTypeWithFields.mockResolvedValue({ ...sampleType, fields: [sampleField] });
        const res = await typeIdGET(
            makeReq(undefined, "GET", "http://localhost/api/product-types/t-1?withFields=1") as unknown as Parameters<typeof typeIdGET>[0],
            makeParams({ id: "t-1" })
        );
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.fields.length).toBe(1);
        expect(body.fields[0].field_key).toBe("dn");
    });
});

// ── PATCH /api/product-types/[id] ───────────────────────────────

describe("PATCH /api/product-types/[id]", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await typeIdPATCH(makeReq({ name: "X" }, "PATCH") as unknown as Parameters<typeof typeIdPATCH>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(403);
    });

    it("yok → 404", async () => {
        mockDbGetProductType.mockResolvedValue(null);
        const res = await typeIdPATCH(makeReq({ name: "X" }, "PATCH") as unknown as Parameters<typeof typeIdPATCH>[0], makeParams({ id: "t-x" }));
        expect(res.status).toBe(404);
    });

    it("başarılı patch → 200", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        mockDbUpdateProductType.mockResolvedValue({ ...sampleType, name: "Vana Updated" });
        const res = await typeIdPATCH(makeReq({ name: "Vana Updated" }, "PATCH") as unknown as Parameters<typeof typeIdPATCH>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(200);
    });
});

// ── DELETE /api/product-types/[id] ──────────────────────────────

describe("DELETE /api/product-types/[id]", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await typeIdDELETE(makeReq(undefined, "DELETE") as unknown as Parameters<typeof typeIdDELETE>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(403);
    });

    it("yok → 404", async () => {
        mockDbGetProductType.mockResolvedValue(null);
        const res = await typeIdDELETE(makeReq(undefined, "DELETE") as unknown as Parameters<typeof typeIdDELETE>[0], makeParams({ id: "t-x" }));
        expect(res.status).toBe(404);
    });

    it("sistem tipi → 409", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        mockDbDeleteProductType.mockRejectedValue(new Error("Sistem tipi silinemez. Önce kilidi düşürün."));
        const res = await typeIdDELETE(makeReq(undefined, "DELETE") as unknown as Parameters<typeof typeIdDELETE>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(409);
    });

    it("bağlı ürün varsa → 409", async () => {
        mockDbGetProductType.mockResolvedValue({ ...sampleType, is_system: false });
        mockDbDeleteProductType.mockRejectedValue(new Error("Bu tipe bağlı 5 ürün var; tip silinemez."));
        const res = await typeIdDELETE(makeReq(undefined, "DELETE") as unknown as Parameters<typeof typeIdDELETE>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(409);
    });
});

// ── GET /api/product-types/[id]/fields ──────────────────────────

describe("GET /api/product-types/[id]/fields", () => {
    it("parent yok → 404", async () => {
        mockDbGetProductType.mockResolvedValue(null);
        const res = await fieldsGET(makeReq(undefined, "GET") as unknown as Parameters<typeof fieldsGET>[0], makeParams({ id: "t-x" }));
        expect(res.status).toBe(404);
    });

    it("200 + alanlar listesi", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        mockDbListProductTypeFields.mockResolvedValue([sampleField]);
        const res = await fieldsGET(makeReq(undefined, "GET") as unknown as Parameters<typeof fieldsGET>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.length).toBe(1);
    });
});

// ── POST /api/product-types/[id]/fields ─────────────────────────

describe("POST /api/product-types/[id]/fields", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await fieldsPOST(makeReq({ field_key: "dn", label_tr: "DN", field_type: "number" }) as unknown as Parameters<typeof fieldsPOST>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(403);
    });

    it("parent yok → 404", async () => {
        mockDbGetProductType.mockResolvedValue(null);
        const res = await fieldsPOST(makeReq({ field_key: "dn", label_tr: "DN", field_type: "number" }) as unknown as Parameters<typeof fieldsPOST>[0], makeParams({ id: "t-x" }));
        expect(res.status).toBe(404);
    });

    it("options dizi değil → 400", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        const res = await fieldsPOST(makeReq({
            field_key: "color",
            label_tr: "Renk",
            field_type: "select",
            options: "Red,Green",
        }) as unknown as Parameters<typeof fieldsPOST>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(400);
    });

    it("aynı field_key zaten var → 400", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        mockDbAddProductTypeField.mockRejectedValue(new Error("Bu alan anahtarı bu tipte zaten var."));
        const res = await fieldsPOST(makeReq({
            field_key: "dn",
            label_tr: "DN",
            field_type: "number",
        }) as unknown as Parameters<typeof fieldsPOST>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(400);
    });

    it("başarılı → 201", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        mockDbAddProductTypeField.mockResolvedValue(sampleField);
        const res = await fieldsPOST(makeReq({
            field_key: "dn",
            label_tr: "DN",
            field_type: "number",
            unit: "mm",
            required: true,
        }) as unknown as Parameters<typeof fieldsPOST>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(201);
    });
});

// ── PUT /api/product-types/[id]/fields (reorder) ────────────────

describe("PUT /api/product-types/[id]/fields", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await fieldsPUT(makeReq({ ids: ["a", "b"] }, "PUT") as unknown as Parameters<typeof fieldsPUT>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(403);
    });

    it("parent yok → 404", async () => {
        mockDbGetProductType.mockResolvedValue(null);
        const res = await fieldsPUT(makeReq({ ids: ["a"] }, "PUT") as unknown as Parameters<typeof fieldsPUT>[0], makeParams({ id: "t-x" }));
        expect(res.status).toBe(404);
    });

    it("ids dizi değil → 400", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        const res = await fieldsPUT(makeReq({ ids: "not-array" }, "PUT") as unknown as Parameters<typeof fieldsPUT>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(400);
    });

    it("başarılı → 200", async () => {
        mockDbGetProductType.mockResolvedValue(sampleType);
        mockDbReorderProductTypeFields.mockResolvedValue(undefined);
        const res = await fieldsPUT(makeReq({ ids: ["f-1", "f-2"] }, "PUT") as unknown as Parameters<typeof fieldsPUT>[0], makeParams({ id: "t-1" }));
        expect(res.status).toBe(200);
    });
});

// ── PATCH/DELETE /api/product-types/[id]/fields/[fieldId] ───────

describe("PATCH /api/product-types/[id]/fields/[fieldId]", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await fieldIdPATCH(makeReq({ required: false }, "PATCH") as unknown as Parameters<typeof fieldIdPATCH>[0], makeParams({ id: "t-1", fieldId: "f-1" }));
        expect(res.status).toBe(403);
    });

    it("yok → 404", async () => {
        mockDbUpdateProductTypeField.mockRejectedValue(new Error("Alan bulunamadı."));
        const res = await fieldIdPATCH(makeReq({ required: false }, "PATCH") as unknown as Parameters<typeof fieldIdPATCH>[0], makeParams({ id: "t-1", fieldId: "f-x" }));
        expect(res.status).toBe(404);
    });

    it("başarılı → 200", async () => {
        mockDbUpdateProductTypeField.mockResolvedValue({ ...sampleField, required: false });
        const res = await fieldIdPATCH(makeReq({ required: false }, "PATCH") as unknown as Parameters<typeof fieldIdPATCH>[0], makeParams({ id: "t-1", fieldId: "f-1" }));
        expect(res.status).toBe(200);
    });
});

describe("DELETE /api/product-types/[id]/fields/[fieldId]", () => {
    it("non-admin → 403", async () => {
        mockRequireRole.mockResolvedValue(new Response(JSON.stringify({ error: "Yetkiniz yok." }), { status: 403 }));
        const res = await fieldIdDELETE(makeReq(undefined, "DELETE") as unknown as Parameters<typeof fieldIdDELETE>[0], makeParams({ id: "t-1", fieldId: "f-1" }));
        expect(res.status).toBe(403);
    });

    it("yok → 404", async () => {
        mockDbDeleteProductTypeField.mockRejectedValue(new Error("Alan bulunamadı."));
        const res = await fieldIdDELETE(makeReq(undefined, "DELETE") as unknown as Parameters<typeof fieldIdDELETE>[0], makeParams({ id: "t-1", fieldId: "f-x" }));
        expect(res.status).toBe(404);
    });

    it("başarılı → 200", async () => {
        mockDbDeleteProductTypeField.mockResolvedValue(undefined);
        const res = await fieldIdDELETE(makeReq(undefined, "DELETE") as unknown as Parameters<typeof fieldIdDELETE>[0], makeParams({ id: "t-1", fieldId: "f-1" }));
        expect(res.status).toBe(200);
    });
});
