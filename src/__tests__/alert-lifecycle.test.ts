/**
 * Regression tests for alert lifecycle semantics.
 *
 * Domain contract (domain-rules.md §12):
 *   - acknowledged = active (user has seen it, condition still live)
 *   - Dedupe (activeSet) must block new alerts when acknowledged exists
 *   - Auto-resolve (dbBatchResolveAlerts) must close acknowledged alerts too
 *   - AI dismiss (dbDismissAlertsBySource) must clear acknowledged AI alerts too
 *
 * Lifecycle transitions:
 *   open         → acknowledged | resolved | dismissed
 *   acknowledged → resolved | dismissed
 *   resolved     → (terminal)
 *   dismissed    → (terminal)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockDbListAllActiveProducts = vi.fn();
const mockDbListProducts = vi.fn();
const mockDbGetOpenShortagesByProduct = vi.fn();
const mockDbGetQuotedQuantities = vi.fn();
const mockDbListOrders = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts:     (...args: unknown[]) => mockDbListAllActiveProducts(...args),
    dbListProducts:              (...args: unknown[]) => mockDbListProducts(...args),
    dbGetOpenShortagesByProduct: () => mockDbGetOpenShortagesByProduct(),
    dbGetQuotedQuantities:       (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders: (...args: unknown[]) => mockDbListOrders(...args),
}));

const mockDbCreateAlert            = vi.fn();
const mockDbListAlerts             = vi.fn();
const mockDbGetAlertById           = vi.fn();
const mockDbUpdateAlertStatus      = vi.fn();
const mockDbDismissAlertsBySource  = vi.fn();
const mockDbListActiveAlerts       = vi.fn();
const mockDbBatchResolveAlerts     = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:             (...args: unknown[]) => mockDbListAlerts(...args),
    dbGetAlertById:           (...args: unknown[]) => mockDbGetAlertById(...args),
    dbCreateAlert:            (...args: unknown[]) => mockDbCreateAlert(...args),
    dbUpdateAlertStatus:      (...args: unknown[]) => mockDbUpdateAlertStatus(...args),
    dbDismissAlertsBySource:  (...args: unknown[]) => mockDbDismissAlertsBySource(...args),
    dbListActiveAlerts:       (...args: unknown[]) => mockDbListActiveAlerts(...args),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts:     (...args: unknown[]) => mockDbBatchResolveAlerts(...args),
}));

const mockIsAIAvailable        = vi.fn();
const mockAiGenerateOpsSummary = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable:        () => mockIsAIAvailable(),
    aiGenerateOpsSummary: (...args: unknown[]) => mockAiGenerateOpsSummary(...args),
}));

import {
    serviceScanStockAlerts,
    serviceUpdateAlertStatus,
    serviceGenerateAiAlerts,
    serviceListAlerts,
    serviceGetAlert,
} from "@/lib/services/alert-service";
import type { ProductWithStock } from "@/lib/database.types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const PRODUCT_CRITICAL: ProductWithStock = {
    id: "prod-crit",
    name: "Kritik Ürün",
    sku: "CRIT-001",
    category: "Vana",
    unit: "adet",
    price: 100,
    currency: "USD",
    on_hand: 5,
    reserved: 0,
    available_now: 5,
    min_stock_level: 10,   // available(5) <= min(10) → critical
    is_active: true,
    product_type: "manufactured",
    warehouse: null, reorder_qty: null, preferred_vendor: null,
    daily_usage: null, lead_time_days: null, product_family: null,
    sub_category: null, sector_compatibility: null, cost_price: null,
    weight_kg: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
};

const PRODUCT_HEALTHY: ProductWithStock = {
    id: "prod-ok",
    name: "Sağlıklı Ürün",
    sku: "OK-001",
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
    weight_kg: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateAlert.mockResolvedValue({ id: "new-alert" });
    mockDbBatchResolveAlerts.mockResolvedValue(0);
    mockDbListActiveAlerts.mockResolvedValue([]);
    mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map());
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
});

// ── Block 1: Dedupe — acknowledged alert engel oluşturur ──────────────────────

describe("Dedupe — acknowledged alert yeni alert yaratımını engeller", () => {
    it("acknowledged stock_critical var → activeSet'te bulunur → yeni alert açılmaz", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([PRODUCT_CRITICAL]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "stock_critical", entity_id: "prod-crit", status: "acknowledged" },
        ]);

        await serviceScanStockAlerts();

        const criticalCreates = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "stock_critical"
        );
        expect(criticalCreates).toHaveLength(0);
    });

    it("acknowledged stock_risk var → dedupe engel, warning alert açılmaz", async () => {
        const warningProduct: ProductWithStock = {
            ...PRODUCT_HEALTHY,
            id: "prod-warn",
            on_hand: 13,
            reserved: 0,
            available_now: 13,
            min_stock_level: 10, // available(13) ≤ ceil(10*1.5)=15 → warning
        };
        mockDbListAllActiveProducts.mockResolvedValue([warningProduct]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "stock_risk", entity_id: "prod-warn", status: "acknowledged" },
        ]);

        await serviceScanStockAlerts();

        const warningCreates = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "stock_risk"
        );
        expect(warningCreates).toHaveLength(0);
    });

    it("acknowledged order_shortage var → dedupe engel, shortage alert açılmaz", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([PRODUCT_CRITICAL]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map([["prod-crit", 5]]));
        // Both critical and shortage already active (acknowledged)
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "stock_critical", entity_id: "prod-crit", status: "acknowledged" },
            { type: "order_shortage", entity_id: "prod-crit", status: "acknowledged" },
        ]);

        await serviceScanStockAlerts();

        const shortageCreates = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_shortage"
        );
        expect(shortageCreates).toHaveLength(0);
    });
});

// ── Block 2: Auto-resolve — acknowledged alert koşul düzelince kapanır ────────

describe("Auto-resolve — koşul düzelince acknowledged alert kapanır", () => {
    it("stok iyileşince batch resolve stock_critical içerir", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([PRODUCT_HEALTHY]);
        mockDbBatchResolveAlerts.mockResolvedValue(1);

        await serviceScanStockAlerts();

        const entries = mockDbBatchResolveAlerts.mock.calls[0][0];
        const critEntries = entries.filter((e: { type: string }) => e.type === "stock_critical");
        expect(critEntries).toHaveLength(1);
        expect(critEntries[0].entityId).toBe(PRODUCT_HEALTHY.id);
    });

    it("stok iyileşince result.resolved batch resolve dönüş değerini yansıtır", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([PRODUCT_HEALTHY]);
        mockDbBatchResolveAlerts.mockResolvedValue(3);

        const result = await serviceScanStockAlerts();
        expect(result.resolved).toBe(3);
    });

    it("shortage çözülünce batch resolve order_shortage içerir (acknowledged dahil)", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([PRODUCT_HEALTHY]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map()); // no open shortages
        mockDbBatchResolveAlerts.mockResolvedValue(1);

        await serviceScanStockAlerts();

        const entries = mockDbBatchResolveAlerts.mock.calls[0][0];
        const shortageEntries = entries.filter((e: { type: string }) => e.type === "order_shortage");
        expect(shortageEntries).toHaveLength(1);
        expect(shortageEntries[0].reason).toBe("shortage_resolved");
    });
});

// ── Block 3: AI dismiss — acknowledged AI alerts temizlenir ───────────────────

describe("AI dismiss — AI regenerasyon acknowledged alert'leri de temizler", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
        mockDbListAllActiveProducts.mockResolvedValue([]);
        mockDbListProducts.mockResolvedValue([]);
        mockDbListOrders.mockResolvedValue([]);
        mockDbListAlerts.mockResolvedValue([]);
        mockDbDismissAlertsBySource.mockResolvedValue(3); // 2 open + 1 acknowledged dismissed
        mockAiGenerateOpsSummary.mockResolvedValue({
            summary: "Özet",
            insights: [],
            anomalies: [],
            confidence: 0.9,
        });
    });

    it("AI alert üretiminde dbDismissAlertsBySource 'ai' kaynağı için çağrılır", async () => {
        await serviceGenerateAiAlerts();
        expect(mockDbDismissAlertsBySource).toHaveBeenCalledWith("ai");
    });

    it("dbDismissAlertsBySource dönüş değeri (acknowledged dahil) result.dismissed'e yansır", async () => {
        mockDbDismissAlertsBySource.mockResolvedValue(3);
        const result = await serviceGenerateAiAlerts();
        expect(result.dismissed).toBe(3);
    });
});

// ── Block 4: Lifecycle transitions — geçiş matrisi ───────────────────────────

describe("Lifecycle transitions — ALERT_TRANSITIONS matrisi", () => {
    function makeAlert(status: string) {
        return { id: "a1", status, type: "stock_critical", severity: "critical" };
    }

    it("open → acknowledged geçerli", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("open"));
        mockDbUpdateAlertStatus.mockResolvedValue({ id: "a1", status: "acknowledged" });

        const result = await serviceUpdateAlertStatus("a1", "acknowledged");
        expect(result.success).toBe(true);
    });

    it("open → resolved geçerli", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("open"));
        mockDbUpdateAlertStatus.mockResolvedValue({ id: "a1", status: "resolved" });

        const result = await serviceUpdateAlertStatus("a1", "resolved");
        expect(result.success).toBe(true);
    });

    it("open → dismissed geçerli", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("open"));
        mockDbUpdateAlertStatus.mockResolvedValue({ id: "a1", status: "dismissed" });

        const result = await serviceUpdateAlertStatus("a1", "dismissed");
        expect(result.success).toBe(true);
    });

    it("acknowledged → resolved geçerli", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("acknowledged"));
        mockDbUpdateAlertStatus.mockResolvedValue({ id: "a1", status: "resolved" });

        const result = await serviceUpdateAlertStatus("a1", "resolved");
        expect(result.success).toBe(true);
    });

    it("acknowledged → dismissed geçerli", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("acknowledged"));
        mockDbUpdateAlertStatus.mockResolvedValue({ id: "a1", status: "dismissed" });

        const result = await serviceUpdateAlertStatus("a1", "dismissed");
        expect(result.success).toBe(true);
    });

    it("acknowledged → open GEÇERSİZ (geri alınamaz)", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("acknowledged"));

        const result = await serviceUpdateAlertStatus("a1", "open" as never);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });

    it("resolved → acknowledged GEÇERSİZ (terminal)", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("resolved"));

        const result = await serviceUpdateAlertStatus("a1", "acknowledged");
        expect(result.success).toBe(false);
    });

    it("resolved → open GEÇERSİZ (terminal)", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("resolved"));

        const result = await serviceUpdateAlertStatus("a1", "open" as never);
        expect(result.success).toBe(false);
    });

    it("dismissed → resolved GEÇERSİZ (terminal)", async () => {
        mockDbGetAlertById.mockResolvedValue(makeAlert("dismissed"));

        const result = await serviceUpdateAlertStatus("a1", "resolved");
        expect(result.success).toBe(false);
    });

    it("alert bulunamıyorsa error döner", async () => {
        mockDbGetAlertById.mockResolvedValue(null);

        const result = await serviceUpdateAlertStatus("nonexistent", "resolved");
        expect(result.success).toBe(false);
        expect(result.error).toContain("bulunamadı");
    });
});

// ── Block 5: UI lifecycle contract ───────────────────────────────────────────

describe("Lifecycle contract — acknowledged aktif sayılır", () => {
    it("acknowledged alert open gibi davranır: escalate sırasında warning resolve edilir", async () => {
        mockDbListAllActiveProducts.mockResolvedValue([PRODUCT_CRITICAL]);
        mockDbListActiveAlerts.mockResolvedValue([]);
        mockDbBatchResolveAlerts.mockResolvedValue(1);

        await serviceScanStockAlerts();

        // Escalation: batch resolve should include stock_risk → escalated_to_critical
        const entries = mockDbBatchResolveAlerts.mock.calls[0][0];
        const escalateCalls = entries.filter(
            (e: { type: string; reason: string }) => e.type === "stock_risk" && e.reason === "escalated_to_critical"
        );
        expect(escalateCalls).toHaveLength(1);
        expect(escalateCalls[0].entityId).toBe(PRODUCT_CRITICAL.id);
    });
});

// ── CRUD passthroughs ─────────────────────────────────────────────────────────

describe("serviceListAlerts — passthrough to dbListAlerts", () => {
    it("çağrıldığında dbListAlerts sonucunu döner", async () => {
        const fakeAlert = { id: "a1", type: "stock_critical", status: "open" };
        mockDbListAlerts.mockResolvedValue([fakeAlert]);

        const result = await serviceListAlerts({ status: "open" });

        expect(mockDbListAlerts).toHaveBeenCalledWith({ status: "open" });
        expect(result).toEqual([fakeAlert]);
    });
});

describe("serviceGetAlert — passthrough to dbGetAlertById", () => {
    it("id ile çağrıldığında dbGetAlertById sonucunu döner", async () => {
        const fakeAlert = { id: "a1", type: "stock_risk", status: "acknowledged" };
        mockDbGetAlertById.mockResolvedValue(fakeAlert);

        const result = await serviceGetAlert("a1");

        expect(mockDbGetAlertById).toHaveBeenCalledWith("a1");
        expect(result).toEqual(fakeAlert);
    });
});
