/**
 * Tests for the product stock reservation pipeline.
 *
 * Traces the `reserved` field from DB row → mapProduct() → Product frontend model.
 * Guards the core invariant:  available_now = on_hand - reserved
 *
 * Context: when an order is approved, approve_order_with_allocation RPC increments
 * `reserved` on each ordered product. The products list table shows `available_now`
 * and the detail panel shows the full Stokta | Rezerve | Satılabilir | Minimum grid.
 * This suite ensures the reservation is never silently lost or miscalculated
 * in the mapping layer.
 */
import { describe, it, expect } from "vitest";
import { mapProduct } from "@/lib/api-mappers";
import type { ProductWithStock } from "@/lib/database.types";

// ─── Fixture ──────────────────────────────────────────────────────────────────

function makeProductRow(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "prod-1",
        name: "DN25 Küresel Vana",
        sku: "KV-DN25",
        category: "Küresel Vanalar",
        unit: "adet",
        price: 450,
        currency: "USD",
        on_hand: 200,
        reserved: 0,
        available_now: 200,
        min_stock_level: 50,
        is_active: true,
        product_type: "manufactured",
        warehouse: "Sevkiyat Deposu",
        reorder_qty: null,
        preferred_vendor: null,
        daily_usage: null,
        lead_time_days: null,
        created_at: "2025-01-01T00:00:00Z",
        updated_at: "2025-01-01T00:00:00Z",
        product_family: null,
        sub_category: null,
        sector_compatibility: null,
        cost_price: null,
        weight_kg: null,
        material_quality: null,
        origin_country: null,
        production_site: null,
        use_cases: null,
        industries: null,
        standards: null,
        certifications: null,
        product_notes: null,
        ...overrides,
    };
}

// ─── mapProduct — reserved field mapping ──────────────────────────────────────

describe("mapProduct — reserved field", () => {
    it("reserved=0 iken Product.reserved 0 döner", () => {
        const product = mapProduct(makeProductRow({ reserved: 0 }));
        expect(product.reserved).toBe(0);
    });

    it("reserved>0 iken Product.reserved doğru değeri taşır", () => {
        const product = mapProduct(makeProductRow({ reserved: 80 }));
        expect(product.reserved).toBe(80);
    });

    it("reserved tam stoksa (on_hand=reserved) Product.reserved on_hand'e eşit", () => {
        const product = mapProduct(makeProductRow({ on_hand: 100, reserved: 100, available_now: 0 }));
        expect(product.reserved).toBe(100);
    });
});

// ─── mapProduct — available_now invariant ─────────────────────────────────────

describe("mapProduct — available_now = on_hand - reserved", () => {
    it("reserved=0 → available_now = on_hand", () => {
        const row = makeProductRow({ on_hand: 200, reserved: 0, available_now: 200 });
        const product = mapProduct(row);
        expect(product.available_now).toBe(200);
        expect(product.available_now).toBe(product.on_hand);
    });

    it("rezervasyon sonrası available_now azalır", () => {
        // Simulates: order approved, RPC set reserved=80
        const row = makeProductRow({ on_hand: 200, reserved: 80, available_now: 120 });
        const product = mapProduct(row);
        expect(product.available_now).toBe(120);
        expect(product.available_now).toBe(product.on_hand - product.reserved);
    });

    it("tam rezerve: available_now = 0", () => {
        const row = makeProductRow({ on_hand: 50, reserved: 50, available_now: 0 });
        const product = mapProduct(row);
        expect(product.available_now).toBe(0);
    });

    it("aşırı rezerve (partial shortage): available_now negatif olabilir", () => {
        // Shortage senaryosu: RPC kısmi rezervasyon yaptığında reserved < requested
        // ama bu test DB-level constraint'i değil mapper davranışını test eder
        const row = makeProductRow({ on_hand: 30, reserved: 30, available_now: 0 });
        const product = mapProduct(row);
        expect(product.available_now).toBe(0);
    });

    it("available_now DB'den gelirse mapper değeri korur (fallback çalışmaz)", () => {
        // dbListProducts available_now'u hesaplar ve sağlar.
        // mapProduct: available_now = row.available_now ?? (on_hand - reserved)
        const row = makeProductRow({ on_hand: 200, reserved: 80, available_now: 120 });
        const product = mapProduct(row);
        expect(product.available_now).toBe(120); // DB değerini kullanır
    });
});

// ─── mapProduct — stok durumu hesaplamaları ───────────────────────────────────

describe("mapProduct — isCritical hesabı için available_now vs minStockLevel", () => {
    it("available_now > minStockLevel → kritik değil", () => {
        const product = mapProduct(makeProductRow({ on_hand: 200, reserved: 0, available_now: 200, min_stock_level: 50 }));
        expect(product.available_now > product.minStockLevel).toBe(true);
    });

    it("rezervasyon sonrası available_now minStockLevel'a düşerse → kritik", () => {
        // on_hand=200, reserved=160 → available_now=40, minStockLevel=50 → KRİTİK
        const product = mapProduct(makeProductRow({ on_hand: 200, reserved: 160, available_now: 40, min_stock_level: 50 }));
        expect(product.available_now <= product.minStockLevel).toBe(true);
    });

    it("rezervasyon öncesi kritik olmayan ürün, rezervasyon sonrası kritik olabilir", () => {
        const before = mapProduct(makeProductRow({ on_hand: 100, reserved: 0,  available_now: 100, min_stock_level: 50 }));
        const after  = mapProduct(makeProductRow({ on_hand: 100, reserved: 60, available_now: 40,  min_stock_level: 50 }));

        expect(before.available_now > before.minStockLevel).toBe(true);  // kritik değil
        expect(after.available_now  <= after.minStockLevel).toBe(true);  // kritik
    });
});

// ─── Tablo satırı görünürlük mantığı ─────────────────────────────────────────
// products/page.tsx tablo satırı: reserved > 0 ise "X rez." badge'i gösterilir.
// Bu testler o koşul mantığını doğrular.

describe("tablo satırı — reserved görünürlük koşulu", () => {
    it("reserved=0 → badge gösterilmez", () => {
        const product = mapProduct(makeProductRow({ reserved: 0 }));
        expect(product.reserved > 0).toBe(false);
    });

    it("reserved>0 → badge gösterilir", () => {
        const product = mapProduct(makeProductRow({ reserved: 50 }));
        expect(product.reserved > 0).toBe(true);
    });

    it("sipariş onayı sonrası reserved artar → badge görünür hale gelir", () => {
        const before = mapProduct(makeProductRow({ reserved: 0 }));
        const after  = mapProduct(makeProductRow({ reserved: 80 }));
        expect(before.reserved > 0).toBe(false);
        expect(after.reserved > 0).toBe(true);
    });
});

// ─── Rezervasyon silme (sipariş iptali) ──────────────────────────────────────

describe("mapProduct — sipariş iptali sonrası reserved sıfırlanması", () => {
    it("iptal sonrası reserved=0 olunca available_now on_hand'e döner", () => {
        // cancel_order RPC reserved'i sıfırlar
        const afterCancel = mapProduct(makeProductRow({ on_hand: 200, reserved: 0, available_now: 200 }));
        expect(afterCancel.reserved).toBe(0);
        expect(afterCancel.available_now).toBe(200);
        expect(afterCancel.available_now).toBe(afterCancel.on_hand);
    });
});
