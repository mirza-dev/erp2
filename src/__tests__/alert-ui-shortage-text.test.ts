/**
 * Regression tests for alert UI text helpers — order_shortage semantics.
 *
 * Bug fixed: shortReason / shortImpact / drawer helpers were computing shortage qty
 * as (reserved - available), which is the old buggy formula. The correct source of
 * truth is the alert's description field written by alert-service.ts:
 *   "${shortageQty} ${unit} eksik — onaylı sipariş karşılanamıyor."
 *
 * These tests ensure the UI shows the real shortage_qty, not the wrong math result.
 */

import { describe, it, expect } from "vitest";
import { extractShortageQty, shortReason, shortImpact } from "@/lib/alert-ui-helpers";
import type { AlertRow } from "@/lib/database.types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeAlert(overrides: Partial<AlertRow> = {}): AlertRow {
    return {
        id: "a1",
        type: "stock_critical",
        severity: "critical",
        status: "open",
        title: "Kritik Stok",
        description: null,
        entity_id: "prod-1",
        entity_type: "product",
        source: "system",
        created_at: "2024-01-01T00:00:00Z",
        acknowledged_at: null,
        resolved_at: null,
        dismissed_at: null,
        resolution_reason: null,
        ai_confidence: null,
        ai_reason: null,
        ai_model_version: null,
        ai_inputs_summary: null,
        ...overrides,
    };
}

function makeShortageAlert(shortageQty: number, unit = "adet"): AlertRow {
    return makeAlert({
        type: "order_shortage",
        severity: "critical",
        description: `${shortageQty} ${unit} eksik — onaylı sipariş karşılanamıyor.`,
    });
}

// ── extractShortageQty ─────────────────────────────────────────────────────────

describe("extractShortageQty", () => {
    it("order_shortage alert description'dan qty parse eder", () => {
        const alerts = [makeShortageAlert(20, "adet")];
        expect(extractShortageQty(alerts)).toBe(20);
    });

    it("büyük sayıları doğru parse eder", () => {
        const alerts = [makeShortageAlert(150)];
        expect(extractShortageQty(alerts)).toBe(150);
    });

    it("order_shortage alert yok → null döner", () => {
        const alerts = [makeAlert({ type: "stock_critical" })];
        expect(extractShortageQty(alerts)).toBeNull();
    });

    it("boş liste → null döner", () => {
        expect(extractShortageQty([])).toBeNull();
    });

    it("order_shortage var ama description null → null döner", () => {
        const alerts = [makeAlert({ type: "order_shortage", description: null })];
        expect(extractShortageQty(alerts)).toBeNull();
    });

    it("description sayıyla başlamıyor → null döner", () => {
        const alerts = [makeAlert({ type: "order_shortage", description: "Eksik stok mevcut" })];
        expect(extractShortageQty(alerts)).toBeNull();
    });

    it("birden fazla alert varsa order_shortage'ı bulur", () => {
        const alerts = [
            makeAlert({ type: "stock_critical" }),
            makeShortageAlert(35, "kg"),
        ];
        expect(extractShortageQty(alerts)).toBe(35);
    });
});

// ── shortReason ───────────────────────────────────────────────────────────────

describe("shortReason — order_shortage semantik hizalama", () => {
    it("order_shortage → 'Onaylı sipariş stokla karşılanamıyor'", () => {
        const alerts = [makeShortageAlert(20)];
        expect(shortReason(alerts)).toBe("Onaylı sipariş stokla karşılanamıyor");
    });

    it("order_shortage eski metni artık KULLANILMIYOR", () => {
        const alerts = [makeShortageAlert(20)];
        expect(shortReason(alerts)).not.toContain("Rezerve stok");
    });

    it("stock_critical → 'Stok kritik seviyenin altında' (bozulmadı)", () => {
        const alerts = [makeAlert({ type: "stock_critical" })];
        expect(shortReason(alerts)).toBe("Stok kritik seviyenin altında");
    });

    it("stock_risk → 'Stok uyarı eşiğine yaklaşıyor' (bozulmadı)", () => {
        const alerts = [makeAlert({ type: "stock_risk", severity: "warning" })];
        expect(shortReason(alerts)).toBe("Stok uyarı eşiğine yaklaşıyor");
    });

    it("order_shortage + stock_critical birlikte → order_shortage öncelikli", () => {
        const alerts = [makeAlert({ type: "stock_critical" }), makeShortageAlert(10)];
        expect(shortReason(alerts)).toBe("Onaylı sipariş stokla karşılanamıyor");
    });

    it("order_deadline critical → 'Sipariş son tarihi geçti'", () => {
        const alerts = [makeAlert({ type: "order_deadline", severity: "critical" })];
        expect(shortReason(alerts)).toBe("Sipariş son tarihi geçti");
    });

    it("order_deadline warning → 'Sipariş son tarihi yaklaşıyor'", () => {
        const alerts = [makeAlert({ type: "order_deadline", severity: "warning" })];
        expect(shortReason(alerts)).toBe("Sipariş son tarihi yaklaşıyor");
    });

    it("order_deadline critical + stock_risk → order_deadline öncelikli", () => {
        const alerts = [
            makeAlert({ type: "stock_risk", severity: "warning" }),
            makeAlert({ type: "order_deadline", severity: "critical" }),
        ];
        expect(shortReason(alerts)).toBe("Sipariş son tarihi geçti");
    });

    it("overdue_shipment → 'Planlanan sevk tarihi geçti'", () => {
        const alerts = [makeAlert({ type: "overdue_shipment", severity: "warning" })];
        expect(shortReason(alerts)).toBe("Planlanan sevk tarihi geçti");
    });
});

// ── shortImpact — order_shortage kolu ────────────────────────────────────────

describe("shortImpact — order_shortage description'dan qty kullanır", () => {
    it("shortage qty description'dan okunur — reserved-available HESAPLANMİYOR", () => {
        // old bug: reserved=60, available=40 → shortfall=20 (might be wrong)
        // real shortage might be 15 per the shortages table
        const alerts = [makeShortageAlert(15)];
        // available=40, reserved=60 → old formula would give 20; correct answer is 15
        expect(shortImpact(alerts, 40, 60, "adet", null)).toBe("15 adet eksik");
    });

    it("shortageQty description'dan alınır (reserved-available'dan farklı olabilir)", () => {
        const alerts = [makeShortageAlert(7, "kg")];
        // even if reserved=100 and available=50 (diff=50), we show 7
        expect(shortImpact(alerts, 50, 100, "kg", null)).toBe("7 kg eksik");
    });

    it("description parse edilemezse unit ile graceful fallback", () => {
        const alerts = [makeAlert({ type: "order_shortage", description: null })];
        expect(shortImpact(alerts, 40, 60, "adet", null)).toBe("adet eksik");
    });

    it("stok sağlıklı, coverage var → '~N günlük stok' (bozulmadı)", () => {
        const alerts = [makeAlert({ type: "stock_risk", severity: "warning" })];
        expect(shortImpact(alerts, 50, 0, "adet", 10)).toBe("~10 günlük stok");
    });

    it("stok tükendi → 'Stok tükendi' (bozulmadı)", () => {
        const alerts = [makeAlert({ type: "stock_critical" })];
        expect(shortImpact(alerts, 0, 0, "adet", 0)).toBe("Stok tükendi");
    });

    it("coverage >14 gün → available mevcut gösterilir (bozulmadı)", () => {
        const alerts = [makeAlert({ type: "stock_risk", severity: "warning" })];
        expect(shortImpact(alerts, 30, 0, "adet", 20)).toBe("30 adet mevcut");
    });
});
