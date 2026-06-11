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
 * Kur çözülemiyorsa 0 döner = tutar toplamların DIŞINDA kalır. Eski davranış
 * tutarı "değişmeden geçirmek"ti — TRY'yi USD toplamına ham eklemek 40 kat
 * hata üretiyordu; eksik-ama-dürüst rakam tercih edildi. Hariç kalan para
 * birimleri `listUnconvertibleCurrencies` ile tespit edilip UI'da uyarılır.
 */
export function toReporting(
    amount: number, fromCur: string, reporting: string, rates: ExchangeRates | null,
): number {
    if (!Number.isFinite(amount)) return 0;
    if (fromCur === reporting) return amount;
    const from = midRate(rates, fromCur);
    const to = midRate(rates, reporting);
    if (from === null || to === null) return 0;
    return (amount * from) / to;
}

/** `cur` cinsinden tutar raporlama para birimine çevrilebiliyor mu? */
export function canConvert(cur: string, reporting: string, rates: ExchangeRates | null): boolean {
    if (cur === reporting) return true;
    return midRate(rates, cur) !== null && midRate(rates, reporting) !== null;
}

/**
 * Toplamlardan hariç kalan (kur çözülemeyen) para birimleri — KPI şeridi
 * altındaki uyarı satırı için. Sıralı + tekrarsız.
 */
export function listUnconvertibleCurrencies(
    currencies: Iterable<string>, reporting: string, rates: ExchangeRates | null,
): string[] {
    const out = new Set<string>();
    for (const c of currencies) {
        if (c && !canConvert(c, reporting, rates)) out.add(c);
    }
    return [...out].sort();
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

/**
 * Ciroya sayılan sipariş mi? YALNIZ onaylı (approved).
 * pending_approval bilinçli HARİÇ: mig.088'den beri gönderilen her teklif
 * pending sipariş yaratır — kabul edilmemiş teklif ciroya sayılmamalı.
 * Onaylanınca (teklif kabulü dahil) ciroya girer.
 */
function isRevenueOrder(o: Order): boolean {
    return o.commercial_status === "approved";
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

// ════════════════════════════════════════════════════════════════
//  Dönem modeli (Bugün / Hafta / Ay / Çeyrek) — segment filtresi
// ════════════════════════════════════════════════════════════════

export type RangeKey = "Bugün" | "Hafta" | "Ay" | "Çeyrek";

/**
 * Seçili dönemin kova (bucket) modeli. Saf — UI yalnız tüketir.
 * `indexOf` bir tarihi kovaya eşler (aralık dışı → null); `currentIndex` = güncel dönem.
 * `monthAligned` yalnız Ay/Çeyrek'te true → COGS (aylık RPC) yalnız bunlarda kovalanabilir.
 */
export interface PeriodModel {
    range: RangeKey;
    labels: string[];
    bucketCount: number;
    indexOf: (iso: string) => number | null;
    currentIndex: number;
    prevIndex: number;
    monthAligned: boolean;
    /** KPI ön-eki: "Aylık" / "Çeyreklik" / "Haftalık" / "Günlük". */
    kpiLabel: string;
    /** Güncel dönem etiketi (Ciro KPI alt-yazısı + finans paneli). */
    currentLabel: string;
    /** Üretim KPI etiketi ("Bugünkü / Bu Hafta / Bu Ay / Bu Çeyrek Üretim"). */
    prodLabel: string;
    /** Trend paneli alt-yazısı ("Son 12 ay" vb.). */
    trendSub: string;
}

/** Yerel gün başlangıcı (00:00). */
function startOfDay(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
/** ISO/tarih dizesinin tarih kısmından (slice 0–10) yerel gün. TZ-tutarlı (monthKey ile aynı disiplin). */
function dateOnly(iso: string): Date {
    return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}
/** now gün başlangıcı ile iso günü arasındaki tam gün farkı (geçmiş → pozitif). */
function daysAgo(now: Date, iso: string): number {
    return Math.floor((startOfDay(now).getTime() - dateOnly(iso).getTime()) / 86_400_000);
}
function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Seçili aralık için dönem modeli üretir (saf). */
export function periodModel(range: RangeKey, now: Date = new Date()): PeriodModel {
    if (range === "Çeyrek") {
        const qCur = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
        const base = qCur - 3;
        const labels: string[] = [];
        for (let pos = 0; pos < 4; pos++) {
            const qi = base + pos;
            labels.push(`Ç${(qi % 4) + 1}'${String(Math.floor(qi / 4)).slice(2)}`);
        }
        return {
            range, labels, bucketCount: 4, currentIndex: 3, prevIndex: 2, monthAligned: true,
            kpiLabel: "Çeyreklik", currentLabel: labels[3], prodLabel: "Bu Çeyrek Üretim", trendSub: "Son 4 çeyrek",
            indexOf: (iso) => {
                const qi = Number(iso.slice(0, 4)) * 4 + Math.floor((Number(iso.slice(5, 7)) - 1) / 3);
                const pos = qi - base;
                return pos >= 0 && pos <= 3 ? pos : null;
            },
        };
    }
    if (range === "Hafta") {
        const today = startOfDay(now);
        const labels: string[] = [];
        for (let pos = 0; pos < 12; pos++) {
            const start = addDays(today, -((11 - pos) * 7 + 6));
            labels.push(`${start.getDate()} ${MONTH_ABBR_TR[start.getMonth()]}`);
        }
        return {
            range, labels, bucketCount: 12, currentIndex: 11, prevIndex: 10, monthAligned: false,
            kpiLabel: "Haftalık", currentLabel: `${labels[11]} haftası`, prodLabel: "Bu Hafta Üretim", trendSub: "Son 12 hafta",
            indexOf: (iso) => {
                const pos = 11 - Math.floor(daysAgo(now, iso) / 7);
                return pos >= 0 && pos <= 11 ? pos : null;
            },
        };
    }
    if (range === "Bugün") {
        const today = startOfDay(now);
        const labels: string[] = [];
        for (let pos = 0; pos < 14; pos++) labels.push(String(addDays(today, -(13 - pos)).getDate()));
        return {
            range, labels, bucketCount: 14, currentIndex: 13, prevIndex: 12, monthAligned: false,
            kpiLabel: "Günlük", currentLabel: "bugün", prodLabel: "Bugünkü Üretim", trendSub: "Son 14 gün",
            indexOf: (iso) => {
                const pos = 13 - daysAgo(now, iso);
                return pos >= 0 && pos <= 13 ? pos : null;
            },
        };
    }
    // Ay (varsayılan) — mevcut 12-ay davranışı.
    const keys = last12MonthKeys(now);
    const idx = new Map(keys.map((k, i) => [k, i]));
    return {
        range: "Ay", labels: monthLabels(now), bucketCount: 12, currentIndex: 11, prevIndex: 10, monthAligned: true,
        kpiLabel: "Aylık", currentLabel: `${MONTH_ABBR_TR[now.getMonth()]} ayı`, prodLabel: "Bu Ay Üretim", trendSub: "Son 12 ay",
        indexOf: (iso) => {
            const v = idx.get(iso.slice(0, 7));
            return v === undefined ? null : v;
        },
    };
}

/** Dönem bazında ciro (raporlama para birimi). `monthlyRevenueReporting` genellemesi. */
export function revenueByPeriod(
    orders: Order[], reporting: string, rates: ExchangeRates | null, period: PeriodModel,
): number[] {
    const out = new Array(period.bucketCount).fill(0);
    for (const o of orders) {
        if (!isRevenueOrder(o)) continue;
        const i = period.indexOf(o.createdAt);
        if (i !== null) out[i] += toReporting(o.grandTotal, o.currency, reporting, rates);
    }
    return out;
}

/** Dönem bazında sipariş adedi (boş-durum tespiti + trend tooltip'i). */
export function orderCountsByPeriod(orders: Order[], period: PeriodModel): number[] {
    const out = new Array(period.bucketCount).fill(0);
    for (const o of orders) {
        if (!isRevenueOrder(o)) continue;
        const i = period.indexOf(o.createdAt);
        if (i !== null) out[i] += 1;
    }
    return out;
}

/**
 * Dönem bazında COGS (raporlama para birimi) — yalnız `monthAligned` (Ay/Çeyrek).
 * Hafta/Bugün → null (aylık RPC günlük/haftalık kovalanamaz; maliyet hattı gizlenir).
 * COGS satır anahtarı `YYYY-MM` → `-01` ile gün verilir (indexOf slice/quarter ile eşler).
 */
export function cogsByPeriod(
    rows: CogsRow[], reporting: string, rates: ExchangeRates | null, period: PeriodModel,
): number[] | null {
    if (!period.monthAligned) return null;
    const out = new Array(period.bucketCount).fill(0);
    for (const r of rows) {
        const i = period.indexOf(`${r.month}-01`);
        if (i !== null) out[i] += toReporting(r.cogs, r.currency, reporting, rates);
    }
    return out;
}

/**
 * GÜNCEL dönem üretimi: toplam adet + ürün türü sayısı (Üretim KPI).
 * Yalnız `currentIndex` kovası sayılır (tüm pencere değil) — etiket "Bu Ay/Bugünkü" ile tutarlı,
 * Ciro KPI'ın `revenue[currentIndex]` davranışını aynalar.
 */
export function productionInPeriod(
    uretim: UretimKaydi[], period: PeriodModel,
): { qty: number; types: number } {
    let qty = 0;
    const types = new Set<string>();
    for (const u of uretim) {
        if (period.indexOf(u.tarih) !== period.currentIndex) continue;
        qty += u.adet;
        types.add(u.productId);
    }
    return { qty, types: types.size };
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
//  Teklif Hattı + Yoldaki Mal (KPI kartları — birinci elden veri, proxy yok)
// ════════════════════════════════════════════════════════════════

/** /api/quotes özetinden kartın ihtiyaç duyduğu alt küme (RBAC: grandTotal null olabilir). */
export interface QuotePipelineInput {
    status: string;
    currency: string;
    grandTotal: number | null;
    validUntil: string | null;
}

export interface QuotePipelineView {
    count: number;
    totalReporting: number;
    /** RBAC redaction: en az bir satırda tutar null → toplam gösterilmez. */
    redacted: boolean;
    /** Geçerliliği bugünden itibaren 7 gün içinde dolan sent teklif sayısı. */
    expiring7d: number;
}

/** `iso` (YYYY-MM-DD) + n gün → YYYY-MM-DD (yerel, string-karşılaştırma disipliniyle uyumlu). */
function addDaysStr(iso: string, n: number): string {
    const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)) + n);
    return localDateKey(d);
}

/**
 * Bekleyen teklif hattı: yalnız `sent` teklifler. Ciro yalnız-approved olduğundan
 * bu kart pipeline değerini DÜRÜST etiketle ayrı gösterir (ciroya karışmaz).
 * Tarihler domain kuralıyla string karşılaştırılır (saat kayması yok).
 */
export function quotePipelineView(
    quotes: QuotePipelineInput[], reporting: string, rates: ExchangeRates | null, todayStr: string,
): QuotePipelineView {
    const horizon = addDaysStr(todayStr, 7);
    let count = 0, total = 0, expiring = 0;
    let redacted = false;
    for (const q of quotes) {
        if (q.status !== "sent") continue;
        count++;
        if (q.grandTotal === null) redacted = true;
        else total += toReporting(q.grandTotal, q.currency, reporting, rates);
        if (q.validUntil && q.validUntil >= todayStr && q.validUntil <= horizon) expiring++;
    }
    return { count, totalReporting: total, redacted, expiring7d: expiring };
}

/** /api/purchase-orders satırından kartın alt kümesi (RBAC: grand_total null olabilir). */
export interface IncomingPoInput {
    status: string;
    currency: string;
    grand_total: number | null;
    expected_date: string | null;
}

export interface IncomingPoView {
    count: number;
    totalReporting: number;
    redacted: boolean;
    /** Beklenen teslim tarihi geçmiş açık PO sayısı. */
    overdueCount: number;
}

/** Yoldaki mal: açık PO'lar (sent/confirmed/partially_received) — beklenen mal değeri. */
export function incomingPoView(
    pos: IncomingPoInput[], reporting: string, rates: ExchangeRates | null, todayStr: string,
): IncomingPoView {
    let count = 0, total = 0, overdue = 0;
    let redacted = false;
    for (const po of pos) {
        if (po.status !== "sent" && po.status !== "confirmed" && po.status !== "partially_received") continue;
        count++;
        if (po.grand_total === null) redacted = true;
        else total += toReporting(po.grand_total, po.currency, reporting, rates);
        if (po.expected_date && po.expected_date < todayStr) overdue++;
    }
    return { count, totalReporting: total, redacted, overdueCount: overdue };
}

// NOT: receivablesAging (Açık Alacak) kullanıcı kararıyla KALDIRILDI.
// Siparişten türev proxy idi (createdAt+30g sabit vade, 90g pencere, ödeme
// düşülmez) — güvenilir değildi. Gerçek alacak istenirse `invoices`/`payments`
// tablolarından (lib/supabase/invoices.ts, payments.ts — mevcut, UI okumuyor)
// yeniden yazılmalı.

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
    /** Alt satır vurgu rengi (warning/danger) — sakin şeritte tek aciliyet sinyali. */
    subTone?: Tone;
    delta?: string;
    up?: boolean;
    spark?: number[];
    /** Kart tıklanınca gidilecek sayfa (KpiCard Link'e çevirir). */
    href?: string;
}

export interface KpiInput {
    products: Product[];
    orders: Order[];
    uretimKayitlari: UretimKaydi[];
    openAlerts: OpenAlert[];
    /** Raporlama para birimi (company_settings.currency, default USD). */
    reporting: string;
    /** Döviz kurları (/api/exchange-rates); null → yalnız raporlama parası toplanır. */
    rates: ExchangeRates | null;
    /** Bekleyen teklifler (/api/quotes). null/undefined = kart üretilmez (fetch yok/başarısız). */
    quotes?: QuotePipelineInput[] | null;
    /** Açık satın alma siparişleri (/api/purchase-orders). null/undefined = kart üretilmez (403 dahil). */
    purchaseOrders?: IncomingPoInput[] | null;
}

export interface KpiPerms {
    canViewSalesPrices: boolean;
}

/**
 * 5 KPI: Dönem Ciro · Açık Siparişler · Stok Değeri · Dönem Üretim · Açık Uyarılar.
 * Finansal değerler raporlama para birimine normalize + RBAC ile maskeli.
 * (Açık Alacak kartı kaldırıldı — yukarıdaki receivablesAging notu.)
 */
export function buildKpis(
    input: KpiInput, perms: KpiPerms, now: Date = new Date(), period: PeriodModel = periodModel("Ay", now),
): DashboardKpi[] {
    const { products, orders, uretimKayitlari, openAlerts, reporting, rates } = input;
    const canPrices = perms.canViewSalesPrices;

    // ── Dönem Ciro (Aylık/Çeyreklik/Haftalık/Günlük) ──
    const revenue = revenueByPeriod(orders, reporting, rates, period);
    const counts = orderCountsByPeriod(orders, period);
    const thisRev = revenue[period.currentIndex] ?? 0;
    const prevRev = revenue[period.prevIndex] ?? 0;
    const ciroEmpty = (counts[period.currentIndex] ?? 0) === 0;
    let revDelta: string | undefined;
    let revUp: boolean | undefined;
    if (!ciroEmpty && prevRev > 0) {
        const pct = ((thisRev - prevRev) / prevRev) * 100;
        revDelta = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
        revUp = pct >= 0;
    }

    // ── Açık Siparişler (anlık) ──
    const open = orders.filter(isOpenOrder);
    const pending = orders.filter((o) => o.commercial_status === "pending_approval").length;
    const openVal = openOrdersValueReporting(orders, reporting, rates);

    // ── Stok Değeri (anlık) ──
    const stockVal = stockValueReporting(products, reporting, rates);
    const availVal = availableStockValueReporting(products, reporting, rates);
    const activeCount = products.filter((p) => p.isActive).length;

    // ── Dönem Üretim ──
    const prod = productionInPeriod(uretimKayitlari, period);
    const prodSpark = lastNProductionTotals(uretimKayitlari, 6);

    // ── Açık Uyarılar ──
    const critical = openAlerts.length;
    const urgent = openAlerts.filter((a) => a.severity === "critical").length;
    const stockAlerts = openAlerts.filter((a) => a.type === "stock_risk" || a.type === "stock_critical").length;

    const todayStr = localDateKey(now);

    // ── Teklif Hattı / Yoldaki Mal — veri verilmemişse (yetki yok / fetch
    // başarısız) kart hiç üretilmez; şerit fail-soft daralır. ──
    const kpis: DashboardKpi[] = [];

    kpis.push(
        {
            id: "ciro",
            label: `${period.kpiLabel} Ciro`,
            value: ciroEmpty ? "—" : formatReportingCompact(thisRev, reporting, canPrices),
            tone: "accent",
            sub: ciroEmpty ? "Bu dönemde sipariş yok" : period.currentLabel,
            delta: revDelta,
            up: revUp,
            spark: canPrices && !ciroEmpty ? revenue.slice(-6) : undefined,
            href: "/dashboard/orders",
        },
        {
            id: "siparis",
            label: "Açık Siparişler",
            value: formatNumber(open.length),
            tone: "accent",
            sub: `${formatReportingCompact(openVal, reporting, canPrices)} değerinde · anlık`,
            delta: pending > 0 ? `${pending} onay bekliyor` : undefined,
            up: true,
            spark: counts.slice(-6),
            href: "/dashboard/orders",
        },
    );

    if (input.quotes != null) {
        const pipe = quotePipelineView(input.quotes, reporting, rates, todayStr);
        kpis.push({
            id: "teklif",
            label: "Teklif Hattı",
            // Ciro yalnız-approved → pipeline değeri burada dürüst etiketle ayrı.
            value: pipe.count === 0
                ? "—"
                : formatReportingCompact(pipe.totalReporting, reporting, canPrices && !pipe.redacted),
            tone: "accent",
            sub: pipe.count === 0
                ? "Yanıt bekleyen teklif yok · anlık"
                : pipe.expiring7d > 0
                    ? `${pipe.expiring7d} tanesi 7 gün içinde doluyor`
                    : "Yanıt bekleyen teklifler · anlık",
            subTone: pipe.expiring7d > 0 ? "warning" : undefined,
            delta: pipe.count > 0 ? `${pipe.count} teklif` : undefined,
            up: true,
            href: "/dashboard/quotes",
        });
    }

    kpis.push({
        id: "stok",
        label: "Stok Değeri",
        value: formatReportingCompact(stockVal, reporting, canPrices),
        tone: "success",
        sub: canPrices ? `Satılabilir ${formatReportingCompact(availVal, reporting, true)} · anlık` : `${formatNumber(activeCount)} aktif ürün · anlık`,
        delta: `${formatNumber(activeCount)} aktif ürün`,
        up: true,
        href: "/dashboard/products",
    });

    if (input.purchaseOrders != null) {
        const incoming = incomingPoView(input.purchaseOrders, reporting, rates, todayStr);
        kpis.push({
            id: "yoldaki",
            label: "Yoldaki Mal",
            value: incoming.count === 0
                ? "—"
                : formatReportingCompact(incoming.totalReporting, reporting, canPrices && !incoming.redacted),
            tone: "accent",
            sub: incoming.count === 0
                ? "Açık satın alma yok · anlık"
                : incoming.overdueCount > 0
                    ? `${incoming.overdueCount} tanesi gecikmede`
                    : "Beklenen mal değeri · anlık",
            subTone: incoming.overdueCount > 0 ? "danger" : undefined,
            delta: incoming.count > 0 ? `${incoming.count} açık PO` : undefined,
            up: incoming.overdueCount === 0,
            href: "/dashboard/purchase/orders",
        });
    }

    kpis.push(
        {
            id: "uretim",
            label: period.prodLabel,
            value: prod.qty > 0 ? `${formatNumber(prod.qty)} adet` : "—",
            tone: "success",
            sub: prod.types > 0 ? `${prod.types} ürün türü` : "Henüz giriş yok",
            up: prod.qty > 0,
            spark: prodSpark.length > 0 ? prodSpark : undefined,
            href: "/dashboard/production",
        },
        {
            id: "uyari",
            // Değer TÜM açık+ack uyarılar (info dahil) — etiket değerle tutarlı
            // ("Kritik" yalnız delta'daki acil sayısıdır).
            label: "Açık Uyarılar",
            value: String(critical),
            tone: critical > 0 ? "danger" : "success",
            sub: critical > 0 ? `${stockAlerts} stok · ${critical - stockAlerts} diğer · anlık` : "Acil uyarı yok · anlık",
            delta: urgent > 0 ? `${urgent} acil` : undefined,
            up: false,
            href: "/dashboard/alerts",
        },
    );

    return kpis;
}
