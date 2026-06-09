/**
 * Genel Bakış (Executive Dashboard) — saf view-model katmanı.
 *
 * `roven-dashboard 2/` tasarımına BİREBİR sadık (dashboard-app.jsx + charts.jsx + data.js).
 * UI bileşenleri burada hesap yapmaz — tek kaynak burası (precedent: `alert-calendar.ts`).
 *
 * ── Tek raporlama para birimi ──
 * Tasarım tek-USD; gerçek veri karışık (TRY/EUR/USD). Tüm parasal toplamlar
 * `company_settings.currency`'ye (raporlama para birimi) `/api/exchange-rates` orta kuruyla
 * normalize edilir (`toReporting`). Eksik kur → tutar dönüştürülmeden geçer (defansif).
 * Eski `MoneyByCurrency` baskın-para helper'ları test edilebilirlik için korunur (kullanılmıyor).
 *
 * ── RBAC ──
 * Viewer'a `/api/products?all=1` `price=null` → `mapProduct` `?? 0` (NaN yok). Maskeleme
 * **permission tabanlı** (`canView`), 0 değerine göre değil. Finansal değerler yetki yoksa "—".
 */
import type { Product, Order, UretimKaydi } from "./mock-data";
import type { OpenAlert } from "./data-context";
import { maskCurrency, formatNumber } from "./utils";

export type Tone = "accent" | "success" | "warning" | "danger" | "info";

/** Para birimi → tutar. (Eski baskın-para yolu; test için korunur.) */
export type MoneyByCurrency = Record<string, number>;

export const MONTH_ABBR_TR = [
    "Oca", "Şub", "Mar", "Nis", "May", "Haz",
    "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara",
] as const;

/** Donut kategori paleti — CSS var + tema-bağımsız tint karışımı. */
export const CATEGORY_COLORS = [
    "var(--accent)", "#9b8cff", "var(--success)", "var(--warning)",
    "#e06ec0", "#5bb8d4", "#d4915b",
] as const;

// ════════════════════════════════════════════════════════════════
//  Para birimi yardımcıları (eski baskın-para yolu — korunur, kullanılmıyor)
// ════════════════════════════════════════════════════════════════

/** Para birimi bazında tutar ekle (map'i mutate eder). */
export function addMoney(map: MoneyByCurrency, currency: string, amount: number): void {
    if (!Number.isFinite(amount)) return;
    map[currency] = (map[currency] ?? 0) + amount;
}

/** En yüksek (mutlak) tutara sahip para birimi; map boşsa null. */
export function dominantCurrency(map: MoneyByCurrency): string | null {
    let best: string | null = null;
    let bestAbs = -1;
    for (const [cur, amt] of Object.entries(map)) {
        const a = Math.abs(amt);
        if (a > bestAbs) { bestAbs = a; best = cur; }
    }
    return best;
}

/** Para map'ini gösterilebilir metne çevirir (baskın + parantezli kırılım). */
export function formatMoneyByCurrency(map: MoneyByCurrency, canView = true): string {
    if (!canView) return "—";
    const dom = dominantCurrency(map);
    if (dom === null) return maskCurrency(0, "TRY", true);
    const primary = maskCurrency(map[dom], dom, true);
    const rest = Object.keys(map)
        .filter((c) => c !== dom && Math.abs(map[c]) > 0)
        .sort((a, b) => Math.abs(map[b]) - Math.abs(map[a]))
        .map((c) => maskCurrency(map[c], c, true));
    return rest.length > 0 ? `${primary} (+ ${rest.join(" · ")})` : primary;
}

// ════════════════════════════════════════════════════════════════
//  Raporlama para birimi normalizasyonu (aktif yol)
// ════════════════════════════════════════════════════════════════

/** /api/exchange-rates yanıtı (gevşek — eksik alanlara dayanıklı). */
export interface ExchangeRates {
    rates?: Partial<Record<string, { buying: number; selling: number }>>;
}

const CUR_SYMBOL: Record<string, string> = { USD: "$", EUR: "€", TRY: "₺", GBP: "£" };
function curSymbol(c: string): string {
    return CUR_SYMBOL[c] ?? `${c} `;
}
/** Para birimi sembolü ($/€/₺); bilinmeyen → "KOD " (bileşenlerde prefix için). */
export function currencySymbol(c: string): string {
    return curSymbol(c);
}

/** Para biriminin TRY karşılığı orta kuru. TRY→1; bilinmeyen/eksik→null. */
function midRate(rates: ExchangeRates | null, cur: string): number | null {
    if (cur === "TRY") return 1;
    const pair = rates?.rates?.[cur];
    if (!pair) return null;
    const m = (Number(pair.buying) + Number(pair.selling)) / 2;
    return Number.isFinite(m) && m > 0 ? m : null;
}

/**
 * Tutarı `fromCur`'dan raporlama para birimine çevirir (orta kur).
 * Kur eksikse/dönüştürülemiyorsa tutar değişmeden döner (defansif — çöp NaN üretmez).
 */
export function toReporting(
    amount: number, fromCur: string, reporting: string, rates: ExchangeRates | null,
): number {
    if (!Number.isFinite(amount)) return 0;
    if (fromCur === reporting) return amount;
    const from = midRate(rates, fromCur);
    const to = midRate(rates, reporting);
    if (from === null || to === null) return amount;
    return (amount * from) / to;
}

/** Tek-para kompakt biçim ($1.50M / $42K / $120). Yetki yoksa "—". */
export function formatReportingCompact(amount: number, reporting: string, canView = true): string {
    if (!canView) return "—";
    const s = curSymbol(reporting);
    const a = Math.abs(amount);
    if (a >= 1e6) return `${s}${(amount / 1e6).toFixed(2)}M`;
    if (a >= 1e3) return `${s}${Math.round(amount / 1e3)}K`;
    return `${s}${Math.round(amount)}`;
}

/** Tek-para "milyon" biçim ($1.50M) — KPI ciro/stok/alacak için. Yetki yoksa "—". */
export function formatReportingM(amount: number, reporting: string, canView = true): string {
    if (!canView) return "—";
    return `${curSymbol(reporting)}${(amount / 1e6).toFixed(2)}M`;
}

// ════════════════════════════════════════════════════════════════
//  Sipariş / ciro hesapları
// ════════════════════════════════════════════════════════════════

/** Ciroya sayılan sipariş mi? (iptal/taslak hariç) */
function isRevenueOrder(o: Order): boolean {
    return o.commercial_status !== "cancelled" && o.commercial_status !== "draft";
}

/** Açık sipariş mi? (onaylı/onay-bekleyen & sevk edilmemiş) */
export function isOpenOrder(o: Order): boolean {
    return (
        (o.commercial_status === "approved" || o.commercial_status === "pending_approval") &&
        o.fulfillment_status !== "shipped"
    );
}

/** `YYYY-MM` anahtarı (createdAt ISO veya tarih). */
function monthKey(iso: string): string {
    return iso.slice(0, 7);
}

/** Son 12 ay anahtarları (now dahil, eskiden yeniye). */
export function last12MonthKeys(now: Date = new Date()): string[] {
    const keys: string[] = [];
    const y = now.getFullYear();
    const m = now.getMonth();
    for (let i = 11; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return keys;
}

/** Son 12 ay etiketleri (kısa TR ay adı). */
export function monthLabels(now: Date = new Date()): string[] {
    return last12MonthKeys(now).map((k) => MONTH_ABBR_TR[Number(k.slice(5, 7)) - 1]);
}

/** Aylık ciro, raporlama para biriminde (son 12 ay, eskiden yeniye). */
export function monthlyRevenueReporting(
    orders: Order[], reporting: string, rates: ExchangeRates | null, now: Date = new Date(),
): number[] {
    const idx = new Map(last12MonthKeys(now).map((k, i) => [k, i]));
    const out = new Array(12).fill(0);
    for (const o of orders) {
        if (!isRevenueOrder(o)) continue;
        const i = idx.get(monthKey(o.createdAt));
        if (i === undefined) continue;
        out[i] += toReporting(o.grandTotal, o.currency, reporting, rates);
    }
    return out;
}

/** Aylık sipariş adedi (son 12 ay) — trend tooltip'i için. */
export function monthlyOrderCounts(orders: Order[], now: Date = new Date()): number[] {
    const idx = new Map(last12MonthKeys(now).map((k, i) => [k, i]));
    const out = new Array(12).fill(0);
    for (const o of orders) {
        if (!isRevenueOrder(o)) continue;
        const i = idx.get(monthKey(o.createdAt));
        if (i !== undefined) out[i] += 1;
    }
    return out;
}

/** Aylık COGS (RPC satırları) → raporlama para biriminde son 12 ay serisi. */
export interface CogsRow { month: string; currency: string; cogs: number }
export function cogsToReporting(
    rows: CogsRow[], reporting: string, rates: ExchangeRates | null, now: Date = new Date(),
): number[] {
    const idx = new Map(last12MonthKeys(now).map((k, i) => [k, i]));
    const out = new Array(12).fill(0);
    for (const r of rows) {
        const i = idx.get(r.month);
        if (i === undefined) continue;
        out[i] += toReporting(r.cogs, r.currency, reporting, rates);
    }
    return out;
}

/** Açık siparişlerin raporlama-para toplam değeri. */
export function openOrdersValueReporting(orders: Order[], reporting: string, rates: ExchangeRates | null): number {
    let s = 0;
    for (const o of orders) if (isOpenOrder(o)) s += toReporting(o.grandTotal, o.currency, reporting, rates);
    return s;
}

// ════════════════════════════════════════════════════════════════
//  Stok değeri / kategori dağılımı (raporlama para birimi)
// ════════════════════════════════════════════════════════════════

/** Toplam stok değeri (on_hand × price), raporlama para biriminde. */
export function stockValueReporting(products: Product[], reporting: string, rates: ExchangeRates | null): number {
    let s = 0;
    for (const p of products) if (p.isActive) s += toReporting(p.on_hand * p.price, p.currency, reporting, rates);
    return s;
}

/** Satılabilir stok değeri (available_now × price), raporlama para biriminde. */
export function availableStockValueReporting(products: Product[], reporting: string, rates: ExchangeRates | null): number {
    let s = 0;
    for (const p of products) if (p.isActive) s += toReporting(p.available_now * p.price, p.currency, reporting, rates);
    return s;
}

export interface CategorySegment {
    name: string;
    value: number;
    color: string;
}

/** Donut: kategori bazında stok değeri (raporlama para birimine normalize, değere göre azalan). */
export function stockValueByCategoryReporting(
    products: Product[], reporting: string, rates: ExchangeRates | null,
): { segments: CategorySegment[]; total: number } {
    const catMap = new Map<string, number>();
    for (const p of products) {
        if (!p.isActive) continue;
        const v = toReporting(p.on_hand * p.price, p.currency, reporting, rates);
        catMap.set(p.category, (catMap.get(p.category) ?? 0) + v);
    }
    const segments = [...catMap.entries()]
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value], i) => ({ name, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] }));
    return { segments, total: segments.reduce((s, x) => s + x.value, 0) };
}

// ════════════════════════════════════════════════════════════════
//  Alacak yaşlandırma (siparişlerden türev — dürüst; fatura/ödeme tablosu yok)
// ════════════════════════════════════════════════════════════════

export interface AgingBucket { label: string; value: number; tone: Tone }
export interface ReceivablesView {
    buckets: AgingBucket[];
    total: number;
    overdue60: number;
    overduePct: number;
}

/**
 * Alacak yaşlandırma — faturalanmış (approved & shipped|allocated) siparişlerden türetilir.
 * vade = createdAt + 30g; son 90 günle sınırlı (eskiler tahsil varsayılır — dürüst sınır).
 * Tutar = siparişin tam grandTotal'ı (ödeme verisi yok → sahte kısmi tahsilat YOK).
 */
export function receivablesAging(
    orders: Order[], reporting: string, rates: ExchangeRates | null, now: Date = new Date(),
): ReceivablesView {
    const b = { notdue: 0, b0: 0, b30: 0, b60: 0 };
    const t = now.getTime();
    for (const o of orders) {
        const invoiced = o.commercial_status === "approved" &&
            (o.fulfillment_status === "shipped" || o.fulfillment_status === "allocated");
        if (!invoiced) continue;
        const created = new Date(o.createdAt).getTime();
        const ageDays = Math.floor((t - created) / 86_400_000);
        if (ageDays > 90) continue;
        const overdue = Math.floor((t - (created + 30 * 86_400_000)) / 86_400_000);
        const amt = toReporting(o.grandTotal, o.currency, reporting, rates);
        if (overdue < 0) b.notdue += amt;
        else if (overdue <= 30) b.b0 += amt;
        else if (overdue <= 60) b.b30 += amt;
        else b.b60 += amt;
    }
    const buckets: AgingBucket[] = [
        { label: "Vadesi gelmemiş", value: Math.round(b.notdue), tone: "success" },
        { label: "0–30 gün", value: Math.round(b.b0), tone: "info" },
        { label: "31–60 gün", value: Math.round(b.b30), tone: "warning" },
        { label: "60+ gün", value: Math.round(b.b60), tone: "danger" },
    ];
    const total = buckets.reduce((s, a) => s + a.value, 0);
    const overdue = b.b0 + b.b30 + b.b60;
    return {
        buckets,
        total,
        overdue60: Math.round(b.b60),
        overduePct: total > 0 ? Math.round((overdue / total) * 100) : 0,
    };
}

// ════════════════════════════════════════════════════════════════
//  Finansal özet (brüt kâr / marj / money-flow)
// ════════════════════════════════════════════════════════════════

/** Projede KDV sabit %20 (domain: grandTotal = subtotal + subtotal×0.20). */
export const REPORTING_VAT_RATE = 0.20;

/** KDV-dahil tutarı KDV-hariç (net) tutara çevirir. Brüt kâr tabanı için. */
export function grossToNetRevenue(gross: number, vatRate = REPORTING_VAT_RATE): number {
    return gross / (1 + vatRate);
}

export interface FinanceSummary {
    revenue: number;   // NET ciro (KDV hariç) — kâr/marj tabanı
    cost: number;      // COGS (vergisiz)
    grossProfit: number;
    marginPct: number;
    costPct: number;
}

/**
 * Brüt kâr / marj / maliyet yüzdesi.
 * ⚠️ `netRevenueLast` KDV-HARİÇ olmalı (COGS vergisiz) — aksi halde marj KDV oranı kadar şişer.
 * KPI "Aylık Ciro" + trend brüt (grandTotal) kalır; YALNIZ bu hesap net bazlıdır.
 */
export function financeSummary(netRevenueLast: number, costLast: number): FinanceSummary {
    const grossProfit = netRevenueLast - costLast;
    return {
        revenue: netRevenueLast,
        cost: costLast,
        grossProfit,
        marginPct: netRevenueLast > 0 ? (grossProfit / netRevenueLast) * 100 : 0,
        costPct: netRevenueLast > 0 ? (costLast / netRevenueLast) * 100 : 0,
    };
}

// ════════════════════════════════════════════════════════════════
//  Üretim
// ════════════════════════════════════════════════════════════════

/** Yerel `YYYY-MM-DD`. */
function localDateKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Bugünkü üretim: toplam adet + ürün türü sayısı. */
export function todayProduction(
    uretim: UretimKaydi[], now: Date = new Date(),
): { qty: number; types: number } {
    const today = localDateKey(now);
    const todays = uretim.filter((u) => u.tarih === today);
    const qty = todays.reduce((s, u) => s + u.adet, 0);
    const types = new Set(todays.map((u) => u.productId)).size;
    return { qty, types };
}

/** Son N farklı günün üretim adedi (sparkline). */
export function lastNProductionTotals(uretim: UretimKaydi[], n = 6): number[] {
    const byDate = new Map<string, number>();
    for (const u of uretim) byDate.set(u.tarih, (byDate.get(u.tarih) ?? 0) + u.adet);
    return [...byDate.keys()].sort().slice(-n).map((d) => byDate.get(d)!);
}

/** Son N günün günlük sağlam/fire serisi (gerçek `scrap_qty`). */
export function productionDailySeries(
    uretim: UretimKaydi[], now: Date = new Date(), days = 14,
): { days: string[]; good: number[]; scrap: number[] } {
    const good = new Map<string, number>();
    const scrap = new Map<string, number>();
    for (const u of uretim) {
        good.set(u.tarih, (good.get(u.tarih) ?? 0) + (u.adet || 0));
        scrap.set(u.tarih, (scrap.get(u.tarih) ?? 0) + (u.scrap || 0));
    }
    const labels: string[] = [], g: number[] = [], s: number[] = [];
    for (let d = days - 1; d >= 0; d--) {
        const key = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - d));
        labels.push(String(Number(key.slice(8, 10))));
        g.push(good.get(key) ?? 0);
        s.push(scrap.get(key) ?? 0);
    }
    return { days: labels, good: g, scrap: s };
}

// ════════════════════════════════════════════════════════════════
//  Satın alma önerileri
// ════════════════════════════════════════════════════════════════

export interface ReorderRow {
    code: string;
    name: string;
    need: number;
    unit: string;
    vendor: string;
    urgency: "danger" | "warning" | "info";
}

const URGENCY_RANK: Record<ReorderRow["urgency"], number> = { danger: 0, warning: 1, info: 2 };

/** `reorderSuggestions` (useData) → tablo satırları, aciliyet sıralı, ilk N. */
export function reorderView(suggestions: Product[], limit = 5): ReorderRow[] {
    return suggestions
        .map((p): ReorderRow => {
            const avail = p.promisable ?? p.available_now;
            const urgency = avail <= 0 ? "danger" : avail <= p.minStockLevel ? "warning" : "info";
            return {
                code: p.sku,
                name: p.name,
                need: p.reorderQty ?? p.minStockLevel,
                unit: p.unit,
                vendor: p.preferredVendor ?? "—",
                urgency,
            };
        })
        .sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
        .slice(0, limit);
}

// ════════════════════════════════════════════════════════════════
//  Uyarılar
// ════════════════════════════════════════════════════════════════

export interface AlertRow {
    id: string;
    title: string;
    desc: string;
    tone: Tone;
    time: string;
}

function alertTone(sev: OpenAlert["severity"]): Tone {
    return sev === "critical" ? "danger" : sev === "warning" ? "warning" : "info";
}

/** Göreli zaman ("5 dk önce" / "3 sa önce" / "dün" / "X gün önce"). */
export function relativeTime(iso: string, now: Date = new Date()): string {
    const mins = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
    if (mins < 1) return "az önce";
    if (mins < 60) return `${mins} dk önce`;
    if (mins < 1440) return `${Math.floor(mins / 60)} sa önce`;
    const days = Math.floor(mins / 1440);
    return days === 1 ? "dün" : `${days} gün önce`;
}

/** Açık uyarılar → kart satırları (en yeni üstte). */
export function alertsView(alerts: OpenAlert[], limit = 5, now: Date = new Date()): AlertRow[] {
    return [...alerts]
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, limit)
        .map((a) => ({
            id: a.id,
            title: a.title,
            desc: a.description ?? "",
            tone: alertTone(a.severity),
            time: relativeTime(a.created_at, now),
        }));
}

// ════════════════════════════════════════════════════════════════
//  Son siparişler
// ════════════════════════════════════════════════════════════════

export interface RecentOrderRow {
    id: string;
    no: string;
    customer: string;
    amount: string;
    status: string;
    tone: Tone;
}

const FULFILL_LABEL: Record<Order["fulfillment_status"], string> = {
    shipped: "Sevk edildi",
    allocated: "Rezerveli",
    partially_allocated: "Kısmi tahsis",
    partially_shipped: "Kısmi sevk",
    unallocated: "Bekliyor",
};
const FULFILL_TONE: Record<Order["fulfillment_status"], Tone> = {
    shipped: "success",
    allocated: "info",
    partially_allocated: "info",
    partially_shipped: "info",
    unallocated: "warning",
};

/** En yeni N sipariş → tablo satırları; tutar raporlama para birimine normalize + RBAC maskeli. */
export function recentOrdersView(
    orders: Order[],
    reporting: string,
    rates: ExchangeRates | null,
    canViewPrices: boolean,
    limit = 5,
): RecentOrderRow[] {
    return [...orders]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, limit)
        .map((o) => {
            let status: string;
            let tone: Tone;
            if (o.commercial_status === "cancelled") {
                status = "İptal"; tone = "danger";
            } else if (o.commercial_status === "draft") {
                status = "Taslak"; tone = "info";
            } else if (o.commercial_status === "pending_approval") {
                status = "Onay bekliyor"; tone = "warning";
            } else {
                status = FULFILL_LABEL[o.fulfillment_status];
                tone = FULFILL_TONE[o.fulfillment_status];
            }
            const normalized = toReporting(o.grandTotal, o.currency, reporting, rates);
            return {
                id: o.id,
                no: o.orderNumber,
                customer: o.customerName,
                amount: formatReportingCompact(normalized, reporting, canViewPrices),
                status,
                tone,
            };
        });
}

// ════════════════════════════════════════════════════════════════
//  AI Operasyon Özeti — ops-summary {summary, insights, anomalies} → tasarım şekli
// ════════════════════════════════════════════════════════════════

export interface AiPoint { tone: Tone; text: string }
export interface AiPanelView { headline: string; points: AiPoint[] }

/** ops-summary çıktısını tasarımın headline + tonlu maddeler şekline uyarlar. */
export function aiPointsFromOpsSummary(
    summary: string, insights: string[] = [], anomalies: string[] = [], limit = 4,
): AiPanelView {
    const points: AiPoint[] = [];
    for (const a of anomalies) points.push({ tone: "danger", text: a });
    for (const i of insights) points.push({ tone: "info", text: i });
    return { headline: summary, points: points.slice(0, limit) };
}

// ════════════════════════════════════════════════════════════════
//  KPI şeridi (6 KPI — tasarımla birebir)
// ════════════════════════════════════════════════════════════════

export interface DashboardKpi {
    id: string;
    label: string;
    value: string;
    tone: Tone;
    sub?: string;
    delta?: string;
    up?: boolean;
    spark?: number[];
}

export interface KpiInput {
    products: Product[];
    orders: Order[];
    uretimKayitlari: UretimKaydi[];
    openAlerts: OpenAlert[];
    /** Raporlama para birimi (company_settings.currency, default USD). */
    reporting: string;
    /** Döviz kurları (/api/exchange-rates); null → TRY=1, diğerleri dönüştürülmez. */
    rates: ExchangeRates | null;
}

export interface KpiPerms {
    canViewSalesPrices: boolean;
    canViewFinancialSummary: boolean;
}

/**
 * 6 KPI: Aylık Ciro · Açık Siparişler · Stok Değeri · Bugünkü Üretim · Açık Alacak · Kritik Uyarılar.
 * Finansal değerler raporlama para birimine normalize + RBAC ile maskeli.
 */
export function buildKpis(input: KpiInput, perms: KpiPerms, now: Date = new Date()): DashboardKpi[] {
    const { products, orders, uretimKayitlari, openAlerts, reporting, rates } = input;
    const canPrices = perms.canViewSalesPrices;
    const canFin = perms.canViewFinancialSummary;

    // ── Aylık Ciro ──
    const revenue = monthlyRevenueReporting(orders, reporting, rates, now);
    const ordersByMonth = monthlyOrderCounts(orders, now);
    const thisRev = revenue[11] ?? 0;
    const prevRev = revenue[10] ?? 0;
    let revDelta: string | undefined;
    let revUp: boolean | undefined;
    if (prevRev > 0) {
        const pct = ((thisRev - prevRev) / prevRev) * 100;
        revDelta = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
        revUp = pct >= 0;
    }

    // ── Açık Siparişler ──
    const open = orders.filter(isOpenOrder);
    const pending = orders.filter((o) => o.commercial_status === "pending_approval").length;
    const openVal = openOrdersValueReporting(orders, reporting, rates);

    // ── Stok Değeri ──
    const stockVal = stockValueReporting(products, reporting, rates);
    const availVal = availableStockValueReporting(products, reporting, rates);
    const activeCount = products.filter((p) => p.isActive).length;

    // ── Bugünkü Üretim ──
    const prod = todayProduction(uretimKayitlari, now);
    const prodSpark = lastNProductionTotals(uretimKayitlari, 6);

    // ── Açık Alacak ──
    const recv = receivablesAging(orders, reporting, rates, now);

    // ── Kritik Uyarılar ──
    const critical = openAlerts.length;
    const urgent = openAlerts.filter((a) => a.severity === "critical").length;
    const stockAlerts = openAlerts.filter((a) => a.type === "stock_risk" || a.type === "stock_critical").length;

    return [
        {
            id: "ciro",
            label: "Aylık Ciro",
            value: formatReportingM(thisRev, reporting, canPrices),
            tone: "accent",
            sub: `${MONTH_ABBR_TR[now.getMonth()]} ayı`,
            delta: revDelta,
            up: revUp,
            spark: canPrices ? revenue.slice(-6) : undefined,
        },
        {
            id: "siparis",
            label: "Açık Siparişler",
            value: formatNumber(open.length),
            tone: "accent",
            sub: `${formatReportingCompact(openVal, reporting, canPrices)} değerinde`,
            delta: pending > 0 ? `${pending} onay bekliyor` : undefined,
            up: true,
            spark: ordersByMonth.slice(-6),
        },
        {
            id: "stok",
            label: "Stok Değeri",
            value: formatReportingM(stockVal, reporting, canPrices),
            tone: "success",
            sub: canPrices ? `Satılabilir ${formatReportingCompact(availVal, reporting, true)}` : `${formatNumber(activeCount)} aktif ürün`,
            delta: `${formatNumber(activeCount)} aktif ürün`,
            up: true,
        },
        {
            id: "uretim",
            label: "Bugünkü Üretim",
            value: prod.qty > 0 ? `${formatNumber(prod.qty)} adet` : "—",
            tone: "success",
            sub: prod.types > 0 ? `${prod.types} ürün türü` : "Henüz giriş yok",
            up: prod.qty > 0,
            spark: prodSpark.length > 0 ? prodSpark : undefined,
        },
        {
            id: "tahsilat",
            label: "Açık Alacak",
            value: formatReportingM(recv.total, reporting, canFin),
            tone: recv.total > 0 ? "warning" : "success",
            sub: canFin
                ? (recv.overdue60 > 0 ? `${formatReportingCompact(recv.overdue60, reporting, true)} (60+ gün)` : "Vadeler temiz")
                : "Görüntüleme yetkisi yok",
            delta: canFin && recv.total > 0 ? `%${recv.overduePct} vadesi geçmiş` : undefined,
            up: recv.overduePct < 20,
        },
        {
            id: "uyari",
            label: "Kritik Uyarılar",
            value: String(critical),
            tone: critical > 0 ? "danger" : "success",
            sub: critical > 0 ? `${stockAlerts} stok · ${critical - stockAlerts} diğer` : "Acil uyarı yok",
            delta: urgent > 0 ? `${urgent} acil` : undefined,
            up: false,
        },
    ];
}
