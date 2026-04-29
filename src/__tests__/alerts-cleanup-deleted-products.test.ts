/**
 * Sprint A G1 — Silinmiş ürün uyarılarının auto-cleanup'ı.
 *
 * Senaryo:
 *   - Aktif ürün listesinde olmayan (silinmiş veya is_active=false) ürünlere
 *     ait stock_critical / stock_risk / order_deadline / order_shortage uyarıları
 *     scan başında batch resolve edilir; reason: "product_deleted_or_deactivated".
 *   - Aktif ürün uyarıları etkilenmez.
 *   - Mevcut N+1 optimize akış bozulmaz.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbListAllActiveProducts     = vi.fn();
const mockDbGetOpenShortagesByProduct = vi.fn();
const mockDbGetQuotedQuantities       = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts:       (...a: unknown[]) => mockDbListAllActiveProducts(...a),
    dbGetOpenShortagesByProduct:   () => mockDbGetOpenShortagesByProduct(),
    dbGetQuotedQuantities:         (...a: unknown[]) => mockDbGetQuotedQuantities(...a),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders:           vi.fn().mockResolvedValue([]),
    dbListOverdueShipments: vi.fn().mockResolvedValue([]),
}));

const mockDbCreateAlert            = vi.fn();
const mockDbListAlerts             = vi.fn();
const mockDbGetAlertById           = vi.fn();
const mockDbUpdateAlertStatus      = vi.fn();
const mockDbDismissAlertsBySource  = vi.fn();
const mockDbListActiveAlerts       = vi.fn();
const mockDbBatchResolveAlerts     = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:             (...a: unknown[]) => mockDbListAlerts(...a),
    dbGetAlertById:           (...a: unknown[]) => mockDbGetAlertById(...a),
    dbCreateAlert:            (...a: unknown[]) => mockDbCreateAlert(...a),
    dbUpdateAlertStatus:      (...a: unknown[]) => mockDbUpdateAlertStatus(...a),
    dbDismissAlertsBySource:  (...a: unknown[]) => mockDbDismissAlertsBySource(...a),
    dbListActiveAlerts:       (...a: unknown[]) => mockDbListActiveAlerts(...a),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts:     (...a: unknown[]) => mockDbBatchResolveAlerts(...a),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable:        () => false,
    aiGenerateOpsSummary: vi.fn(),
}));

import { serviceScanStockAlerts } from "@/lib/services/alert-service";
import type { ProductWithStock, AlertRow } from "@/lib/database.types";

function makeProduct(overrides: Partial<ProductWithStock> = {}): ProductWithStock {
    return {
        id: "prod-active-1",
        name: "Aktif Ürün",
        sku: "P-001",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 200,
        reserved: 0,
        available_now: 200,
        min_stock_level: 10,
        is_active: true,
        product_type: "manufactured",
        warehouse: null, reorder_qty: null, preferred_vendor: null,
        daily_usage: null, lead_time_days: null, product_family: null,
        sub_category: null, sector_compatibility: null, cost_price: null,
        weight_kg: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    };
}

function makeAlert(overrides: Partial<AlertRow> = {}): AlertRow {
    return {
        id: "alert-1",
        type: "stock_critical",
        severity: "critical",
        status: "open",
        title: "Test",
        description: "",
        entity_type: "product",
        entity_id: "prod-deleted-1",
        source: "system",
        ai_confidence: null,
        ai_reason: null,
        ai_inputs_summary: null,
        ai_model_version: null,
        resolution_reason: null,
        acknowledged_at: null,
        resolved_at: null,
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
        ...overrides,
    } as AlertRow;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateAlert.mockResolvedValue({ id: "new-alert" });
    mockDbBatchResolveAlerts.mockResolvedValue(0);
    mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map());
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
});

describe("serviceScanStockAlerts — orphan cleanup (Sprint A G1)", () => {
    it("aktif ürün setinde olmayan stock_critical → resolve list'e eklenir", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ id: "prod-active-1" })]);
        mockDbListActiveAlerts.mockResolvedValue([
            makeAlert({ id: "a-orphan", type: "stock_critical", entity_id: "prod-deleted-1" }),
        ]);

        await serviceScanStockAlerts();

        const calls = mockDbBatchResolveAlerts.mock.calls;
        expect(calls.length).toBeGreaterThan(0);
        const allEntries = calls.flatMap((c) => c[0] as Array<{ type: string; entityId: string; reason: string }>);
        const orphanEntry = allEntries.find(
            (e) => e.entityId === "prod-deleted-1" && e.reason === "product_deleted_or_deactivated"
        );
        expect(orphanEntry).toBeDefined();
        expect(orphanEntry!.type).toBe("stock_critical");
    });

    it("4 farklı tip (stock_critical/stock_risk/order_deadline/order_shortage) orphan → hepsi resolve list'te", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([]);
        mockDbListActiveAlerts.mockResolvedValue([
            makeAlert({ id: "a1", type: "stock_critical",  entity_id: "p-del-1" }),
            makeAlert({ id: "a2", type: "stock_risk",      entity_id: "p-del-2", severity: "warning" }),
            makeAlert({ id: "a3", type: "order_deadline",  entity_id: "p-del-3", severity: "warning" }),
            makeAlert({ id: "a4", type: "order_shortage",  entity_id: "p-del-4" }),
        ]);

        await serviceScanStockAlerts();

        const allEntries = mockDbBatchResolveAlerts.mock.calls.flatMap(
            (c) => c[0] as Array<{ type: string; entityId: string; reason: string }>
        );
        const orphanEntries = allEntries.filter((e) => e.reason === "product_deleted_or_deactivated");
        expect(orphanEntries).toHaveLength(4);
        const types = new Set(orphanEntries.map((e) => e.type));
        expect(types).toEqual(new Set(["stock_critical", "stock_risk", "order_deadline", "order_shortage"]));
    });

    it("aktif üründeki uyarı orphan SAYILMAZ (kendi yaşam döngüsü işler)", async () => {
        // Aktif ürün stoğu sağlıklı → eski stock_critical "stock_recovered" reason ile resolve olur,
        // ama "product_deleted_or_deactivated" reason ile DEĞİL.
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ id: "prod-active-1", available_now: 500, min_stock_level: 10 })]);
        mockDbListActiveAlerts.mockResolvedValue([
            makeAlert({ id: "a-active", type: "stock_critical", entity_id: "prod-active-1" }),
        ]);

        await serviceScanStockAlerts();

        const allEntries = mockDbBatchResolveAlerts.mock.calls.flatMap(
            (c) => c[0] as Array<{ type: string; entityId: string; reason: string }>
        );
        const orphanForActive = allEntries.find(
            (e) => e.entityId === "prod-active-1" && e.reason === "product_deleted_or_deactivated"
        );
        expect(orphanForActive).toBeUndefined();
    });

    it("orphan cleanup hedef tip listesi DIŞINDA olan tipler etkilenmez (örn. sync_issue)", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([]);
        mockDbListActiveAlerts.mockResolvedValue([
            makeAlert({ id: "a-sync", type: "sync_issue", entity_id: "p-del-x", entity_type: "sales_order" }),
        ]);

        await serviceScanStockAlerts();

        const allEntries = mockDbBatchResolveAlerts.mock.calls.flatMap(
            (c) => c[0] as Array<{ type: string; entityId: string; reason: string }>
        );
        const syncEntry = allEntries.find((e) => e.type === "sync_issue");
        expect(syncEntry).toBeUndefined();
    });

    it("entity_type='product' olmayan kayıtlar (örn. quote_expired sales_order) etkilenmez", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([]);
        mockDbListActiveAlerts.mockResolvedValue([
            makeAlert({ id: "a-quote", type: "quote_expired", entity_id: "ord-1", entity_type: "sales_order" }),
        ]);

        await serviceScanStockAlerts();

        const allEntries = mockDbBatchResolveAlerts.mock.calls.flatMap(
            (c) => c[0] as Array<{ type: string; entityId: string; reason: string }>
        );
        const quoteEntry = allEntries.find((e) => e.type === "quote_expired");
        expect(quoteEntry).toBeUndefined();
    });
});
