/**
 * Regression tests for alert lifecycle semantics.
 *
 * Domain contract (domain-rules.md §12):
 *   - acknowledged = active (user has seen it, condition still live)
 *   - Dedupe (dbOpenAlertExists) must block new alerts when acknowledged exists
 *   - Auto-resolve (dbResolveAlertsForEntity) must close acknowledged alerts too
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

const mockDbOpenAlertExists        = vi.fn();
const mockDbCreateAlert            = vi.fn();
const mockDbResolveAlertsForEntity = vi.fn();
const mockDbListAlerts             = vi.fn();
const mockDbGetAlertById           = vi.fn();
const mockDbUpdateAlertStatus      = vi.fn();
const mockDbDismissAlertsBySource  = vi.fn();

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:               (...args: unknown[]) => mockDbListAlerts(...args),
    dbGetAlertById:             (...args: unknown[]) => mockDbGetAlertById(...args),
    dbOpenAlertExists:          (...args: unknown[]) => mockDbOpenAlertExists(...args),
    dbCreateAlert:              (...args: unknown[]) => mockDbCreateAlert(...args),
    dbUpdateAlertStatus:        (...args: unknown[]) => mockDbUpdateAlertStatus(...args),
    dbResolveAlertsForEntity:   (...args: unknown[]) => mockDbResolveAlertsForEntity(...args),
    dbDismissAlertsBySource:    (...args: unknown[]) => mockDbDismissAlertsBySource(...args),
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
    product_type: "finished",
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
    product_type: "finished",
    warehouse: null, reorder_qty: null, preferred_vendor: null,
    daily_usage: null, lead_time_days: null, product_family: null,
    sub_category: null, sector_compatibility: null, cost_price: null,
    weight_kg: null, created_at: "2024-01-01T00:00:00Z", updated_at: "2024-01-01T00:00:00Z",
};

function makeAcknowledgedAlertRow(id = "alert-ack") {
    return {
        id,
        type: "stock_critical",
        severity: "critical",
        status: "acknowledged",
        entity_id: "prod-crit",
        entity_type: "product",
        source: "system",
        created_at: "2024-01-01T00:00:00Z",
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateAlert.mockResolvedValue({ id: "new-alert" });
    mockDbResolveAlertsForEntity.mockResolvedValue(0);
    mockDbOpenAlertExists.mockResolvedValue(false);
    mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map());
});

// ── Block 1: Dedupe — acknowledged alert engel oluşturur ──────────────────────

describe("Dedupe — acknowledged alert yeni alert yaratımını engeller", () => {
    it("acknowledged stock_critical var → dbOpenAlertExists true döner → yeni alert açılmaz", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_CRITICAL]);
        // dbOpenAlertExists simulates acknowledged alert present → returns true
        mockDbOpenAlertExists.mockResolvedValue(true);

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
        mockDbListProducts.mockResolvedValue([warningProduct]);
        mockDbOpenAlertExists.mockResolvedValue(true); // acknowledged exists

        await serviceScanStockAlerts();

        const warningCreates = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "stock_risk"
        );
        expect(warningCreates).toHaveLength(0);
    });

    it("acknowledged order_shortage var → dedupe engel, shortage alert açılmaz", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_CRITICAL]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map([["prod-crit", 5]]));
        // Acknowledged exists for both stock_critical and order_shortage
        mockDbOpenAlertExists.mockResolvedValue(true);

        await serviceScanStockAlerts();

        const shortageCreates = mockDbCreateAlert.mock.calls.filter(
            ([input]) => input.type === "order_shortage"
        );
        expect(shortageCreates).toHaveLength(0);
    });
});

// ── Block 2: Auto-resolve — acknowledged alert koşul düzelince kapanır ────────

describe("Auto-resolve — koşul düzelince acknowledged alert kapanır", () => {
    it("stok iyileşince dbResolveAlertsForEntity stock_critical için çağrılır", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_HEALTHY]);
        mockDbResolveAlertsForEntity.mockResolvedValue(1); // simulates acknowledged resolved

        await serviceScanStockAlerts();

        const critCalls = mockDbResolveAlertsForEntity.mock.calls.filter(
            ([type]) => type === "stock_critical"
        );
        expect(critCalls).toHaveLength(1);
        expect(critCalls[0][1]).toBe(PRODUCT_HEALTHY.id);
    });

    it("stok iyileşince result.resolved acknowledged count'u yansıtır", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_HEALTHY]);
        mockDbResolveAlertsForEntity.mockResolvedValue(1); // acknowledged alert resolved

        const result = await serviceScanStockAlerts();
        // stock_critical resolve + stock_risk resolve + order_shortage resolve = 3 calls, each returns 1
        // (resolve is called for all three types when stock is healthy)
        expect(result.resolved).toBeGreaterThanOrEqual(1);
    });

    it("shortage çözülünce dbResolveAlertsForEntity order_shortage için çağrılır (acknowledged dahil)", async () => {
        mockDbListProducts.mockResolvedValue([PRODUCT_HEALTHY]);
        mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map()); // no open shortages
        mockDbResolveAlertsForEntity.mockResolvedValue(1);

        await serviceScanStockAlerts();

        const shortageCalls = mockDbResolveAlertsForEntity.mock.calls.filter(
            ([type]) => type === "order_shortage"
        );
        expect(shortageCalls).toHaveLength(1);
        expect(shortageCalls[0][2]).toBe("shortage_resolved");
    });
});

// ── Block 3: AI dismiss — acknowledged AI alerts temizlenir ───────────────────

describe("AI dismiss — AI regenerasyon acknowledged alert'leri de temizler", () => {
    beforeEach(() => {
        mockIsAIAvailable.mockReturnValue(true);
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
        // When escalating to critical, stock_risk (warning) resolve is called
        // This should close acknowledged warnings too
        mockDbListProducts.mockResolvedValue([PRODUCT_CRITICAL]);
        mockDbOpenAlertExists.mockResolvedValue(false);
        mockDbResolveAlertsForEntity.mockResolvedValue(1); // resolves acknowledged warning

        await serviceScanStockAlerts();

        // Escalation: resolve stock_risk before creating stock_critical
        const escalateCalls = mockDbResolveAlertsForEntity.mock.calls.filter(
            ([type, , reason]) => type === "stock_risk" && reason === "escalated_to_critical"
        );
        expect(escalateCalls).toHaveLength(1);
        expect(escalateCalls[0][1]).toBe(PRODUCT_CRITICAL.id);
    });
});
