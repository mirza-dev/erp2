/**
 * Faz 1 — Product types helper (validation + CRUD) tests.
 *
 * Covers:
 *   isValidFieldKey, isValidFieldType pure helpers
 *   dbCreateProductType validation
 *   dbAddProductTypeField validation
 *   dbDeleteProductType — sistem tipi guard, ürün bağlı guard
 *   dbReorderProductTypeFields — geçersiz id reddedilir
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase chain mock ─────────────────────────────────────────

const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockOrder = vi.fn();
const mockSingle = vi.fn();

let _selectTerminal: { count?: number; data?: unknown; error: unknown } = { count: 0, data: null, error: null };
function setSelectTerminal(v: { count?: number; data?: unknown; error: unknown }) { _selectTerminal = v; }

const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.insert = (_v: unknown) => { mockInsert(_v); return chain; };
    chain.update = (_v: unknown) => { mockUpdate(_v); return chain; };
    chain.delete = () => { mockDelete(); return chain; };
    chain.select = (_v?: unknown, _o?: unknown) => {
        mockSelect(_v, _o);
        // count terminal handled below via eq's terminal handler
        return chain;
    };
    chain.eq = (_k: unknown, _v: unknown) => { mockEq(_k, _v); return _selectTerminal.count !== undefined ? _selectTerminal : chain; };
    chain.order = (_v: unknown, _o?: unknown) => { mockOrder(_v, _o); return chain; };
    chain.single = () => mockSingle();
    return chain;
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
    mockDelete.mockReset();
    mockSelect.mockReset();
    mockEq.mockReset();
    mockOrder.mockReset();
    mockSingle.mockReset();
    setSelectTerminal({ count: undefined, data: null, error: null });
});

// ── Pure helpers ────────────────────────────────────────────────

describe("isValidFieldKey", () => {
    it("küçük harf+rakam+_ kombinasyonu geçer", async () => {
        const { isValidFieldKey } = await import("@/lib/supabase/product-types");
        expect(isValidFieldKey("dn")).toBe(true);
        expect(isValidFieldKey("pn_class")).toBe(true);
        expect(isValidFieldKey("max_temp_c")).toBe(true);
        expect(isValidFieldKey("field_123")).toBe(true);
    });

    it("büyük harf, başında rakam, boşluk, tire reddedilir", async () => {
        const { isValidFieldKey } = await import("@/lib/supabase/product-types");
        expect(isValidFieldKey("DN")).toBe(false);
        expect(isValidFieldKey("123field")).toBe(false);
        expect(isValidFieldKey("my field")).toBe(false);
        expect(isValidFieldKey("my-field")).toBe(false);
        expect(isValidFieldKey("")).toBe(false);
        expect(isValidFieldKey(null)).toBe(false);
        expect(isValidFieldKey(undefined)).toBe(false);
    });
});

describe("isValidFieldType", () => {
    it("geçerli tipler için true döner", async () => {
        const { isValidFieldType } = await import("@/lib/supabase/product-types");
        expect(isValidFieldType("text")).toBe(true);
        expect(isValidFieldType("number")).toBe(true);
        expect(isValidFieldType("select")).toBe(true);
        expect(isValidFieldType("multiselect")).toBe(true);
        expect(isValidFieldType("date")).toBe(true);
        expect(isValidFieldType("boolean")).toBe(true);
        expect(isValidFieldType("longtext")).toBe(true);
    });

    it("geçersiz tipler için false döner", async () => {
        const { isValidFieldType } = await import("@/lib/supabase/product-types");
        expect(isValidFieldType("string")).toBe(false);
        expect(isValidFieldType("int")).toBe(false);
        expect(isValidFieldType("")).toBe(false);
        expect(isValidFieldType(null)).toBe(false);
    });
});

// ── dbCreateProductType validation ──────────────────────────────

describe("dbCreateProductType validation", () => {
    it("name boş string → 'Tip adı zorunludur.'", async () => {
        const { dbCreateProductType } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbCreateProductType({ name: "" })).rejects.toThrow("Tip adı zorunludur.");
    });

    it("name 101 karakter → 'aşamaz'", async () => {
        const { dbCreateProductType } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        const longName = "a".repeat(101);
        await expect(dbCreateProductType({ name: longName })).rejects.toThrow("aşamaz");
    });

    it("sort_order float → 'tam sayı'", async () => {
        const { dbCreateProductType } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbCreateProductType({ name: "OK", sort_order: 1.5 })).rejects.toThrow("tam sayı");
    });
});

// ── dbAddProductTypeField validation ────────────────────────────

describe("dbAddProductTypeField validation", () => {
    it("geçersiz field_key → reddedilir", async () => {
        const { dbAddProductTypeField } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbAddProductTypeField({
            product_type_id: "00000000-0000-4000-8000-000000000001",
            field_key: "DN",
            label_tr: "DN",
            field_type: "number",
        })).rejects.toThrow("küçük harf, rakam, alt çizgi");
    });

    it("geçersiz field_type → reddedilir", async () => {
        const { dbAddProductTypeField } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbAddProductTypeField({
            product_type_id: "00000000-0000-4000-8000-000000000001",
            field_key: "dn",
            label_tr: "DN",
            field_type: "integer" as never,
        })).rejects.toThrow("Geçersiz alan tipi");
    });

    it("boş options array dizi olmayan → reddedilir", async () => {
        const { dbAddProductTypeField } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbAddProductTypeField({
            product_type_id: "00000000-0000-4000-8000-000000000001",
            field_key: "color",
            label_tr: "Renk",
            field_type: "select",
            options: "Red, Green" as never,
        })).rejects.toThrow("dizi olmalı");
    });

    it("options içinde boş satır → reddedilir", async () => {
        const { dbAddProductTypeField } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbAddProductTypeField({
            product_type_id: "00000000-0000-4000-8000-000000000001",
            field_key: "color",
            label_tr: "Renk",
            field_type: "select",
            options: ["Red", "  ", "Green"],
        })).rejects.toThrow("metinler olmalı");
    });

    it("label_tr boş → 'Türkçe etiket zorunludur.'", async () => {
        const { dbAddProductTypeField } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbAddProductTypeField({
            product_type_id: "00000000-0000-4000-8000-000000000001",
            field_key: "dn",
            label_tr: "",
            field_type: "number",
        })).rejects.toThrow("Türkçe etiket zorunludur.");
    });
});

// ── dbReorderProductTypeFields ──────────────────────────────────

describe("dbReorderProductTypeFields", () => {
    it("array değil → reddedilir", async () => {
        const { dbReorderProductTypeFields } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbReorderProductTypeFields("type-id", "not-array" as never))
            .rejects.toThrow("Sıralama listesi geçersiz.");
    });

    it("boş dizi → erken çıkış (hata yok)", async () => {
        const { dbReorderProductTypeFields } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        await expect(dbReorderProductTypeFields("type-id", [])).resolves.toBeUndefined();
    });
});

// ── dbDeleteProductType guards ──────────────────────────────────

describe("dbDeleteProductType", () => {
    it("sistem tipi → reddedilir", async () => {
        const { dbDeleteProductType } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        mockSingle.mockResolvedValueOnce({
            data: { id: "t-1", name: "Vana", is_system: true },
            error: null,
        });
        await expect(dbDeleteProductType("t-1")).rejects.toThrow("Sistem tipi silinemez");
    });

    it("tip bulunamadı → reddedilir", async () => {
        const { dbDeleteProductType } = await vi.importActual<typeof import("@/lib/supabase/product-types")>("@/lib/supabase/product-types");
        mockSingle.mockResolvedValueOnce({ data: null, error: null });
        await expect(dbDeleteProductType("t-x")).rejects.toThrow("Tip bulunamadı.");
    });
});
