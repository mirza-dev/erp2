/**
 * serviceCheckOverduePurchaseOrders — po_overdue uyarı taraması.
 *
 * Davranış sözleşmesi:
 *  - expected_date geçmiş açık PO → warning po_overdue alert (entity purchase_order)
 *  - aktif alert'i olan PO için duplicate üretmez
 *  - artık gecikmede olmayan PO'nun alert'i po_no_longer_overdue ile resolve edilir
 *  - /api/alerts/scan route'u stok taramasıyla birlikte non-fatal çağırır
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockDbListOverduePurchaseOrders = vi.fn();
const mockDbListActiveAlerts = vi.fn();
const mockDbCreateAlert = vi.fn();
const mockDbBatchResolveAlerts = vi.fn();

vi.mock("@/lib/supabase/purchase-orders", () => ({
    dbListOverduePurchaseOrders: (...a: unknown[]) => mockDbListOverduePurchaseOrders(...a),
    dbGetIncomingPOQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts: vi.fn(),
    dbGetAlertById: vi.fn(),
    dbCreateAlert: (...a: unknown[]) => mockDbCreateAlert(...a),
    dbUpdateAlertStatus: vi.fn(),
    dbListActiveAlerts: (...a: unknown[]) => mockDbListActiveAlerts(...a),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbBatchResolveAlerts: (...a: unknown[]) => mockDbBatchResolveAlerts(...a),
    dbUpdateActiveAlertContent: vi.fn(),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: vi.fn().mockResolvedValue([]),
    dbGetOpenShortagesByProduct: vi.fn().mockResolvedValue(new Map()),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders: vi.fn().mockResolvedValue([]),
    dbListOverdueShipments: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => false,
    aiGenerateAlertFindings: vi.fn(),
}));

import { serviceCheckOverduePurchaseOrders } from "@/lib/services/alert-service";

function po(over: Record<string, unknown> = {}) {
    return {
        id: "po-1",
        po_number: "PO-2026-0001",
        vendor_id: "v1",
        status: "confirmed",
        order_date: "2026-05-01",
        expected_date: "2026-06-01",
        ...over,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mockDbListOverduePurchaseOrders.mockResolvedValue([]);
    mockDbListActiveAlerts.mockResolvedValue([]);
    mockDbCreateAlert.mockResolvedValue({ id: "alert-1" });
    mockDbBatchResolveAlerts.mockResolvedValue(0);
});

describe("serviceCheckOverduePurchaseOrders", () => {
    it("geciken PO → warning po_overdue alert (entity purchase_order, PO no başlıkta)", async () => {
        mockDbListOverduePurchaseOrders.mockResolvedValue([po()]);

        const result = await serviceCheckOverduePurchaseOrders();

        expect(result.alerted).toBe(1);
        expect(mockDbCreateAlert).toHaveBeenCalledWith(expect.objectContaining({
            type: "po_overdue",
            severity: "warning",
            entity_type: "purchase_order",
            entity_id: "po-1",
            title: expect.stringContaining("PO-2026-0001"),
            description: expect.stringContaining("2026-06-01"),
        }));
    });

    it("aktif po_overdue alert'i olan PO için duplicate üretmez", async () => {
        mockDbListOverduePurchaseOrders.mockResolvedValue([po()]);
        mockDbListActiveAlerts.mockResolvedValue([
            { id: "a1", type: "po_overdue", entity_id: "po-1", status: "open" },
        ]);

        const result = await serviceCheckOverduePurchaseOrders();

        expect(result.alerted).toBe(0);
        expect(mockDbCreateAlert).not.toHaveBeenCalled();
    });

    it("artık gecikmede olmayan PO'nun alert'i po_no_longer_overdue ile resolve edilir", async () => {
        mockDbListOverduePurchaseOrders.mockResolvedValue([]); // gecikme kalmadı
        mockDbListActiveAlerts.mockResolvedValue([
            { id: "a1", type: "po_overdue", entity_id: "po-eski", status: "acknowledged" },
        ]);
        mockDbBatchResolveAlerts.mockResolvedValue(1);

        const result = await serviceCheckOverduePurchaseOrders();

        expect(result.resolved).toBe(1);
        expect(mockDbBatchResolveAlerts).toHaveBeenCalledWith([
            { type: "po_overdue", entityId: "po-eski", reason: "po_no_longer_overdue" },
        ]);
    });

    it("po_overdue dışındaki aktif alert'lere dokunmaz", async () => {
        mockDbListActiveAlerts.mockResolvedValue([
            { id: "a1", type: "overdue_shipment", entity_id: "o1", status: "open" },
            { id: "a2", type: "stock_critical", entity_id: "p1", status: "open" },
        ]);

        await serviceCheckOverduePurchaseOrders();

        expect(mockDbBatchResolveAlerts).not.toHaveBeenCalled();
    });
});

describe("scan route entegrasyonu (source-lock)", () => {
    const SOURCE = readFileSync(join(process.cwd(), "src/app/api/alerts/scan/route.ts"), "utf8");

    it("scan route PO taramasını stok taramasıyla birlikte çağırır", () => {
        expect(SOURCE).toMatch(/serviceCheckOverduePurchaseOrders/);
    });

    it("PO taraması non-fatal: kendi try/catch'i var (stok sonuçları yine döner)", () => {
        expect(SOURCE).toMatch(/poOverdue = await serviceCheckOverduePurchaseOrders\(\)/);
        expect(SOURCE).toMatch(/catch \(poErr\)/);
    });
});

describe("dbListOverduePurchaseOrders sorgu sözleşmesi (source-lock)", () => {
    const SOURCE = readFileSync(join(process.cwd(), "src/lib/supabase/purchase-orders.ts"), "utf8");

    it("yalnız açık statüler taranır; expected_date null PO'lar dışarıda", () => {
        expect(SOURCE).toMatch(/\.in\("status", \["sent", "confirmed", "partially_received"\]\)/);
        expect(SOURCE).toMatch(/\.not\("expected_date", "is", null\)/);
        expect(SOURCE).toMatch(/\.lt\("expected_date", today\)/);
    });
});
