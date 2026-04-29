/**
 * Sprint A G8 — 24 saat dismiss dedup + severity escalation bypass.
 *
 * Senaryo:
 *   - Manuel "Yoksay" sonrası 24 saat içinde aynı tip+ürün için yeni alert oluşturulmaz.
 *   - Eğer durum kötüleşirse (severity yükselirse) bypass: yeni alert oluşturulur.
 *   - purchase_recommended (AI) bu kuraldan muaf — dbListRecentlyDismissed sadece
 *     stock_critical/stock_risk/order_deadline/order_shortage döndürür.
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
const mockDbListRecentlyDismissed  = vi.fn();
const mockDbBatchResolveAlerts     = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:             (...a: unknown[]) => mockDbListAlerts(...a),
    dbGetAlertById:           (...a: unknown[]) => mockDbGetAlertById(...a),
    dbCreateAlert:            (...a: unknown[]) => mockDbCreateAlert(...a),
    dbUpdateAlertStatus:      (...a: unknown[]) => mockDbUpdateAlertStatus(...a),
    dbDismissAlertsBySource:  (...a: unknown[]) => mockDbDismissAlertsBySource(...a),
    dbListActiveAlerts:       (...a: unknown[]) => mockDbListActiveAlerts(...a),
    dbListRecentlyDismissed:  (...a: unknown[]) => mockDbListRecentlyDismissed(...a),
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
        id: "prod-1",
        name: "Test Ürün",
        sku: "P-001",
        category: "Vana",
        unit: "adet",
        price: 100,
        currency: "USD",
        on_hand: 5,                   // default: kritik (min=10 ile)
        reserved: 0,
        available_now: 5,
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

function makeDismissed(overrides: Partial<AlertRow> = {}): AlertRow {
    return {
        id: "dis-1",
        type: "stock_critical",
        severity: "critical",
        status: "dismissed",
        title: "test",
        description: "",
        entity_type: "product",
        entity_id: "prod-1",
        source: "system",
        ai_confidence: null,
        ai_reason: null,
        ai_inputs_summary: null,
        ai_model_version: null,
        resolution_reason: null,
        acknowledged_at: null,
        resolved_at: null,
        dismissed_at: new Date().toISOString(),
        dismissed_severity: "critical",
        created_at: "2024-01-01T00:00:00Z",
        ...overrides,
    } as AlertRow;
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateAlert.mockResolvedValue({ id: "new-alert" });
    mockDbBatchResolveAlerts.mockResolvedValue(0);
    mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map());
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbListActiveAlerts.mockResolvedValue([]);
    mockDbListRecentlyDismissed.mockResolvedValue([]);
});

describe("serviceScanStockAlerts — dismiss dedup (Sprint A G8)", () => {
    it("yoksay edilmiş stock_critical aynı severity → yeni alert OLUŞTURULMAZ", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ available_now: 5, min_stock_level: 10 })]);
        mockDbListRecentlyDismissed.mockResolvedValue([
            makeDismissed({ type: "stock_critical", entity_id: "prod-1", severity: "critical", dismissed_severity: "critical" }),
        ]);

        await serviceScanStockAlerts();

        const created = mockDbCreateAlert.mock.calls.find(
            (c) => (c[0] as { type: string }).type === "stock_critical"
        );
        expect(created).toBeUndefined();
    });

    it("yoksay edilmiş stock_risk (warning) → şimdi stock_critical (critical) → BYPASS, oluşturulur", async () => {
        // Önce warning seviyesinde yoksaylanmış; şimdi durum kötüleşti.
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ available_now: 3, min_stock_level: 10 })]);
        mockDbListRecentlyDismissed.mockResolvedValue([
            makeDismissed({ type: "stock_critical", entity_id: "prod-1", severity: "warning", dismissed_severity: "warning" }),
        ]);

        await serviceScanStockAlerts();

        const created = mockDbCreateAlert.mock.calls.find(
            (c) => (c[0] as { type: string; severity: string }).type === "stock_critical"
                && (c[0] as { severity: string }).severity === "critical"
        );
        expect(created).toBeDefined();
    });

    it("yoksay edilmiş stock_critical (critical) → şimdi stock_risk (warning) → blok devam (severity AŞAĞI inmez)", async () => {
        // Daha kötü severity ile yoksaylanmış; yeni öneri daha hafif → blok.
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ available_now: 12, min_stock_level: 10 })]); // warning bölgesi
        mockDbListRecentlyDismissed.mockResolvedValue([
            makeDismissed({ type: "stock_risk", entity_id: "prod-1", severity: "critical", dismissed_severity: "critical" }),
        ]);

        await serviceScanStockAlerts();

        const created = mockDbCreateAlert.mock.calls.find(
            (c) => (c[0] as { type: string }).type === "stock_risk"
        );
        expect(created).toBeUndefined();
    });

    it("yoksay listesi BOŞ → kural devre dışı, normal akış (alert oluşur)", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ available_now: 5, min_stock_level: 10 })]);
        mockDbListRecentlyDismissed.mockResolvedValue([]);

        await serviceScanStockAlerts();

        const created = mockDbCreateAlert.mock.calls.find(
            (c) => (c[0] as { type: string }).type === "stock_critical"
        );
        expect(created).toBeDefined();
    });

    it("farklı entity için yoksay → bu ürün etkilenmez (entity_id eşleşmesi)", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ id: "prod-1", available_now: 5, min_stock_level: 10 })]);
        mockDbListRecentlyDismissed.mockResolvedValue([
            makeDismissed({ type: "stock_critical", entity_id: "prod-OTHER", severity: "critical", dismissed_severity: "critical" }),
        ]);

        await serviceScanStockAlerts();

        const created = mockDbCreateAlert.mock.calls.find(
            (c) => (c[0] as { type: string }).type === "stock_critical"
        );
        expect(created).toBeDefined();
    });

    it("order_shortage 24h içinde dismissed → yeni create blok", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct({ id: "prod-1", available_now: 100 })]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map([["prod-1", 5]]));
        mockDbListRecentlyDismissed.mockResolvedValue([
            makeDismissed({ type: "order_shortage", entity_id: "prod-1", severity: "critical", dismissed_severity: "critical" }),
        ]);

        await serviceScanStockAlerts();

        const created = mockDbCreateAlert.mock.calls.find(
            (c) => (c[0] as { type: string }).type === "order_shortage"
        );
        expect(created).toBeUndefined();
    });

    it("dbListRecentlyDismissed scan'de tam olarak 1 kez ve hoursBack=24 ile çağrılır", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([makeProduct()]);

        await serviceScanStockAlerts();

        expect(mockDbListRecentlyDismissed).toHaveBeenCalledTimes(1);
        expect(mockDbListRecentlyDismissed).toHaveBeenCalledWith(24);
    });
});
