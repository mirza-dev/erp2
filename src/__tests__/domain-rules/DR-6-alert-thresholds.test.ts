/**
 * DR-6 — Alert Threshold ve Eskalasyon
 * domain-rules.md §6.1: available_now <= min_stock_level → stock_critical
 * domain-rules.md §6.2: available_now <= ceil(min * 1.5) (ve > min) → stock_risk (warning)
 * domain-rules.md §12: Alert lifecycle: open → acknowledged → resolved/dismissed
 *
 * Eskalasyon kuralı: warning açıkken stok kritik seviyeye düşerse
 *   → eski warning resolve edilir, yeni critical oluşturulur.
 *
 * Dedup kuralı: aynı ürün için aynı tipte aktif alert varsa yeni oluşturulmaz.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────

const mockDbListAllActiveProducts    = vi.fn();
const mockDbGetOpenShortagesByProduct = vi.fn();
const mockDbListActiveAlerts         = vi.fn();
const mockDbGetQuotedQuantities      = vi.fn();
const mockDbCreateAlert              = vi.fn();
const mockDbBatchResolveAlerts       = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts:      (...args: unknown[]) => mockDbListAllActiveProducts(...args),
    dbGetOpenShortagesByProduct:  (...args: unknown[]) => mockDbGetOpenShortagesByProduct(...args),
    dbGetQuotedQuantities:        (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
    dbListProducts:               vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:              vi.fn().mockResolvedValue([]),
    dbGetAlertById:            vi.fn(),
    dbCreateAlert:             (...args: unknown[]) => mockDbCreateAlert(...args),
    dbUpdateAlertStatus:       vi.fn(),
    dbDismissAlertsBySource:   vi.fn(),
    dbListActiveAlerts:        (...args: unknown[]) => mockDbListActiveAlerts(...args),
    dbBatchResolveAlerts:      (...args: unknown[]) => mockDbBatchResolveAlerts(...args),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders:           vi.fn().mockResolvedValue([]),
    dbListOverdueShipments: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable:        vi.fn().mockReturnValue(false),
    aiGenerateOpsSummary: vi.fn(),
}));

// stock-utils: computeOrderDeadline → null (deadline alertlarını devre dışı bırak)
vi.mock("@/lib/stock-utils", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/stock-utils")>();
    return {
        ...actual,
        computeOrderDeadline: vi.fn().mockReturnValue({ stockoutDate: null, orderDeadline: null }),
    };
});

import { serviceScanStockAlerts } from "@/lib/services/alert-service";

// ── Yardımcı: ürün fixture oluştur ───────────────────────────

function makeProduct(overrides: {
    id?: string;
    name?: string;
    available_now: number;
    min_stock_level: number;
    daily_usage?: number | null;
    lead_time_days?: number | null;
}) {
    return {
        id: overrides.id ?? "prod-1",
        name: overrides.name ?? "Test Ürün",
        available_now: overrides.available_now,
        min_stock_level: overrides.min_stock_level,
        daily_usage: overrides.daily_usage ?? null,
        lead_time_days: overrides.lead_time_days ?? null,
        unit: "adet",
    };
}

beforeEach(() => {
    mockDbListAllActiveProducts.mockReset();
    mockDbGetOpenShortagesByProduct.mockReset();
    mockDbListActiveAlerts.mockReset();
    mockDbGetQuotedQuantities.mockReset();
    mockDbCreateAlert.mockReset();
    mockDbBatchResolveAlerts.mockReset();

    // Varsayılan: boş shortages + boş quotes + boş active alerts
    mockDbGetOpenShortagesByProduct.mockResolvedValue(new Map());
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbListActiveAlerts.mockResolvedValue([]);
    mockDbBatchResolveAlerts.mockResolvedValue(0);
    mockDbCreateAlert.mockResolvedValue({ id: "alert-new" });
});

// ── Tests ─────────────────────────────────────────────────────

describe("DR-6.1: Kritik eşik — available_now <= min_stock_level", () => {
    it("available_now === min_stock_level → stock_critical alert oluşturulur (sınır dahil)", async () => {
        const product = makeProduct({ available_now: 20, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        const result = await serviceScanStockAlerts();

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stock_critical", entity_id: "prod-1" })
        );
        expect(result.created).toBeGreaterThanOrEqual(1);
    });

    it("available_now < min_stock_level → stock_critical alert oluşturulur", async () => {
        const product = makeProduct({ available_now: 5, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        await serviceScanStockAlerts();

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stock_critical" })
        );
    });

    it("available_now = min_stock_level + 1 → stock_critical oluşturulmaz", async () => {
        const product = makeProduct({ available_now: 21, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        await serviceScanStockAlerts();

        const criticalCalls = mockDbCreateAlert.mock.calls.filter(
            ([arg]) => arg.type === "stock_critical"
        );
        expect(criticalCalls).toHaveLength(0);
    });
});

describe("DR-6.2: Uyarı eşiği — min_stock < available_now <= ceil(min * 1.5)", () => {
    it("available_now = ceil(min * 1.5) → stock_risk (warning) alert oluşturulur", async () => {
        // min=20, ceil(20*1.5)=30 → available=30 warning seviyesinde
        const product = makeProduct({ available_now: 30, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        await serviceScanStockAlerts();

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stock_risk", entity_id: "prod-1" })
        );
    });

    it("available_now = ceil(min * 1.5) + 1 → ne critical ne warning oluşturulmaz (sağlıklı stok)", async () => {
        // min=20, ceil(20*1.5)=30 → available=31 sağlıklı
        const product = makeProduct({ available_now: 31, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        await serviceScanStockAlerts();

        const stockAlertCalls = mockDbCreateAlert.mock.calls.filter(
            ([arg]) => arg.type === "stock_critical" || arg.type === "stock_risk"
        );
        expect(stockAlertCalls).toHaveLength(0);
    });
});

describe("DR-6 Eskalasyon: warning açıkken kritik seviyeye düşerse", () => {
    it("warning aktif + stok critical seviyeye düşer → warning resolve edilir, critical oluşturulur", async () => {
        // Mevcut aktif alert: stock_risk (warning) bu ürün için
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "stock_risk", entity_id: "prod-1", severity: "warning" },
        ]);
        // Stok kritik seviyeye düştü
        const product = makeProduct({ available_now: 10, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        await serviceScanStockAlerts();

        // dbBatchResolveAlerts içinde stock_risk resolve edilmiş olmalı
        const resolveCall = mockDbBatchResolveAlerts.mock.calls[0]?.[0] as Array<{type: string; entityId: string; reason: string}>;
        const warningResolved = resolveCall?.some(
            (e) => e.type === "stock_risk" && e.entityId === "prod-1" && e.reason === "escalated_to_critical"
        );
        expect(warningResolved).toBe(true);

        // Yeni critical alert oluşturulmuş olmalı
        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "stock_critical", entity_id: "prod-1" })
        );
    });
});

describe("DR-6 Dedup: aynı tipte aktif alert varsa yeni oluşturulmaz", () => {
    it("stock_critical zaten açık → yeni critical oluşturulmaz (idempotent)", async () => {
        // Mevcut aktif alert: stock_critical bu ürün için
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "stock_critical", entity_id: "prod-1", severity: "critical" },
        ]);
        const product = makeProduct({ available_now: 5, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        await serviceScanStockAlerts();

        const criticalCalls = mockDbCreateAlert.mock.calls.filter(
            ([arg]) => arg.type === "stock_critical"
        );
        expect(criticalCalls).toHaveLength(0);
    });

    it("stok sağlıklı → mevcut stock alertları resolve edilir", async () => {
        mockDbListActiveAlerts.mockResolvedValue([]);
        const product = makeProduct({ available_now: 100, min_stock_level: 20 });
        mockDbListAllActiveProducts.mockResolvedValue([product]);

        await serviceScanStockAlerts();

        const resolveCall = mockDbBatchResolveAlerts.mock.calls[0]?.[0] as Array<{type: string}>;
        const resolvedCritical = resolveCall?.some((e) => e.type === "stock_critical");
        const resolvedRisk     = resolveCall?.some((e) => e.type === "stock_risk");
        expect(resolvedCritical).toBe(true);
        expect(resolvedRisk).toBe(true);
    });
});
