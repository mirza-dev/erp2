/**
 * Faz 14 — tahsilat/ödeme durumu (Paraşüt → ERP tek yönlü okuma).
 *
 * NEDEN VAR: entegrasyon bugüne dek TEK YÖNLÜ idi (ERP → Paraşüt). Faturanın
 * tahsil edilip edilmediği yalnız Paraşüt'te biliniyordu. Genel Bakış'taki
 * "Açık Alacak" kartı tam bu yüzden 2026-06'da kaldırılmıştı — createdAt+30g
 * sabit vade varsayan, ödemeleri hiç düşmeyen bir proxy hesaptı.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "fs";
import {
    isOpenPayment,
    sumOpenReceivablesTry,
    paymentPatch,
    OPEN_PAYMENT_STATUSES,
} from "@/lib/services/parasut-payment-service";
import { receivablesView } from "@/lib/dashboard-view-model";
import type { ParasutPaymentState } from "@/lib/parasut-adapter";

const MIG = readFileSync("supabase/migrations/108_parasut_payment_status.sql", "utf8");
const SVC = readFileSync("src/lib/services/parasut-payment-service.ts", "utf8");
const VM  = readFileSync("src/lib/dashboard-view-model.ts", "utf8");

// ── Açık ödeme tanımı ────────────────────────────────────────────────────────

describe("isOpenPayment", () => {
    it("tahsil edilmemiş üç durum açık sayılır", () => {
        expect(isOpenPayment("unpaid")).toBe(true);
        expect(isOpenPayment("partially_paid")).toBe(true);
        expect(isOpenPayment("overdue")).toBe(true);
    });

    it("paid ve bilinmeyen durumlar açık DEĞİL", () => {
        expect(isOpenPayment("paid")).toBe(false);
        expect(isOpenPayment(null)).toBe(false);
        expect(isOpenPayment(undefined)).toBe(false);
        expect(isOpenPayment("wat")).toBe(false);
    });

    it("küme tam olarak üç değer taşır (sessiz genişleme yok)", () => {
        expect([...OPEN_PAYMENT_STATUSES].sort()).toEqual(["overdue", "partially_paid", "unpaid"]);
    });
});

// ── Para birimi güvenliği ────────────────────────────────────────────────────

describe("sumOpenReceivablesTry — para birimleri ASLA toplanmaz", () => {
    it("yalnız TL karşılığı toplanır", () => {
        const r = sumOpenReceivablesTry([
            { parasut_payment_status: "unpaid",         parasut_remaining_try: 1000 },
            { parasut_payment_status: "partially_paid", parasut_remaining_try: 250.5 },
        ]);
        expect(r.totalTry).toBe(1250.5);
        expect(r.openCount).toBe(2);
    });

    it("ödenmiş faturalar toplama girmez", () => {
        const r = sumOpenReceivablesTry([
            { parasut_payment_status: "paid",   parasut_remaining_try: 9999 },
            { parasut_payment_status: "unpaid", parasut_remaining_try: 100 },
        ]);
        expect(r.totalTry).toBe(100);
        expect(r.openCount).toBe(1);
    });

    it("TL karşılığı bilinmeyen kayıt 0 SAYILMAZ — ayrıca sayılır", () => {
        // Sessizce 0 saymak toplamı olduğundan küçük gösterirdi (B1 sınıfı hata).
        const r = sumOpenReceivablesTry([
            { parasut_payment_status: "unpaid", parasut_remaining_try: null },
            { parasut_payment_status: "unpaid", parasut_remaining_try: 500 },
        ]);
        expect(r.totalTry).toBe(500);
        expect(r.openCount).toBe(2);
        expect(r.unconvertibleCount).toBe(1);
    });

    it("boş listede sıfır", () => {
        expect(sumOpenReceivablesTry([])).toEqual({ totalTry: 0, openCount: 0, unconvertibleCount: 0 });
    });
});

// ── DB yaması ────────────────────────────────────────────────────────────────

describe("paymentPatch", () => {
    const state: ParasutPaymentState = {
        id: "inv1", payment_status: "partially_paid",
        remaining: 400, remaining_in_trl: 16000, currency: "USD", due_date: "2026-09-01",
    };

    it("dört alanı da yazar", () => {
        const patch = paymentPatch(state);
        expect(patch.parasut_payment_status).toBe("partially_paid");
        expect(patch.parasut_remaining).toBe(400);
        expect(patch.parasut_remaining_try).toBe(16000);
        expect(patch.parasut_payment_checked_at).toBeTruthy();
    });

    it("ham `remaining` ve TL karşılığı AYRI kolonlarda tutulur", () => {
        const patch = paymentPatch(state);
        // Karıştırılırsa USD tutarı TL sanılıp toplanırdı.
        expect(patch.parasut_remaining).not.toBe(patch.parasut_remaining_try);
    });
});

// ── Dashboard görünümü ───────────────────────────────────────────────────────

describe("receivablesView", () => {
    it("açık ve gecikmiş sayıları ayrı tutar", () => {
        const v = receivablesView([
            { paymentStatus: "unpaid",  remainingTry: 1000 },
            { paymentStatus: "overdue", remainingTry: 2000 },
            { paymentStatus: "paid",    remainingTry: 5000 },
        ], "TRY", null);
        expect(v.openCount).toBe(2);
        expect(v.overdueCount).toBe(1);
        expect(v.totalReporting).toBe(3000);
    });

    it("raporlama para birimi TRY değilse çevrilir", () => {
        const rates = { rates: { USD: { buying: 40, selling: 40 } } };
        const v = receivablesView([{ paymentStatus: "unpaid", remainingTry: 4000 }], "USD", rates);
        expect(v.totalReporting).toBeCloseTo(100, 5);
    });

    it("kur çözülemezse toplam 0'a düşer ama açık SAYISI korunur", () => {
        // Sayı kaybolmamalı: "3 açık fatura var ama tutarı gösteremiyorum"
        // demek, "hiç açık fatura yok" demekten iyidir.
        const v = receivablesView([
            { paymentStatus: "unpaid", remainingTry: 1000 },
        ], "GBP", null);
        expect(v.openCount).toBe(1);
        expect(v.totalReporting).toBe(0);
    });

    it("TL karşılığı bilinmeyen kayıt ayrıca sayılır", () => {
        const v = receivablesView([
            { paymentStatus: "unpaid", remainingTry: null },
            { paymentStatus: "unpaid", remainingTry: 100 },
        ], "TRY", null);
        expect(v.unknownCount).toBe(1);
        expect(v.totalReporting).toBe(100);
    });

    it("hepsi ödenmişse sıfır", () => {
        const v = receivablesView([{ paymentStatus: "paid", remainingTry: 500 }], "TRY", null);
        expect(v).toEqual({ openCount: 0, overdueCount: 0, totalReporting: 0, unknownCount: 0 });
    });
});

describe("Açık Alacak KPI kartı", () => {
    it("veri yoksa kart HİÇ üretilmez (fail-soft — Yoldaki Mal kalıbı)", () => {
        expect(VM).toContain("if (input.receivables != null) {");
    });

    it("eski proxy hesap geri gelmedi", () => {
        expect(VM).not.toMatch(/export function receivablesAging/);
    });

    it("gecikme varsa danger tonu, bilinmeyen varsa warning", () => {
        expect(VM).toContain('subTone: rec.overdueCount > 0 ? "danger" : rec.unknownCount > 0 ? "warning" : undefined,');
    });
});

// ── Poll davranışı (kaynak kilitleri) ────────────────────────────────────────

describe("poll CRON davranışı", () => {
    it("claim/lease KULLANMAZ — salt okuma (poll-e-documents kalıbı)", () => {
        expect(SVC).not.toContain("parasut_claim");
        expect(SVC).toContain("Claim/lease KULLANILMAZ");
    });

    it("`paid` terminal — bir daha sorgulanmaz (rate-limit koruması)", () => {
        expect(SVC).toContain('.or("parasut_payment_status.is.null,parasut_payment_status.neq.paid")');
        expect(MIG).toContain("parasut_payment_status != 'paid'");
    });

    it("en eski kontrol edilen önce sıraya girer (açlık yok)", () => {
        expect(SVC).toContain('.order("parasut_payment_checked_at", { ascending: true, nullsFirst: true })');
    });

    it("tek belgenin hatası diğerlerini DURDURMAZ", () => {
        expect(SVC).toContain("failed++");
        expect(SVC).toContain("parasut_payment_poll_fail");
    });

    it("PARASUT_ENABLED kapalıyken hiç çağrı yapılmaz ve bu ayırt edilebilir", () => {
        expect(SVC).toContain("return { checked: 0, updated: 0, failed: 0, overdue: 0, disabled: true };");
    });

    it("ERP Paraşüt'e tahsilat YAZMAZ (yalnız okur)", () => {
        expect(SVC).not.toMatch(/createPayment|postPayment|recordPayment/);
    });
});

describe("payment_overdue uyarısı", () => {
    it("yalnız SATIŞ tarafında açılır (gecikmiş borç muhasebenin işi)", () => {
        expect(SVC).toContain('if (target.entityType === "sales_order" && previous !== "overdue")');
    });

    it("durum zaten overdue ise TEKRAR uyarı açılmaz (churn yok)", () => {
        expect(SVC).toContain('previous !== "overdue"');
    });

    it("tahsil edilince uyarı kapanır", () => {
        expect(SVC).toContain('reason:   "payment_received"');
        expect(SVC).toContain('source:   "system"');
    });

    it("uyarı tipi CHECK'e, TS birliğine ve etiketlere eklendi", () => {
        expect(MIG).toContain("'payment_overdue'");
        const types = readFileSync("src/lib/database.types.ts", "utf8");
        expect(types).toContain('| "payment_overdue"');
        const labels = readFileSync("src/lib/alert-labels.ts", "utf8");
        expect(labels).toContain('payment_overdue:      "Geciken Tahsilat"');
    });

    it("Vadeler sekmesinde görünür", () => {
        const cal = readFileSync("src/lib/alert-calendar.ts", "utf8");
        expect(cal).toContain('"payment_overdue"');
    });
});

describe("migration 108", () => {
    it("iki tabloya da tahsilat kolonları eklenir", () => {
        expect(MIG).toContain("ALTER TABLE sales_orders");
        expect(MIG).toContain("ALTER TABLE purchase_orders");
        expect(MIG.match(/parasut_payment_status     text/g)?.length).toBe(2);
    });

    it("ham tutar ve TL karşılığı AYRI kolonlar", () => {
        expect(MIG).toContain("parasut_remaining          numeric(14,2)");
        expect(MIG).toContain("parasut_remaining_try      numeric(14,2)");
    });

    it("durum CHECK'i Paraşüt enum'uyla birebir", () => {
        expect(MIG).toContain("('paid','overdue','unpaid','partially_paid')");
    });

    it("user_note listeye GERİ EKLENMEDİ (092'de bilinçli düşürüldü)", () => {
        expect(MIG).not.toContain("'user_note'");
    });

    it("101'in tüm tipleri korundu (sessiz kayıp yok)", () => {
        for (const t of [
            "stock_critical", "stock_risk", "purchase_recommended", "order_shortage",
            "sync_issue", "order_deadline", "quote_expired", "overdue_shipment",
            "po_overdue", "rfq_response_due",
        ]) {
            expect(MIG, t).toContain(`'${t}'`);
        }
    });

    it("migration gate'ine kayıtlı", () => {
        const gate = readFileSync("scripts/check-migrations.ts", "utf8");
        expect(gate).toContain('"108": { kind: "column", table: "sales_orders", column: "parasut_payment_status" }');
    });
});
