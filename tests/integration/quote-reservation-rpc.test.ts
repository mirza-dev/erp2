/**
 * Teklif → rezervasyon zinciri (mig.088/094/099) — GERÇEK yerel Postgres'te, UI'sız.
 *
 * CLAUDE.md'nin aylardır açık "teklif gönder rezervasyon smoke"unun DB katmanı:
 *   gönder → `products.reserved` artar / `available_now` düşer → bağlı pending_approval sipariş
 *   → ikinci teklif fazlası → kısmi + shortage satırı → reddet (bağlı sipariş iptal) → geri yükselir
 *   → kabul → sipariş approved (rezerv korunur, "light" geçiş).
 * Mock suite'i bu RPC'lerin sözleşmesini görmüyor (helper → RPC zinciri hiçbir yerde koşmuyordu);
 * UI katmanı Playwright `quotes.spec.ts`'te. Yalnız yerel DB (setup.ts fail-closed).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServiceClient } from "@/lib/supabase/service";
import { dbCreateProduct, dbGetProductById } from "@/lib/supabase/products";
import { dbCreateCustomer } from "@/lib/supabase/customers";
import {
    dbCreateQuote, dbUpdateQuoteStatus, dbGetQuote,
    dbSendQuoteCreatePendingOrder, dbCancelQuoteLinkedOrder, dbAcceptQuoteAndCreateOrder,
} from "@/lib/supabase/quotes";

const ts = Date.now();
let productId = "";
let customerId = "";
const quoteIds: string[] = [];

async function orderFor(quoteId: string) {
    const sb = createServiceClient();
    const { data, error } = await sb.from("sales_orders")
        .select("id, commercial_status, fulfillment_status, quote_id")
        .eq("quote_id", quoteId).neq("commercial_status", "cancelled").maybeSingle();
    if (error) throw error;
    return data;
}
async function stock() {
    const p = await dbGetProductById(productId);
    if (!p) throw new Error("ürün yok");
    return { on_hand: p.on_hand, reserved: p.reserved, available_now: p.available_now };
}
async function makeQuote(qty: number) {
    const q = await dbCreateQuote({
        customer_id: customerId, customer_name: `IT Cari ${ts}`, customer_address: "Test Mah. 1, İstanbul",
        currency: "TRY", vat_rate: 20, subtotal: qty * 100, vat_total: qty * 20, grand_total: qty * 120, discount_amount: 0,
        lines: [{ position: 1, product_id: productId, product_code: `IT-RES-${ts}`, description: "Entegrasyon ürünü",
                  quantity: qty, unit_price: 100, line_total: qty * 100 }],
    });
    quoteIds.push(q.id);
    return q;
}

beforeAll(async () => {
    const p = await dbCreateProduct({ name: `IT Rezervasyon ${ts}`, sku: `IT-RES-${ts}`, unit: "adet", price: 100, currency: "TRY", on_hand: 10, min_stock_level: 0 });
    productId = p.id;
    const c = await dbCreateCustomer({ name: `IT Cari ${ts}`, address: "Test Mah. 1, İstanbul", country: "TR", currency: "TRY" });
    customerId = c.id;
});

afterAll(async () => {
    // FK sırası: sales_orders (order_lines/stock_reservations/shortages CASCADE) → quotes → cari →
    // inventory_movements (dbCreateProduct açılış stoğunu hareket olarak yazar; products'a RESTRICT —
    // ilk yazımda atlanmıştı, ürünler yerel DB'de birikti) → ürün. PostgREST hata FIRLATMAZ, döndürür:
    // her adım kontrol edilir ki temizlik sessizce yarım kalmasın.
    const sb = createServiceClient();
    const step = async (label: string, p: PromiseLike<{ error: { message: string } | null }>) => {
        const { error } = await p;
        if (error) throw new Error(`temizlik: ${label} → ${error.message}`);
    };
    if (quoteIds.length) {
        await step("sales_orders", sb.from("sales_orders").delete().in("quote_id", quoteIds));
        await step("quotes", sb.from("quotes").delete().in("id", quoteIds));
    }
    if (customerId) await step("customers", sb.from("customers").delete().eq("id", customerId));
    if (productId) {
        await step("inventory_movements", sb.from("inventory_movements").delete().eq("product_id", productId));
        await step("products", sb.from("products").delete().eq("id", productId));
    }
});

describe("088 zinciri — send → reserve → shortage → reject/release → accept/approve", () => {
    let q1Id = ""; let q2Id = "";

    it("gönder: reserved 0→6, available_now 10→4, bağlı pending_approval sipariş (quote_id) oluşur", async () => {
        expect(await stock()).toEqual({ on_hand: 10, reserved: 0, available_now: 10 });
        const q1 = await makeQuote(6); q1Id = q1.id;
        expect(await dbUpdateQuoteStatus(q1.id, "sent", "draft")).toBe(true);
        const r = await dbSendQuoteCreatePendingOrder(q1.id, null);
        expect(r.already).toBe(false);
        expect(r.total_reserved).toBe(6);
        expect(r.shortages).toEqual([]);
        expect(await stock()).toEqual({ on_hand: 10, reserved: 6, available_now: 4 });
        const o = await orderFor(q1.id);
        expect(o?.commercial_status).toBe("pending_approval");
        expect(o?.fulfillment_status).toBe("allocated");
    });

    it("idempotent: aynı teklif ikinci kez gönderilince sipariş ÇOĞALMAZ, rezerv değişmez", async () => {
        const r = await dbSendQuoteCreatePendingOrder(q1Id, null);
        expect(r.already).toBe(true);
        expect(await stock()).toEqual({ on_hand: 10, reserved: 6, available_now: 4 });
        const sb = createServiceClient();
        const { count } = await sb.from("sales_orders").select("id", { count: "exact", head: true }).eq("quote_id", q1Id);
        expect(count).toBe(1);
    });

    it("ikinci teklif 6 adet: stok 4 → kısmi rezerv 4 + shortage 2; teklif yine gönderilir (zero-stock RAISE yok)", async () => {
        const q2 = await makeQuote(6); q2Id = q2.id;
        expect(await dbUpdateQuoteStatus(q2.id, "sent", "draft")).toBe(true);
        const r = await dbSendQuoteCreatePendingOrder(q2.id, null);
        expect(r.total_requested).toBe(6);
        expect(r.total_reserved).toBe(4);
        expect(r.shortages).toHaveLength(1);
        expect(r.shortages[0]).toMatchObject({ requested: 6, reserved: 4, shortage: 2 });
        expect(await stock()).toEqual({ on_hand: 10, reserved: 10, available_now: 0 });
        const o = await orderFor(q2.id);
        expect(o?.commercial_status).toBe("pending_approval");
        expect(o?.fulfillment_status).toBe("partially_allocated");
        const sb = createServiceClient();
        const { data: sh } = await sb.from("shortages").select("shortage_qty, status").eq("order_id", o!.id);
        expect(sh).toEqual([{ shortage_qty: 2, status: "open" }]);
    });

    it("reddet: bağlı sipariş cancelled, rezerv 10→6 (available_now 0→4)", async () => {
        await dbCancelQuoteLinkedOrder(q2Id);
        expect(await orderFor(q2Id)).toBeNull();           // cancelled olmayan sipariş kalmadı
        expect(await stock()).toEqual({ on_hand: 10, reserved: 6, available_now: 4 });
    });

    it("kabul: bağlı pending sipariş approved olur, teklif accepted, rezerv AYNEN korunur (light geçiş)", async () => {
        const r = await dbAcceptQuoteAndCreateOrder(q1Id, null);
        expect(r.already).toBe(true);                      // sipariş zaten vardı, yeni üretilmedi
        const o = await orderFor(q1Id);
        expect(o?.commercial_status).toBe("approved");
        expect((await dbGetQuote(q1Id))?.status).toBe("accepted");
        expect(await stock()).toEqual({ on_hand: 10, reserved: 6, available_now: 4 });
    });
});
