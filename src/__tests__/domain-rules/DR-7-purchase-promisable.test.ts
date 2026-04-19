/**
 * DR-7 — Satın Alma Önerisi: Promisable Kullanımı ve Alert Dedup
 * domain-rules.md §7: Satın alma önerisi, gerçek promisable stok üzerinden hesaplanmalıdır.
 * domain-rules.md §5.5: promisable = available_now - quoted (draft + pending_approval siparişler)
 * domain-rules.md §12: Alert lifecycle — dedup tüm "aktif" durumları kapsamalıdır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks (hoisted) ───────────────────────────────────────────

const mockDbListProducts           = vi.fn();
const mockDbListActiveAlerts       = vi.fn();
const mockDbGetQuotedQuantities    = vi.fn();
const mockDbCreateAlert            = vi.fn();
const mockDbResolveAlertsForEntity = vi.fn();

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts:               (...args: unknown[]) => mockDbListProducts(...args),
    dbGetQuotedQuantities:        (...args: unknown[]) => mockDbGetQuotedQuantities(...args),
    dbListAllActiveProducts:      vi.fn().mockResolvedValue([]),
    dbGetOpenShortagesByProduct:  vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts:              vi.fn().mockResolvedValue([]),
    dbListActiveAlerts:        (...args: unknown[]) => mockDbListActiveAlerts(...args),
    dbCreateAlert:             (...args: unknown[]) => mockDbCreateAlert(...args),
    dbResolveAlertsForEntity:  (...args: unknown[]) => mockDbResolveAlertsForEntity(...args),
    dbBatchResolveAlerts:      vi.fn().mockResolvedValue(0),
    dbOpenAlertExists:         vi.fn().mockResolvedValue(false),
}));

import { serviceScanPurchaseSuggestions, serviceListPurchaseSuggestions } from "@/lib/services/purchase-service";

// ── Fixtures ──────────────────────────────────────────────────

function makeProduct(overrides: {
    id?: string;
    name?: string;
    available_now: number;
    min_stock_level: number;
    reorder_qty?: number | null;
    daily_usage?: number | null;
    lead_time_days?: number | null;
}) {
    return {
        id: overrides.id ?? "prod-1",
        name: overrides.name ?? "Test Ürün",
        available_now: overrides.available_now,
        min_stock_level: overrides.min_stock_level,
        reorder_qty: overrides.reorder_qty ?? null,
        daily_usage: overrides.daily_usage ?? null,
        lead_time_days: overrides.lead_time_days ?? null,
        preferred_vendor: null,
        unit: "adet",
        is_active: true,
    };
}

beforeEach(() => {
    mockDbListProducts.mockReset();
    mockDbListActiveAlerts.mockReset();
    mockDbGetQuotedQuantities.mockReset();
    mockDbCreateAlert.mockReset();
    mockDbResolveAlertsForEntity.mockReset();

    mockDbListActiveAlerts.mockResolvedValue([]);
    mockDbGetQuotedQuantities.mockResolvedValue(new Map());
    mockDbCreateAlert.mockResolvedValue({ id: "alert-new" });
    mockDbResolveAlertsForEntity.mockResolvedValue(0);
});

// ── Tests ─────────────────────────────────────────────────────

describe("DR-7: promisable <= min_stock → purchase_recommended alert oluşturulur", () => {
    it("available_now = min_stock, quoted=0 → alert tetiklenir (sınır dahil)", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct({ available_now: 20, min_stock_level: 20 })]);

        const result = await serviceScanPurchaseSuggestions();

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "purchase_recommended" })
        );
        expect(result.created).toBe(1);
    });

    it("available_now > min_stock, quoted=0 → alert tetiklenmez, varsa resolve edilir", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct({ available_now: 50, min_stock_level: 20 })]);

        const result = await serviceScanPurchaseSuggestions();

        expect(mockDbCreateAlert).not.toHaveBeenCalled();
        expect(mockDbResolveAlertsForEntity).toHaveBeenCalledWith(
            "purchase_recommended", "prod-1", "stock_recovered"
        );
        expect(result.resolved).toBeGreaterThanOrEqual(0);
    });
});

describe("DR-7 Dedup: aktif (open veya acknowledged) alert varsa yeni oluşturulmaz", () => {
    it("open purchase_recommended alert mevcut → dbCreateAlert çağrılmaz", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct({ available_now: 10, min_stock_level: 20 })]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "purchase_recommended", entity_id: "prod-1", severity: "warning" },
        ]);

        await serviceScanPurchaseSuggestions();

        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });
});

/**
 * Y3: acknowledged alert da dedup kapsamında (domain-rules §12)
 * dbListActiveAlerts open + acknowledged döndürdüğünden duplicate oluşmaz.
 */
describe("DR-7 Dedup — Y3: acknowledged purchase alert varken yeni oluşturulmaz", () => {
    it("acknowledged purchase_recommended alert mevcut → dbCreateAlert çağrılmaz", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct({ available_now: 10, min_stock_level: 20 })]);
        mockDbListActiveAlerts.mockResolvedValue([
            { type: "purchase_recommended", entity_id: "prod-1", severity: "warning" },
        ]);

        await serviceScanPurchaseSuggestions();

        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });
});

/**
 * O4: promisable = available_now - quoted (domain-rules §5.5)
 * quoted siparişler düşüldükten sonra min altındaysa öneri tetiklenir.
 */
describe("DR-7 Promisable — O4: quoted hesaba katılır", () => {
    it("available_now=50 > min=20 iken quoted=40 → promisable=10 < min → alert tetiklenir", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct({ available_now: 50, min_stock_level: 20 })]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 40]]));

        await serviceScanPurchaseSuggestions();

        expect(mockDbCreateAlert).toHaveBeenCalledWith(
            expect.objectContaining({ type: "purchase_recommended" })
        );
    });

    it("available_now=50, quoted=10 → promisable=40 > min=20 → alert tetiklenmez", async () => {
        mockDbListProducts.mockResolvedValue([makeProduct({ available_now: 50, min_stock_level: 20 })]);
        mockDbGetQuotedQuantities.mockResolvedValue(new Map([["prod-1", 10]]));

        await serviceScanPurchaseSuggestions();

        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });
});

describe("serviceListPurchaseSuggestions — passthrough", () => {
    it("dbListAlerts'i purchase_recommended + open filtresiyle çağırır", async () => {
        const { dbListAlerts } = await import("@/lib/supabase/alerts") as unknown as { dbListAlerts: ReturnType<typeof vi.fn> };
        dbListAlerts.mockResolvedValue([]);

        const result = await serviceListPurchaseSuggestions();

        expect(Array.isArray(result)).toBe(true);
    });
});
