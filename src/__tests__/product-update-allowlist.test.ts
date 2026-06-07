import { describe, it, expect, vi, beforeEach } from "vitest";

// Faz C — dbUpdateProduct allow-list + undefined-drop davranışı.
// createServiceClient mock'la .update() argümanını yakalar.
let capturedUpdate: Record<string, unknown> | null = null;

const single = vi.fn(async () => ({ data: { id: "p-1", on_hand: 5, reserved: 2 }, error: null }));
const select = vi.fn(() => ({ single }));
const eq = vi.fn(() => ({ select }));
const update = vi.fn((arg: Record<string, unknown>) => { capturedUpdate = arg; return { eq }; });
const from = vi.fn(() => ({ update }));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from }),
}));

import { dbUpdateProduct } from "@/lib/supabase/products";

beforeEach(() => {
    capturedUpdate = null;
    update.mockClear();
});

describe("dbUpdateProduct — Faz C allow-list + undefined drop", () => {
    it("izinli alanlar geçer; undefined alanlar düşer", async () => {
        await dbUpdateProduct("p-1", {
            name: "Yeni", category: "Vana", attributes: { dn: 50 },
            unit: undefined, // undefined → drop (fill-empty "yazma")
        });
        expect(capturedUpdate).toEqual({ name: "Yeni", category: "Vana", attributes: { dn: 50 } });
        expect(capturedUpdate).not.toHaveProperty("unit");
    });

    it("allow-list dışı alanlar (reserved/id/rastgele) DB'ye yazılmaz", async () => {
        await dbUpdateProduct("p-1", {
            name: "Yeni",
            // @ts-expect-error — kasıtlı yasak alan (savunma testi)
            reserved: 999, id: "hack", evil_col: "x",
        });
        expect(capturedUpdate).toEqual({ name: "Yeni" });
        expect(capturedUpdate).not.toHaveProperty("reserved");
        expect(capturedUpdate).not.toHaveProperty("id");
        expect(capturedUpdate).not.toHaveProperty("evil_col");
    });

    it("product_type_id ve is_active izinlidir (import + soft-delete yolları)", async () => {
        await dbUpdateProduct("p-1", { product_type_id: "t-1", is_active: false });
        expect(capturedUpdate).toEqual({ product_type_id: "t-1", is_active: false });
    });
});
