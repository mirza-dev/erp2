/**
 * dbListProductTypes — nested count unwrap (N+1 fix backend).
 *
 * PostgREST `select("*, product_type_fields(count)")` her satıra
 * `product_type_fields: [{ count: N }]` ekler → helper bunu `fieldCount: N`'e unwrap eder
 * ve product_type_fields'i çıkarır (additive shape; mevcut ProductTypeRow alanları korunur).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

let _result: { data: unknown; error: unknown } = { data: [], error: null };
function setResult(v: { data: unknown; error: unknown }) { _result = v; }

const makeChain = () => {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.order = () => chain;
    // thenable → await chain → _result
    (chain as { then: unknown }).then = (resolve: (v: unknown) => unknown) => resolve(_result);
    return chain;
};

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: () => makeChain() }),
}));

beforeEach(() => setResult({ data: [], error: null }));

describe("dbListProductTypes nested count", () => {
    it("product_type_fields: [{count:N}] → fieldCount:N + alan çıkarılır", async () => {
        setResult({
            data: [
                { id: "t-1", name: "Vana", sort_order: 10, is_system: true, product_type_fields: [{ count: 16 }] },
                { id: "t-2", name: "Conta", sort_order: 20, is_system: true, product_type_fields: [{ count: 13 }] },
            ],
            error: null,
        });
        const { dbListProductTypes } = await import("@/lib/supabase/product-types");
        const rows = await dbListProductTypes();
        expect(rows[0]).toMatchObject({ id: "t-1", name: "Vana", fieldCount: 16 });
        expect(rows[1].fieldCount).toBe(13);
        // nested alan dışarıya sızmaz
        expect("product_type_fields" in rows[0]).toBe(false);
    });

    it("alan yok / boş array → fieldCount 0", async () => {
        setResult({
            data: [
                { id: "t-3", name: "Diğer", sort_order: 80, is_system: true, product_type_fields: [] },
                { id: "t-4", name: "Boş", sort_order: 90, is_system: true },
            ],
            error: null,
        });
        const { dbListProductTypes } = await import("@/lib/supabase/product-types");
        const rows = await dbListProductTypes();
        expect(rows[0].fieldCount).toBe(0);
        expect(rows[1].fieldCount).toBe(0);
    });

    it("supabase error → throw", async () => {
        setResult({ data: null, error: { message: "boom" } });
        const { dbListProductTypes } = await import("@/lib/supabase/product-types");
        await expect(dbListProductTypes()).rejects.toThrow("boom");
    });
});
