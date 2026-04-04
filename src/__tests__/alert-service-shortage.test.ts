/**
 * Regression tests for order_shortage alert logic in serviceScanStockAlerts.
 *
 * Bug fixed: available_now < reserved ≡ on_hand < 2*reserved → false positives.
 * Correct source of truth: open records in shortages table (approved orders only).
 *
 * domain-rules.md §12 — alert lifecycle
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────────────────────

const mockDbListProducts = vi.fn();
const mockDbGetOpenShortagesByProduct = vi.fn();
const mockDbListOrders = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: (...args: unknown[]) => mockDbListProducts(...args),
    dbGetOpenShortagesByProduct: () => mockDbGetOpenShortagesByProduct(),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders: (...args: unknown[]) => mockDbListOrders(...args),
}));

const mockDbOpenAlertExists    = vi.fn();
const mockDbCreateAlert        = vi.fn();
const mockDbResolveAlertsForEntity = vi.fn();
const mockDbListAlerts         = vi.fn();
const mockDbGetAlertById       = vi.fn();
const mockDbUpdateAlertStatus  = vi.fn();
const mockDbDismissAlertsBySource = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:               (...args: unknown[]) => mockDbListAlerts(...args),
    dbGetAlertById:             (...args: unknown[]) => mockDbGetAlertById(...args),
    dbOpenAlertExists:          (...args: unknown[]) => mockDbOpenAlertExists(...args),
    dbCreateAlert:              (...args: unknown[]) => mockDbCreateAlert(...args),
    dbUpdateAlertStatus:        (...args: unknown[]) => mockDbUpdateAlertStatus(...args),
    dbResolveAlertsForEntity:   (...args: unknown[]) => mockDbResolveAlertsForEntity(...args),
    dbDismissAlertsBySource:    (...args: unknown[]) => mockDbDismissAlertsBySource(...args),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiGenerateOpsSummary: vi.fn(),
}));

import { serviceScanStockAlerts } from "@/lib/services/alert-service";
import type { ProductWithStock } from "@/lib/database.types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Product with reserved > available_now, but NO real shortage in the DB */
const HEAVILY_RESERVED_NO_SHORTAGE: ProductWithStock = {
    id: "prod-reserved",
    name: "Ağır Rezerveli Ürün",
    sku: "HEAVY-RES",
    category: "Vana",
    unit: "adet",
    price: 500,
    currency: "USD",
    // on_hand=100, reserved=60 → available_now=40
    // Old buggy check: available(40) < reserved(60) → true → FALSE POSITIVE
    on_hand: 100,
    reserved: 60,
    available_now: 40,   // = on_hand - reserved
    min_stock_level: 20,  // available(40) > min(20)*1.5=30 → healthy stock
    is_active: true,
    product_type: "finished",
    warehouse: null,
    reorder_qty: null,
    preferred_vendor: null,
    daily_usage: null,
    lead_time_days: null,
    product_family: null,
    sub_category: null,
    sector_compatibility: null,
    cost_price: null,
    weight_kg: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
};

/** Product with a real open shortage in the shortages table */
const PRODUCT_WITH_REAL_SHORTAGE: ProductWithStock = {
    id: "prod-short",
    name: "Eksik Stok Ürünü",
    sku: "REAL-SHORT",
    category: "Vana",
    unit: "adet",
    price: 200,
    currency: "USD",
    // Order wanted 50, only 30 could be reserved → shortage_qty=20
    on_hand: 30,
    reserved: 30,
    available_now: 0,
    min_stock_level: 5,
    is_active: true,
    product_type: "finished",
    warehouse: null,
    reorder_qty: null,
    preferred_vendor: null,
    daily_usage: null,
    lead_time_days: null,
    product_family: null,
    sub_category: null,
    sector_compatibility: null,
    cost_price: null,
    weight_kg: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
};

/** Healthy product — no reservations, no shortages */
const HEALTHY_PRODUCT: ProductWithStock = {
    id: "prod-healthy",
    name: "Sağlıklı Ürün",
    sku: "HEALTHY",
    category: "Vana",
    unit: "adet",
    price: 100,
    currency: "USD",
    on_hand: 200,
    reserved: 0,
    available_now: 200,
    min_stock_level: 10,
    is_active: true,
    product_type: "finished",
    warehouse: null,
    reorder_qty: null,
    preferred_vendor: null,
    daily_usage: null,
    lead_time_days: null,
    product_family: null,
    sub_category: null,
    sector_compatibility: null,
    cost_price: null,
    weight_kg: null,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function emptyShortageMap(): Map<string, number> {
    return new Map();
}

function shortageMapFor(productId: string, qty: number): Map<string, number> {
    return new Map([[productId, qty]]);
}

function setupDefaultAlertMocks() {
    mockDbOpenAlertExists.mockResolvedValue(false);
    mockDbCreateAlert.mockResolvedValue({ id: "alert-new" });
    mockDbResolveAlertsForEntity.mockResolvedValue(0);
}

beforeEach(() => {
    mockDbListProducts.mockReset();
    mockDbGetOpenShortagesByProduct.mockReset();
    mockDbOpenAlertExists.mockReset();
    mockDbCreateAlert.mockReset();
    mockDbResolveAlertsForEntity.mockReset();
    setupDefaultAlertMocks();
});

// ── Block 1: False positive prevention ───────────────────────────────────────

describe("order_shortage — false positive prevention", () => {
    it("available < reserved ama shortages tablosunda kayıt yok → alert açılmaz", async () => {
        // HEAVILY_RESERVED_NO_SHORTAGE: available(40) < reserved(60)
        // Eski bug: bu koşul true → false positive alert açılırdı
        // Yeni davranış: shortageMap boş → alert açılmamalı
        mockDbListProducts.mockResolvedValue([HEAVILY_RESERVED_NO_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(emptyShortageMap());

        await serviceScanStockAlerts();

        const shortageAlertCalls = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_shortage"
        );
        expect(shortageAlertCalls).toHaveLength(0);
    });

    it("on_hand=100, reserved=60 (available=40) → available < reserved ama shortages yok → created=0", async () => {
        mockDbListProducts.mockResolvedValue([HEAVILY_RESERVED_NO_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(emptyShortageMap());

        const result = await serviceScanStockAlerts();

        // Stok sağlıklı (available=40 > min=20*1.5=30) → stock alertler de yok
        expect(result.created).toBe(0);
    });

    it("available < reserved ama shortages yok → dbOpenAlertExists order_shortage için çağrılmaz", async () => {
        mockDbListProducts.mockResolvedValue([HEAVILY_RESERVED_NO_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(emptyShortageMap());

        await serviceScanStockAlerts();

        const shortageExistsCalls = mockDbOpenAlertExists.mock.calls.filter(
            ([type]) => type === "order_shortage"
        );
        expect(shortageExistsCalls).toHaveLength(0);
    });
});

// ── Block 2: True positive — real shortage in DB ──────────────────────────────

describe("order_shortage — gerçek shortage durumu alert açar", () => {
    it("shortages tablosunda 20 adet eksik → order_shortage alert açılır", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_WITH_REAL_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(
            shortageMapFor(PRODUCT_WITH_REAL_SHORTAGE.id, 20)
        );
        mockDbOpenAlertExists.mockResolvedValue(false);

        await serviceScanStockAlerts();

        const shortageAlertCalls = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_shortage"
        );
        expect(shortageAlertCalls).toHaveLength(1);
        expect(shortageAlertCalls[0][0].severity).toBe("critical");
        expect(shortageAlertCalls[0][0].entity_id).toBe(PRODUCT_WITH_REAL_SHORTAGE.id);
    });

    it("shortage alert açılırken description shortage_qty içeriyor", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_WITH_REAL_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(
            shortageMapFor(PRODUCT_WITH_REAL_SHORTAGE.id, 20)
        );
        mockDbOpenAlertExists.mockResolvedValue(false);

        await serviceScanStockAlerts();

        const [input] = mockDbCreateAlert.mock.calls.find(([i]) => i.type === "order_shortage");
        expect(input.description).toContain("20");
    });

    it("alert zaten açıksa duplicate açılmaz", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_WITH_REAL_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(
            shortageMapFor(PRODUCT_WITH_REAL_SHORTAGE.id, 20)
        );
        mockDbOpenAlertExists.mockResolvedValue(true); // already open

        await serviceScanStockAlerts();

        const shortageAlertCalls = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_shortage"
        );
        expect(shortageAlertCalls).toHaveLength(0);
    });

    it("result.created shortage alert'ı sayıyor", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_WITH_REAL_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(
            shortageMapFor(PRODUCT_WITH_REAL_SHORTAGE.id, 15)
        );
        mockDbOpenAlertExists.mockResolvedValue(false);
        mockDbCreateAlert.mockResolvedValue({ id: "new-alert" });

        const result = await serviceScanStockAlerts();
        expect(result.created).toBeGreaterThanOrEqual(1);
    });
});

// ── Block 3: Resolution — shortage kapanınca alert kapanır ───────────────────

describe("order_shortage — shortage çözülünce alert resolve edilir", () => {
    it("openShortageQty=0 → dbResolveAlertsForEntity order_shortage için çağrılır", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_WITH_REAL_SHORTAGE]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(emptyShortageMap()); // shortage resolved
        mockDbResolveAlertsForEntity.mockResolvedValue(1);

        await serviceScanStockAlerts();

        const resolveCalls = mockDbResolveAlertsForEntity.mock.calls.filter(
            ([type]) => type === "order_shortage"
        );
        expect(resolveCalls).toHaveLength(1);
        expect(resolveCalls[0][1]).toBe(PRODUCT_WITH_REAL_SHORTAGE.id);
    });

    it("shortage yok → resolve reason 'shortage_resolved'", async () => {
        mockDbListProducts.mockResolvedValue([HEALTHY_PRODUCT]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(emptyShortageMap());

        await serviceScanStockAlerts();

        const resolveCalls = mockDbResolveAlertsForEntity.mock.calls.filter(
            ([type]) => type === "order_shortage"
        );
        expect(resolveCalls[0][2]).toBe("shortage_resolved");
    });

    it("rezervasyon sıfırlandıktan sonra bile (reserved=0) shortage yok → alert resolve edilir", async () => {
        // Eski bug: reserved=0 → else if (reserved > 0 && ...) false → asla resolve edilmezdi
        const cancelledProduct = { ...HEALTHY_PRODUCT, id: "prod-cancelled", reserved: 0, available_now: 200 };
        mockDbListProducts.mockResolvedValue([cancelledProduct]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(emptyShortageMap());
        mockDbResolveAlertsForEntity.mockResolvedValue(1);

        await serviceScanStockAlerts();

        const resolveCalls = mockDbResolveAlertsForEntity.mock.calls.filter(
            ([type]) => type === "order_shortage"
        );
        expect(resolveCalls).toHaveLength(1);
    });
});

// ── Block 4: Correct data source — shortages tablosu kullanılıyor ─────────────

describe("order_shortage — doğru veri kaynağı: shortages tablosu", () => {
    it("scan başlamadan önce dbGetOpenShortagesByProduct çağrılır", async () => {
        mockDbListProducts.mockResolvedValue([]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(emptyShortageMap());

        await serviceScanStockAlerts();

        expect(mockDbGetOpenShortagesByProduct).toHaveBeenCalledOnce();
    });

    it("birden fazla ürün için shortage doğru product_id üzerinden eşleştirilir", async () => {
        mockDbListProducts.mockResolvedValue([
            HEAVILY_RESERVED_NO_SHORTAGE,  // available < reserved, NO shortage
            PRODUCT_WITH_REAL_SHORTAGE,     // has real shortage
        ]);
        // Only PRODUCT_WITH_REAL_SHORTAGE has a shortage
        const map = new Map([[PRODUCT_WITH_REAL_SHORTAGE.id, 10]]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(map);
        mockDbOpenAlertExists.mockResolvedValue(false);

        await serviceScanStockAlerts();

        const shortageAlertCalls = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_shortage"
        );
        expect(shortageAlertCalls).toHaveLength(1);
        expect(shortageAlertCalls[0][0].entity_id).toBe(PRODUCT_WITH_REAL_SHORTAGE.id);
    });
});
