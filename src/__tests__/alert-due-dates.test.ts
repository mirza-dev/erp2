import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AlertRow, AlertType } from "@/lib/database.types";

const mockIn = vi.fn();
const mockSelect = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

import { enrichAlertsWithDueMeta } from "@/lib/services/alert-due-dates";

function alert(type: AlertType, over: Partial<AlertRow> = {}): AlertRow {
    return {
        id: `al-${type}`,
        type,
        severity: "warning",
        title: type,
        description: "",
        entity_type: "product",
        entity_id: null,
        status: "open",
        acknowledged_at: null,
        resolved_at: null,
        dismissed_at: null,
        dismissed_severity: null,
        resolution_reason: null,
        ai_confidence: null,
        ai_reason: null,
        ai_model_version: null,
        ai_inputs_summary: null,
        created_at: "2026-06-07T10:00:00.000Z",
        source: "system",
        ...over,
    } as AlertRow;
}

beforeEach(() => {
    mockIn.mockReset().mockResolvedValue({ data: [], error: null });
    mockSelect.mockReset().mockReturnValue({ in: mockIn });
    mockFrom.mockReset().mockReturnValue({ select: mockSelect });
});

describe("enrichAlertsWithDueMeta", () => {
    it("overdue_shipment → planned_shipment_date + order_code", async () => {
        mockIn.mockResolvedValue({
            data: [{ id: "o1", order_number: "SIP-2026-1198", planned_shipment_date: "2026-06-04", quote_valid_until: null }],
            error: null,
        });
        const out = await enrichAlertsWithDueMeta([
            alert("overdue_shipment", { entity_type: "sales_order", entity_id: "o1" }),
        ]);
        expect(out[0].due_date).toBe("2026-06-04");
        expect(out[0].due_label).toBe("Planlanan Sevk");
        expect(out[0].order_code).toBe("SIP-2026-1198");
    });

    it("quote_expired → quote_valid_until + order_code", async () => {
        mockIn.mockResolvedValue({
            data: [{ id: "q1", order_number: "TKL-2026-1245", planned_shipment_date: null, quote_valid_until: "2026-06-03" }],
            error: null,
        });
        const out = await enrichAlertsWithDueMeta([
            alert("quote_expired", { entity_type: "sales_order", entity_id: "q1" }),
        ]);
        expect(out[0].due_date).toBe("2026-06-03");
        expect(out[0].due_label).toBe("Teklif Geçerlilik");
        expect(out[0].order_code).toBe("TKL-2026-1245");
    });

    it("order_deadline (product) → order join YOK, due null (client türetir)", async () => {
        const out = await enrichAlertsWithDueMeta([
            alert("order_deadline", { entity_id: "p1" }),
        ]);
        expect(out[0].due_date).toBeNull();
        expect(out[0].order_code).toBeNull();
        expect(mockFrom).not.toHaveBeenCalled(); // order id toplanmaz
    });

    it("stock_critical / sync_issue → hedef yok", async () => {
        const out = await enrichAlertsWithDueMeta([
            alert("stock_critical", { entity_id: "p1" }),
            alert("sync_issue", { entity_type: "parasut", entity_id: "parasut-auth" }),
        ]);
        expect(out.every((a) => a.due_date === null && a.due_label === null && a.order_code === null)).toBe(true);
    });

    it("order entity'leri TEK batch sorguda toplar", async () => {
        mockIn.mockResolvedValue({ data: [], error: null });
        await enrichAlertsWithDueMeta([
            alert("overdue_shipment", { entity_type: "sales_order", entity_id: "o1" }),
            alert("quote_expired", { entity_type: "sales_order", entity_id: "o2" }),
            alert("stock_risk", { entity_id: "p1" }),
        ]);
        expect(mockFrom).toHaveBeenCalledTimes(1);
        expect(mockFrom).toHaveBeenCalledWith("sales_orders");
        expect(mockIn).toHaveBeenCalledWith("id", ["o1", "o2"]);
    });

    it("order bulunamazsa defansif null (drop yok)", async () => {
        mockIn.mockResolvedValue({ data: [], error: null }); // eşleşen order yok
        const out = await enrichAlertsWithDueMeta([
            alert("overdue_shipment", { entity_type: "sales_order", entity_id: "missing" }),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].due_date).toBeNull();
    });

    it("sales_orders hatası non-fatal (alertler yine döner)", async () => {
        mockIn.mockResolvedValue({ data: null, error: { message: "db fail" } });
        const out = await enrichAlertsWithDueMeta([
            alert("overdue_shipment", { entity_type: "sales_order", entity_id: "o1" }),
        ]);
        expect(out).toHaveLength(1);
        expect(out[0].due_date).toBeNull();
    });
});
