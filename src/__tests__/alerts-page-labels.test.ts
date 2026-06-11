/**
 * Sprint A — ALERT_TYPE_LABEL tüm AlertType değerlerini kapsıyor.
 *
 * Plan kriteri: "ALERT_TYPE_LABEL tüm tipler dolu (table-driven)"
 * alert-labels.ts'in her AlertType için boş olmayan Türkçe etiket sağladığını doğrular.
 */
import { describe, it, expect } from "vitest";
import { ALERT_TYPE_LABEL } from "@/lib/alert-labels";
import type { AlertType } from "@/lib/database.types";

const ALL_ALERT_TYPES: AlertType[] = [
    "stock_critical",
    "stock_risk",
    "order_shortage",
    "purchase_recommended",
    "quote_expired",
    "overdue_shipment",
    "order_deadline",
    "sync_issue",
    "po_overdue",
    "user_note",
];

describe("ALERT_TYPE_LABEL — tüm tipler için Türkçe etiket tanımlı", () => {
    it.each(ALL_ALERT_TYPES)("%s için etiket var ve boş değil", (type) => {
        expect(ALERT_TYPE_LABEL[type]).toBeDefined();
        expect(typeof ALERT_TYPE_LABEL[type]).toBe("string");
        expect(ALERT_TYPE_LABEL[type].length).toBeGreaterThan(0);
    });

    it("toplam etiket sayısı AlertType sayısına eşit", () => {
        const keys = Object.keys(ALERT_TYPE_LABEL) as AlertType[];
        expect(keys).toHaveLength(ALL_ALERT_TYPES.length);
        for (const type of ALL_ALERT_TYPES) {
            expect(keys).toContain(type);
        }
    });
});
