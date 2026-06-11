/**
 * Genel Bakış view-model — saf helper testleri (TAM-SADIK yeniden kurulum).
 *  - Para: addMoney/dominantCurrency/formatMoneyByCurrency (korunan) + toReporting normalizasyon
 *  - Ciro/maliyet: monthlyRevenueReporting / monthlyOrderCounts / cogsToReporting
 *  - Stok: stockValueByCategoryReporting (raporlama para birimi)
 *  - Alacak KARTI KALDIRILDI: receivablesAging proxy hesabı silindi (geri-gelmez kilidi aşağıda)
 *  - Üretim: todayProduction / productionDailySeries (gerçek scrap)
 *  - Finans: recentOrdersView (normalize+RBAC) · buildKpis (6 KPI + RBAC) · aiPoints
 */
import { describe, it, expect } from "vitest";
import type { Product, Order, UretimKaydi } from "@/lib/mock-data";
import type { OpenAlert } from "@/lib/data-context";
import {
    addMoney, dominantCurrency, formatMoneyByCurrency,
    last12MonthKeys, monthLabels,
    toReporting, formatReportingM, formatReportingCompact, currencySymbol,
    monthlyRevenueReporting, monthlyOrderCounts, cogsToReporting,
    stockValueByCategoryReporting, productionDailySeries, listUnconvertibleCurrencies, canConvert,
    todayProduction, lastNProductionTotals,
    reorderView, alertsView, relativeTime, recentOrdersView,
    aiPointsFromOpsSummary, buildKpis, quotePipelineView, incomingPoView,
    periodModel, revenueByPeriod, orderCountsByPeriod, cogsByPeriod, productionInPeriod,
    type ExchangeRates, type CogsRow,
} from "@/lib/dashboard-view-model";

const NOW = new Date(2026, 5, 15, 12, 0, 0); // 15 Haziran 2026
// mid USD = (30+34)/2 = 32 TRY ; mid EUR = 35 TRY
const RATES: ExchangeRates = { rates: { USD: { buying: 30, selling: 34 }, EUR: { buying: 35, selling: 35 } } };

function mkProduct(p: Partial<Product>): Product {
    return {
        id: "p1", name: "Vana DN50", sku: "KV-50", category: "Küresel Vanalar", unit: "adet",
        price: 100, currency: "TRY", on_hand: 10, reserved: 0, available_now: 10, quoted: 0,
        promisable: 10, incoming: 0, forecasted: 10, minStockLevel: 5, isActive: true,
        productType: "manufactured", warehouse: "Depo", ...p,
    };
}
function mkOrder(o: Partial<Order>): Order {
    return {
        id: "o1", orderNumber: "ORD-1", customerName: "Müşteri", commercial_status: "approved",
        fulfillment_status: "allocated", grandTotal: 1000, currency: "TRY",
        createdAt: "2026-06-10", itemCount: 3, ...o,
    };
}
function mkUretim(u: Partial<UretimKaydi>): UretimKaydi {
    return { id: "u1", productId: "p1", productName: "Vana", productSku: "KV-50", adet: 50, scrap: 0, tarih: "2026-06-15", girenKullanici: "A", notlar: "", ...u };
}
function mkAlert(a: Partial<OpenAlert>): OpenAlert {
    return { id: "a1", severity: "warning", title: "Stok", type: "stock_risk", source: "system", created_at: "2026-06-15T08:00:00Z", ...a };
}

// ── Korunan baskın-para helper'ları ──────────────────────────
describe("money helpers (korunan)", () => {
    it("addMoney toplar, NaN'ı yok sayar", () => {
        const m = {}; addMoney(m, "TRY", 100); addMoney(m, "TRY", 50); addMoney(m, "USD", NaN);
        expect(m).toEqual({ TRY: 150 });
    });
    it("dominantCurrency en yüksek mutlak; boşta null", () => {
        expect(dominantCurrency({ TRY: 100, USD: 300 })).toBe("USD");
        expect(dominantCurrency({})).toBeNull();
    });
    it("formatMoneyByCurrency canView=false → '—'", () => {
        expect(formatMoneyByCurrency({ TRY: 100 }, false)).toBe("—");
    });
});

// ── Normalizasyon ────────────────────────────────────────────
describe("toReporting normalizasyon", () => {
    it("aynı para → değişmez", () => {
        expect(toReporting(100, "USD", "USD", RATES)).toBe(100);
    });
    it("TRY → USD (orta kur 32)", () => {
        expect(toReporting(3200, "TRY", "USD", RATES)).toBe(100);
    });
    it("EUR → USD (35/32)", () => {
        expect(toReporting(320, "EUR", "USD", RATES)).toBeCloseTo(350, 5);
    });
    it("kur çözülemiyor → 0 (toplam dışı; eski 'değişmeden geçir' 40 kat hata üretiyordu)", () => {
        expect(toReporting(50, "GBP", "USD", RATES)).toBe(0);
        expect(toReporting(50, "USD", "USD", null)).toBe(50); // aynı para — kur gerekmez
        expect(toReporting(50, "TRY", "USD", null)).toBe(0);  // USD kuru yok → hariç
    });
    it("NaN → 0", () => {
        expect(toReporting(NaN, "USD", "USD", RATES)).toBe(0);
    });
    it("canConvert + listUnconvertibleCurrencies: hariç kalanlar uyarı için listelenir", () => {
        expect(canConvert("TRY", "USD", RATES)).toBe(true);
        expect(canConvert("GBP", "USD", RATES)).toBe(false);
        expect(canConvert("USD", "USD", null)).toBe(true);
        expect(listUnconvertibleCurrencies(["TRY", "GBP", "USD", "GBP"], "USD", RATES)).toEqual(["GBP"]);
        expect(listUnconvertibleCurrencies(["TRY", "EUR"], "USD", null)).toEqual(["EUR", "TRY"]);
    });
});

describe("formatReporting + symbol", () => {
    it("currencySymbol", () => {
        expect(currencySymbol("USD")).toBe("$");
        expect(currencySymbol("EUR")).toBe("€");
        expect(currencySymbol("TRY")).toBe("₺");
    });
    it("formatReportingM/Compact + RBAC", () => {
        expect(formatReportingM(1_500_000, "USD", true)).toBe("$1.50M");
        expect(formatReportingM(1_500_000, "USD", false)).toBe("—");
        expect(formatReportingCompact(42_000, "USD", true)).toBe("$42K");
        expect(formatReportingCompact(120, "EUR", true)).toBe("€120");
    });
});

// ── Ciro / maliyet ───────────────────────────────────────────
describe("revenue/cost series", () => {
    it("last12MonthKeys + monthLabels", () => {
        const keys = last12MonthKeys(NOW);
        expect(keys).toHaveLength(12);
        expect(keys[11]).toBe("2026-06");
        expect(monthLabels(NOW)[11]).toBe("Haz");
    });
    it("monthlyRevenueReporting: YALNIZ approved sayılır (pending teklif şişirmesi mig.088)", () => {
        const orders = [
            mkOrder({ createdAt: "2026-06-01", grandTotal: 3200, currency: "TRY" }), // → 100 USD
            mkOrder({ createdAt: "2026-06-20", grandTotal: 100, currency: "USD" }),  // → 100 USD
            mkOrder({ createdAt: "2026-06-05", grandTotal: 9999, commercial_status: "cancelled" }),
            mkOrder({ createdAt: "2026-06-05", grandTotal: 8888, commercial_status: "draft" }),
            // Gönderilmiş-ama-kabul-edilmemiş teklifin pending siparişi → ciroya GİRMEZ
            mkOrder({ createdAt: "2026-06-07", grandTotal: 7777, currency: "USD", commercial_status: "pending_approval" }),
        ];
        const series = monthlyRevenueReporting(orders, "USD", RATES, NOW);
        expect(series[11]).toBeCloseTo(200, 5);
    });
    it("monthlyOrderCounts: yalnız approved sayar (draft/pending hariç)", () => {
        const orders = [
            mkOrder({ createdAt: "2026-06-01" }), mkOrder({ createdAt: "2026-06-02" }),
            mkOrder({ createdAt: "2026-06-03", commercial_status: "draft" }),
            mkOrder({ createdAt: "2026-06-04", commercial_status: "pending_approval" }),
        ];
        expect(monthlyOrderCounts(orders, NOW)[11]).toBe(2);
    });
    it("cogsToReporting: ürün-para bazlı satırları normalize eder", () => {
        const rows = [
            { month: "2026-06", currency: "TRY", cogs: 3200 }, // → 100 USD
            { month: "2026-06", currency: "USD", cogs: 50 },   // → 50
            { month: "2026-05", currency: "USD", cogs: 10 },
        ];
        const s = cogsToReporting(rows, "USD", RATES, NOW);
        expect(s[11]).toBeCloseTo(150, 5);
        expect(s[10]).toBe(10);
    });
});

// ── Stok donut ───────────────────────────────────────────────
describe("stockValueByCategoryReporting", () => {
    it("kategori toplar, raporlamaya normalize, azalan sıralı", () => {
        const products = [
            mkProduct({ category: "Vana", on_hand: 10, price: 100, currency: "TRY" }),   // 1000 TRY → 31.25 USD
            mkProduct({ category: "Conta", on_hand: 100, price: 100, currency: "TRY" }), // 10000 TRY → 312.5 USD
            mkProduct({ category: "Filtre", on_hand: 0, price: 50, currency: "USD", isActive: false }), // pasif/0 → yok
        ];
        const { segments, total } = stockValueByCategoryReporting(products, "USD", RATES);
        expect(segments.map((s) => s.name)).toEqual(["Conta", "Vana"]);
        expect(total).toBeCloseTo(343.75, 4);
        expect(segments[0].color).toMatch(/var\(--accent\)/);
    });
});

// ── Teklif Hattı / Yoldaki Mal ───────────────────────────────
describe("quotePipelineView", () => {
    const TODAY = "2026-06-15";
    const mkQ = (q: Partial<Parameters<typeof quotePipelineView>[0][number]>) => ({
        status: "sent", currency: "TRY", grandTotal: 3200, validUntil: null, ...q,
    });
    it("yalnız sent sayılır; toplam raporlamaya normalize", () => {
        const v = quotePipelineView([
            mkQ({}),                                          // 3200 TRY → 100 USD
            mkQ({ grandTotal: 100, currency: "USD" }),        // 100 USD
            mkQ({ status: "draft", grandTotal: 9999 }),
            mkQ({ status: "accepted", grandTotal: 9999 }),
            mkQ({ status: "expired", grandTotal: 9999 }),
        ], "USD", RATES, TODAY);
        expect(v.count).toBe(2);
        expect(v.totalReporting).toBeCloseTo(200, 5);
        expect(v.redacted).toBe(false);
    });
    it("expiring7d sınırları: bugün=dahil, 7.gün=dahil, 8.gün=hariç, null=expire olmaz, geçmiş=sayılmaz", () => {
        const v = quotePipelineView([
            mkQ({ validUntil: "2026-06-15" }), // bugün → dahil
            mkQ({ validUntil: "2026-06-22" }), // +7 → dahil
            mkQ({ validUntil: "2026-06-23" }), // +8 → hariç
            mkQ({ validUntil: null }),
            mkQ({ validUntil: "2026-06-14" }), // geçmiş → sayılmaz
        ], "USD", RATES, TODAY);
        expect(v.expiring7d).toBe(2);
        expect(v.count).toBe(5);
    });
    it("RBAC: herhangi bir satırda grandTotal null → redacted (adet yine doğru)", () => {
        const v = quotePipelineView([mkQ({}), mkQ({ grandTotal: null })], "USD", RATES, TODAY);
        expect(v.redacted).toBe(true);
        expect(v.count).toBe(2);
    });
});

describe("incomingPoView", () => {
    const TODAY = "2026-06-15";
    const mkPo = (p: Partial<Parameters<typeof incomingPoView>[0][number]>) => ({
        status: "sent", currency: "TRY", grand_total: 3200, expected_date: null, ...p,
    });
    it("açık set sent/confirmed/partially_received; received/cancelled/draft hariç", () => {
        const v = incomingPoView([
            mkPo({}),
            mkPo({ status: "confirmed", grand_total: 100, currency: "USD" }),
            mkPo({ status: "partially_received", grand_total: 100, currency: "USD" }),
            mkPo({ status: "received", grand_total: 9999 }),
            mkPo({ status: "cancelled", grand_total: 9999 }),
            mkPo({ status: "draft", grand_total: 9999 }),
        ], "USD", RATES, TODAY);
        expect(v.count).toBe(3);
        expect(v.totalReporting).toBeCloseTo(300, 5);
    });
    it("overdue: expected_date < bugün (string karşılaştırma); null/bugün/gelecek sayılmaz", () => {
        const v = incomingPoView([
            mkPo({ expected_date: "2026-06-14" }), // geçmiş → gecikmede
            mkPo({ expected_date: "2026-06-15" }), // bugün → değil
            mkPo({ expected_date: "2026-07-01" }),
            mkPo({ expected_date: null }),
        ], "USD", RATES, TODAY);
        expect(v.overdueCount).toBe(1);
    });
    it("RBAC: grand_total null → redacted", () => {
        const v = incomingPoView([mkPo({ grand_total: null })], "USD", RATES, TODAY);
        expect(v.redacted).toBe(true);
        expect(v.count).toBe(1);
    });
});

// ── Açık Alacak KALDIRILDI — geri-gelmez kilidi ──────────────
// receivablesAging siparişten türev bir PROXY idi (createdAt+30g sabit vade,
// 90g pencere, ödeme düşülmez) — kullanıcı kararıyla silindi. Gerçek alacak
// istenirse invoices/payments tablolarından yazılmalı.
describe("Açık Alacak geri-gelmez kilidi", () => {
    it("view-model receivablesAging/AgingBucket export etmez", async () => {
        const mod = await import("@/lib/dashboard-view-model");
        expect("receivablesAging" in mod).toBe(false);
    });
});

// financeSummary/grossToNetRevenue testleri kaldırıldı — Finansal Özet paneli
// silinince helper'lar da view-model'den çıkarıldı (tek tüketicileri paneldi).

// ── Üretim ───────────────────────────────────────────────────
describe("production", () => {
    it("todayProduction adet + tür", () => {
        const u = [
            mkUretim({ tarih: "2026-06-15", adet: 50, productId: "p1" }),
            mkUretim({ tarih: "2026-06-15", adet: 30, productId: "p2" }),
            mkUretim({ tarih: "2026-06-14", adet: 999, productId: "p3" }),
        ];
        expect(todayProduction(u, NOW)).toEqual({ qty: 80, types: 2 });
    });
    it("lastNProductionTotals son N gün", () => {
        const u = [
            mkUretim({ tarih: "2026-06-13", adet: 10 }),
            mkUretim({ tarih: "2026-06-14", adet: 20 }),
            mkUretim({ tarih: "2026-06-15", adet: 30 }),
        ];
        expect(lastNProductionTotals(u, 2)).toEqual([20, 30]);
    });
    it("productionDailySeries: gerçek good/scrap günlük (son 14)", () => {
        const u = [
            mkUretim({ tarih: "2026-06-15", adet: 100, scrap: 5 }),
            mkUretim({ tarih: "2026-06-15", adet: 20, scrap: 1 }),
            mkUretim({ tarih: "2026-06-14", adet: 40, scrap: 0 }),
        ];
        const s = productionDailySeries(u, NOW, 14);
        expect(s.days).toHaveLength(14);
        expect(s.days[13]).toBe("15");
        expect(s.good[13]).toBe(120);
        expect(s.scrap[13]).toBe(6);
        expect(s.good[12]).toBe(40);
        expect(s.scrap[0]).toBe(0); // 14 gün önce kayıt yok
    });
});

// ── Reorder / Alerts ─────────────────────────────────────────
describe("reorderView", () => {
    it("aciliyet + sıralama", () => {
        const rows = reorderView([
            mkProduct({ id: "a", sku: "A", promisable: 10, minStockLevel: 5 }),
            mkProduct({ id: "b", sku: "B", promisable: 0, minStockLevel: 5 }),
            mkProduct({ id: "c", sku: "C", promisable: 3, minStockLevel: 5 }),
        ]);
        expect(rows.map((r) => r.urgency)).toEqual(["danger", "warning", "info"]);
    });
});
describe("alertsView", () => {
    it("en yeni üstte + tone", () => {
        const rows = alertsView([
            mkAlert({ id: "old", created_at: "2026-06-10T00:00:00Z", severity: "info" }),
            mkAlert({ id: "new", created_at: "2026-06-15T00:00:00Z", severity: "critical" }),
        ], 5, NOW);
        expect(rows[0].id).toBe("new");
        expect(rows[0].tone).toBe("danger");
    });
    it("relativeTime", () => {
        expect(relativeTime(new Date(NOW.getTime() - 5 * 60000).toISOString(), NOW)).toBe("5 dk önce");
        expect(relativeTime(new Date(NOW.getTime() - 3 * 3600000).toISOString(), NOW)).toBe("3 sa önce");
    });
});

// ── Recent orders + RBAC ─────────────────────────────────────
describe("recentOrdersView (normalize + RBAC)", () => {
    it("durum/tone + tutar raporlamaya normalize", () => {
        const orders = [
            mkOrder({ id: "x", createdAt: "2026-06-15", commercial_status: "pending_approval", grandTotal: 3200, currency: "TRY" }),
            mkOrder({ id: "y", createdAt: "2026-06-14", commercial_status: "approved", fulfillment_status: "shipped", grandTotal: 100, currency: "USD" }),
        ];
        const admin = recentOrdersView(orders, "USD", RATES, true);
        expect(admin[0].status).toBe("Onay bekliyor");
        expect(admin[0].amount).toBe("$100");   // 3200 TRY → 100 USD
        expect(admin[1].status).toBe("Sevk edildi");
        const viewer = recentOrdersView(orders, "USD", RATES, false);
        expect(viewer[0].amount).toBe("—");
        expect(viewer[1].amount).toBe("—");
    });
});

// ── AI points ────────────────────────────────────────────────
describe("aiPointsFromOpsSummary", () => {
    it("anomalies→danger, insights→info, headline=summary, limit", () => {
        const v = aiPointsFromOpsSummary("Özet", ["i1", "i2"], ["a1"], 4);
        expect(v.headline).toBe("Özet");
        expect(v.points[0]).toEqual({ tone: "danger", text: "a1" });
        expect(v.points[1]).toEqual({ tone: "info", text: "i1" });
        expect(v.points).toHaveLength(3);
    });
    it("limit uygulanır", () => {
        const v = aiPointsFromOpsSummary("x", ["a", "b", "c", "d", "e"], [], 2);
        expect(v.points).toHaveLength(2);
    });
});

// ── buildKpis (6 KPI + RBAC) ─────────────────────────────────
describe("buildKpis", () => {
    const input = {
        products: [mkProduct({ on_hand: 100, price: 32_000, currency: "TRY" })], // 3.2M TRY → 100K USD
        orders: [mkOrder({ createdAt: "2026-06-10", grandTotal: 32_000_000, currency: "TRY", commercial_status: "approved", fulfillment_status: "allocated" })],
        uretimKayitlari: [mkUretim({ tarih: "2026-06-15", adet: 50 })],
        openAlerts: [mkAlert({ severity: "critical", type: "stock_risk" })],
        reporting: "USD",
        rates: RATES,
    };
    const allPerms = { canViewSalesPrices: true };

    it("5 KPI üretir — tahsilat (Açık Alacak) kartı YOK", () => {
        const k = buildKpis(input, allPerms, NOW);
        expect(k.map((x) => x.id)).toEqual(["ciro", "siparis", "stok", "uretim", "uyari"]);
        expect(k.some((x) => x.label.includes("Alacak"))).toBe(false);
    });

    it("quotes+purchaseOrders verilince 7 KPI — satış→tedarik anlatı sırası", () => {
        const k = buildKpis({
            ...input,
            quotes: [{ status: "sent", currency: "USD", grandTotal: 5000, validUntil: "2026-06-17" }],
            purchaseOrders: [{ status: "confirmed", currency: "USD", grand_total: 2000, expected_date: "2026-06-10" }],
        }, allPerms, NOW);
        expect(k.map((x) => x.id)).toEqual(["ciro", "siparis", "teklif", "stok", "yoldaki", "uretim", "uyari"]);
    });

    it("Teklif Hattı: değer+adet+expiring warning subTone+href", () => {
        const k = buildKpis({
            ...input,
            quotes: [
                { status: "sent", currency: "USD", grandTotal: 5000, validUntil: "2026-06-17" },
                { status: "sent", currency: "USD", grandTotal: 3000, validUntil: null },
                { status: "draft", currency: "USD", grandTotal: 999, validUntil: null },
            ],
        }, allPerms, NOW);
        const t = k.find((x) => x.id === "teklif")!;
        expect(t.label).toBe("Teklif Hattı");
        expect(t.value).toBe("$8K");
        expect(t.delta).toBe("2 teklif");
        expect(t.sub).toBe("1 tanesi 7 gün içinde doluyor");
        expect(t.subTone).toBe("warning");
        expect(t.href).toBe("/dashboard/quotes");
    });

    it("Yoldaki Mal: gecikme danger subTone; gecikme yoksa nötr sub", () => {
        const mk = (expected: string | null) => buildKpis({
            ...input,
            purchaseOrders: [{ status: "sent", currency: "USD", grand_total: 2000, expected_date: expected }],
        }, allPerms, NOW).find((x) => x.id === "yoldaki")!;
        const overdue = mk("2026-06-10");
        expect(overdue.value).toBe("$2K");
        expect(overdue.delta).toBe("1 açık PO");
        expect(overdue.sub).toBe("1 tanesi gecikmede");
        expect(overdue.subTone).toBe("danger");
        expect(overdue.href).toBe("/dashboard/purchase/orders");
        const onTime = mk("2026-07-01");
        expect(onTime.sub).toBe("Beklenen mal değeri · anlık");
        expect(onTime.subTone).toBeUndefined();
    });

    it("redaction: null tutarlı teklif/PO → değer '—', adet delta'da kalır", () => {
        const k = buildKpis({
            ...input,
            quotes: [{ status: "sent", currency: "USD", grandTotal: null, validUntil: null }],
            purchaseOrders: [{ status: "sent", currency: "USD", grand_total: null, expected_date: null }],
        }, allPerms, NOW);
        expect(k.find((x) => x.id === "teklif")!.value).toBe("—");
        expect(k.find((x) => x.id === "teklif")!.delta).toBe("1 teklif");
        expect(k.find((x) => x.id === "yoldaki")!.value).toBe("—");
    });

    it("tüm kartlar href taşır (ok ikonu artık gerçek navigasyon)", () => {
        const k = buildKpis(input, allPerms, NOW);
        expect(k.every((x) => typeof x.href === "string" && x.href.startsWith("/dashboard"))).toBe(true);
        expect(k.find((x) => x.id === "uyari")!.href).toBe("/dashboard/alerts");
    });

    it("uyarı KPI etiketi 'Açık Uyarılar' (değer tüm open+ack — info dahil)", () => {
        const k = buildKpis(input, allPerms, NOW);
        const uyari = k.find((x) => x.id === "uyari")!;
        expect(uyari.label).toBe("Açık Uyarılar");
        expect(uyari.value).toBe("1");
    });

    it("admin → finansal değerler görünür (raporlama para birimi)", () => {
        const k = buildKpis(input, allPerms, NOW);
        expect(k.find((x) => x.id === "ciro")!.value).toBe("$1.00M");   // 32M TRY → 1M USD
        expect(k.find((x) => x.id === "stok")!.value).not.toBe("—");
    });

    it("viewer (no sales) → ciro/stok '—', sayımlar görünür", () => {
        const k = buildKpis(input, { canViewSalesPrices: false }, NOW);
        expect(k.find((x) => x.id === "ciro")!.value).toBe("—");
        expect(k.find((x) => x.id === "stok")!.value).toBe("—");
        expect(k.find((x) => x.id === "siparis")!.value).toBe("1");
        expect(k.find((x) => x.id === "uretim")!.value).toBe("50 adet");
        expect(k.find((x) => x.id === "uyari")!.value).toBe("1");
    });

    it("viewer → ciro sparkline gizli (finansal seri sızmaz)", () => {
        const k = buildKpis(input, { canViewSalesPrices: false }, NOW);
        expect(k.find((x) => x.id === "ciro")!.spark).toBeUndefined();
    });
});

// ════════════════════════════════════════════════════════════════
//  Dönem modeli (segment filtresi) — periodModel + *ByPeriod
// ════════════════════════════════════════════════════════════════
describe("periodModel — Bugün/Hafta/Ay/Çeyrek", () => {
    it("her aralık doğru kova sayısı / currentIndex / monthAligned / kpiLabel verir", () => {
        const ay = periodModel("Ay", NOW);
        expect([ay.bucketCount, ay.currentIndex, ay.monthAligned, ay.kpiLabel]).toEqual([12, 11, true, "Aylık"]);
        const ceyrek = periodModel("Çeyrek", NOW);
        expect([ceyrek.bucketCount, ceyrek.currentIndex, ceyrek.monthAligned, ceyrek.kpiLabel]).toEqual([4, 3, true, "Çeyreklik"]);
        const hafta = periodModel("Hafta", NOW);
        expect([hafta.bucketCount, hafta.currentIndex, hafta.monthAligned, hafta.kpiLabel]).toEqual([12, 11, false, "Haftalık"]);
        const bugun = periodModel("Bugün", NOW);
        expect([bugun.bucketCount, bugun.currentIndex, bugun.monthAligned, bugun.kpiLabel]).toEqual([14, 13, false, "Günlük"]);
    });

    it("indexOf bugünü güncel kovaya, aralık dışını null'a eşler (her aralık)", () => {
        const today = "2026-06-15T10:00:00Z";
        const old = "2020-01-01T00:00:00Z";
        for (const r of ["Bugün", "Hafta", "Ay", "Çeyrek"] as const) {
            const p = periodModel(r, NOW);
            expect(p.indexOf(today)).toBe(p.currentIndex);
            expect(p.indexOf(old)).toBeNull();
        }
    });

    it("Çeyrek currentLabel Ç2'26 (Haziran = 2. çeyrek)", () => {
        expect(periodModel("Çeyrek", NOW).labels[3]).toBe("Ç2'26");
    });

    it("Çeyrek: Nis/May/Haz aynı (güncel) kovaya düşer; Mart önceki kovada", () => {
        const p = periodModel("Çeyrek", NOW);
        expect(p.indexOf("2026-04-10")).toBe(3);
        expect(p.indexOf("2026-05-10")).toBe(3);
        expect(p.indexOf("2026-06-10")).toBe(3);
        expect(p.indexOf("2026-03-31")).toBe(2);
    });
});

describe("revenueByPeriod / orderCountsByPeriod", () => {
    const orders = [
        mkOrder({ id: "a", createdAt: "2026-06-15T09:00:00Z", grandTotal: 1000, currency: "TRY", commercial_status: "approved" }),
        mkOrder({ id: "b", createdAt: "2026-06-15T11:00:00Z", grandTotal: 500, currency: "TRY", commercial_status: "approved" }),
        mkOrder({ id: "c", createdAt: "2026-03-01T00:00:00Z", grandTotal: 9999, currency: "TRY", commercial_status: "approved" }),
        mkOrder({ id: "d", createdAt: "2026-06-15T12:00:00Z", grandTotal: 7777, currency: "TRY", commercial_status: "draft" }), // taslak hariç
    ];
    it("Ay: güncel ay cirosu toplar (taslak hariç), eski ay ayrı kovada", () => {
        const p = periodModel("Ay", NOW);
        const rev = revenueByPeriod(orders, "TRY", null, p);
        expect(rev[p.currentIndex]).toBe(1500);
        expect(rev[8]).toBe(9999); // Mart (index 11-3)
    });
    it("orderCountsByPeriod taslağı saymaz", () => {
        const p = periodModel("Ay", NOW);
        const counts = orderCountsByPeriod(orders, p);
        expect(counts[p.currentIndex]).toBe(2);
    });
    it("Bugün: bugünkü ciro currentIndex'te", () => {
        const p = periodModel("Bugün", NOW);
        expect(revenueByPeriod(orders, "TRY", null, p)[p.currentIndex]).toBe(1500);
    });
});

describe("cogsByPeriod — yalnız monthAligned", () => {
    const rows: CogsRow[] = [
        { month: "2026-06", currency: "TRY", cogs: 100 },
        { month: "2026-05", currency: "TRY", cogs: 100 },
        { month: "2026-04", currency: "TRY", cogs: 100 },
    ];
    it("Hafta/Bugün → null (aylık RPC kovalanamaz)", () => {
        expect(cogsByPeriod(rows, "TRY", null, periodModel("Hafta", NOW))).toBeNull();
        expect(cogsByPeriod(rows, "TRY", null, periodModel("Bugün", NOW))).toBeNull();
    });
    it("Çeyrek → Q2 (Nis+May+Haz) tek kovada toplanır (300)", () => {
        const p = periodModel("Çeyrek", NOW);
        const c = cogsByPeriod(rows, "TRY", null, p)!;
        expect(c[p.currentIndex]).toBe(300);
    });
    it("Ay → Haziran kovasında 100", () => {
        const p = periodModel("Ay", NOW);
        expect(cogsByPeriod(rows, "TRY", null, p)![p.currentIndex]).toBe(100);
    });
});

describe("productionInPeriod + buildKpis dönem entegrasyonu", () => {
    it("productionInPeriod YALNIZ güncel kovayı sayar (pencere değil)", () => {
        const u = [
            mkUretim({ tarih: "2026-06-15", adet: 50, productId: "p1" }), // bugün (currentIndex)
            mkUretim({ tarih: "2026-06-15", adet: 30, productId: "p2" }), // bugün
            mkUretim({ tarih: "2026-06-10", adet: 7, productId: "p4" }),  // 5 gün önce: pencerede AMA güncel kova değil
            mkUretim({ tarih: "2020-01-01", adet: 999, productId: "p3" }), // pencere dışı
        ];
        // Pencere-toplamı olsa {qty:87,types:3} olurdu; doğru = yalnız bugün.
        expect(productionInPeriod(u, periodModel("Bugün", NOW))).toEqual({ qty: 80, types: 2 });
    });

    it("buildKpis: Çeyrek dönem → Ciro etiketi 'Çeyreklik Ciro'", () => {
        const input = {
            products: [mkProduct({})], orders: [mkOrder({ createdAt: "2026-06-15T09:00:00Z", grandTotal: 1000, currency: "TRY", commercial_status: "approved" })],
            uretimKayitlari: [], openAlerts: [], reporting: "TRY", rates: null,
        };
        const k = buildKpis(input, { canViewSalesPrices: true }, NOW, periodModel("Çeyrek", NOW));
        expect(k.find((x) => x.id === "ciro")!.label).toBe("Çeyreklik Ciro");
    });

    it("buildKpis: dönemde sipariş yoksa Ciro '—' + 'Bu dönemde sipariş yok'", () => {
        const input = {
            products: [mkProduct({})], orders: [], uretimKayitlari: [], openAlerts: [], reporting: "TRY", rates: null,
        };
        const k = buildKpis(input, { canViewSalesPrices: true }, NOW, periodModel("Bugün", NOW));
        const ciro = k.find((x) => x.id === "ciro")!;
        expect(ciro.value).toBe("—");
        expect(ciro.sub).toBe("Bu dönemde sipariş yok");
    });

    it("buildKpis: snapshot KPI'lar 'anlık' etiketi taşır", () => {
        const input = {
            products: [mkProduct({})], orders: [mkOrder({ commercial_status: "approved", fulfillment_status: "allocated" })],
            uretimKayitlari: [], openAlerts: [mkAlert({ severity: "critical", type: "stock_risk" })], reporting: "TRY", rates: null,
        };
        const k = buildKpis(input, { canViewSalesPrices: true }, NOW);
        expect(k.find((x) => x.id === "siparis")!.sub).toMatch(/anlık/);
        expect(k.find((x) => x.id === "stok")!.sub).toMatch(/anlık/);
        expect(k.find((x) => x.id === "uyari")!.sub).toMatch(/anlık/);
    });
});
