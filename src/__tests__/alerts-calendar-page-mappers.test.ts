import { describe, it, expect } from "vitest";
import { toCalendarAlert, applyClassFilter } from "@/app/dashboard/alerts/page";
import type { AlertWithDueMeta } from "@/lib/services/alert-due-dates";
import type { Product } from "@/lib/mock-data";
import type { CalendarAlert } from "@/lib/alert-calendar";

function product(over: Partial<Product> = {}): Product {
    return {
        id: "p1", name: "Vana DN50", sku: "KV-3P-DN50", category: "Vana", unit: "adet",
        price: 100, currency: "TRY", on_hand: 10, reserved: 4, available_now: 6,
        quoted: 0, promisable: 6, incoming: 0, forecasted: 6, minStockLevel: 20,
        isActive: true, productType: "commercial", warehouse: "MERKEZ",
        dailyUsage: 2, stockoutDate: null, orderDeadline: null,
        ...over,
    } as Product;
}

function row(over: Partial<AlertWithDueMeta> = {}): AlertWithDueMeta {
    return {
        id: "a1", type: "stock_critical", severity: "critical", title: "Kritik Stok",
        description: "Açıklama", entity_type: "product", entity_id: "p1", status: "open",
        acknowledged_at: null, resolved_at: null, dismissed_at: null, dismissed_severity: null,
        resolution_reason: null, ai_confidence: null, ai_reason: null, ai_model_version: null,
        ai_inputs_summary: null, created_at: "2026-06-07T10:30:00.000Z", source: "system",
        due_date: null, due_label: null, order_code: null,
        ...over,
    } as AlertWithDueMeta;
}

describe("toCalendarAlert", () => {
    it("ürün-entity → product kartı + coverageDays + shortReason/shortImpact", () => {
        const pm = new Map([["p1", product()]]);
        const ca = toCalendarAlert(row(), pm);
        expect(ca.product).not.toBeNull();
        expect(ca.product!.sku).toBe("KV-3P-DN50");
        expect(ca.product!.available).toBe(6);
        expect(ca.product!.coverageDays).toBe(3); // 6 / 2
        expect(ca.reason).toContain("kritik");
        expect(ca.time).toMatch(/^\d{2}:\d{2}$/);
    });

    it("order_deadline due → ürün orderDeadline'dan türetilir", () => {
        const pm = new Map([["p1", product({ orderDeadline: "2026-06-15" })]]);
        const ca = toCalendarAlert(row({ type: "order_deadline" }), pm);
        expect(ca.dueDate).toBe("2026-06-15");
        expect(ca.dueLabel).toBe("Stok Tükenme");
    });

    it("order_deadline orderDeadline yoksa stockoutDate fallback", () => {
        const pm = new Map([["p1", product({ orderDeadline: null, stockoutDate: "2026-06-12" })]]);
        const ca = toCalendarAlert(row({ type: "order_deadline" }), pm);
        expect(ca.dueDate).toBe("2026-06-12");
    });

    it("order-entity → server due_date/due_label/order_code geçer", () => {
        const ca = toCalendarAlert(
            row({ type: "overdue_shipment", entity_type: "sales_order", entity_id: "o1",
                  due_date: "2026-06-04", due_label: "Planlanan Sevk", order_code: "SIP-1198" }),
            new Map(),
        );
        expect(ca.dueDate).toBe("2026-06-04");
        expect(ca.dueLabel).toBe("Planlanan Sevk");
        expect(ca.orderCode).toBe("SIP-1198");
        expect(ca.product).toBeNull();
    });

    it("silinmiş ürün (orphan) → 'Ürün silindi' reason", () => {
        const ca = toCalendarAlert(row({ entity_id: "ghost" }), new Map());
        expect(ca.product).toBeNull();
        expect(ca.reason).toBe("Ürün silindi, uyarı geçersiz");
    });

    it("AI alanları + resolution taşınır", () => {
        const ca = toCalendarAlert(
            row({ source: "ai", type: "purchase_recommended", entity_type: null, entity_id: null,
                  ai_confidence: 0.8, ai_reason: "neden", ai_model_version: "haiku",
                  resolution_reason: "çözüldü", status: "resolved" }),
            new Map(),
        );
        expect(ca.source).toBe("ai");
        expect(ca.aiConfidence).toBe(0.8);
        expect(ca.aiReason).toBe("neden");
        expect(ca.resolution).toBe("çözüldü");
    });
});

describe("applyClassFilter", () => {
    const mk = (type: CalendarAlert["type"]): CalendarAlert =>
        ({ id: type, type } as CalendarAlert);
    const list = [mk("stock_critical"), mk("order_shortage"), mk("sync_issue"), mk("purchase_recommended")];

    it("all → hepsi", () => {
        expect(applyClassFilter(list, "all")).toHaveLength(4);
    });
    it("stock → yalnız stok tipleri", () => {
        expect(applyClassFilter(list, "stock").map((a) => a.type)).toEqual(["stock_critical"]);
    });
    it("system → sync_issue", () => {
        expect(applyClassFilter(list, "system").map((a) => a.type)).toEqual(["sync_issue"]);
    });
    it("ai → purchase_recommended", () => {
        expect(applyClassFilter(list, "ai").map((a) => a.type)).toEqual(["purchase_recommended"]);
    });
});
