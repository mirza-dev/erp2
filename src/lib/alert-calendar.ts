/**
 * Pure, framework-free helpers for the Uyarılar (Alerts) calendar view.
 *
 * These functions own all calendar date math + occurrence expansion so the
 * React components stay dumb and the logic is unit-testable without mounting
 * anything. The view-model (`CalendarAlert`) is built by the page from the real
 * `AlertRow` + product/order enrichment; helpers here never touch the network.
 *
 * Date conventions:
 *  - `date` (event day) is the alert's `created_at` ISO timestamp.
 *  - `dueDate` is a date-only `YYYY-MM-DD` string (order target) or null.
 *  - Day bucketing is done in LOCAL time (operator's calendar), matching the
 *    prototype which compared `getFullYear/Month/Date`.
 */

import type { AlertType, AlertSeverity, AlertStatus } from "@/lib/database.types";

// ── Türkçe takvim etiketleri ────────────────────────────────────────────────
export const MONTH_NAMES_TR = [
    "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
    "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];
// Pazartesi-başlangıçlı (takvim ızgarası Pzt..Paz)
export const DAY_NAMES_TR = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];
export const DAY_NAMES_FULL_TR = [
    "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar",
];

// ── Severity görsel eşlemesi (CSS değişkenleri — otomatik temalanır) ─────────
export interface SeverityStyle {
    label: string;
    color: string;
    text: string;
    bg: string;
    border: string;
}
export const SEVERITY_CONFIG: Record<AlertSeverity, SeverityStyle> = {
    critical: { label: "KRİTİK", color: "var(--danger)",  text: "var(--danger-text)",  bg: "var(--danger-bg)",  border: "var(--danger-border)" },
    warning:  { label: "UYARI",  color: "var(--warning)", text: "var(--warning-text)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
    info:     { label: "BİLGİ",  color: "var(--accent)",  text: "var(--accent-text)",  bg: "var(--accent-bg)",  border: "var(--accent-border)" },
};

const SEV_ORDER: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };

// ── Sınıflandırma sekmeleri (filtre kategorileri) ────────────────────────────
export interface AlertClass {
    id: string;
    label: string;
    types: AlertType[] | null; // null = tüm tipler
    icon: string;
}
export const ALERT_CLASSES: AlertClass[] = [
    { id: "all",      label: "Tümü",              types: null,                                     icon: "⊞" },
    { id: "stock",    label: "Stok",              types: ["stock_critical", "stock_risk"],          icon: "◉" },
    { id: "order",    label: "Sipariş",           types: ["order_shortage", "order_deadline"],      icon: "◈" },
    { id: "shipment", label: "Sevkiyat & Teklif", types: ["overdue_shipment", "quote_expired"],     icon: "◇" },
    { id: "system",   label: "Sistem",            types: ["sync_issue"],                            icon: "⚙" },
    { id: "ai",       label: "AI Öneriler",       types: ["purchase_recommended"],                  icon: "✦" },
];

// ── Görünüm modeli ───────────────────────────────────────────────────────────
export interface CalendarProduct {
    name: string;
    sku: string;
    available: number;
    minStock: number;
    reserved: number;
    unit: string;
    coverageDays: number | null;
}

export interface CalendarAlert {
    id: string;
    type: AlertType;
    severity: AlertSeverity;
    status: AlertStatus;
    title: string;
    reason: string;
    impact: string;
    /** ISO timestamp — olay (tespit) günü kaynağı. */
    date: string;
    /** "HH:MM" yerel saat (created_at'tan türetilir). */
    time: string;
    /** resolution_reason (geçmiş/çözülen olaylarda). */
    resolution: string | null;
    /** Hedef/teslim tarihi — "YYYY-MM-DD" ya da null. */
    dueDate: string | null;
    dueLabel: string | null;
    /** Sipariş/teklif kodu (order entity) ya da null. */
    orderCode: string | null;
    entityId: string | null;
    entityType: string | null;
    product: CalendarProduct | null;
    source: string | null;
    aiConfidence: number | null;
    aiReason: string | null;
    aiModelVersion: string | null;
}

export type OccurrenceKind = "event" | "due";
export interface Occurrence extends CalendarAlert {
    /** Bu oluşumun düştüğü gün: event=date, due=dueDate. */
    occDate: string;
    occKind: OccurrenceKind;
}

// ── Tarih yardımcıları ───────────────────────────────────────────────────────

/** "HH:MM" → dakika; geçersiz/boş → 0. */
export function parseTimeMinutes(t: string | null | undefined): number {
    if (!t || typeof t !== "string") return 0;
    const [h, m] = t.split(":").map((x) => parseInt(x, 10));
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/** created_at ISO timestamp → yerel "HH:MM". Geçersiz → "". */
export function timeFromISO(iso: string | null | undefined): string {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

/**
 * ISO timestamp veya "YYYY-MM-DD" → yerel Date (gün kovalama için).
 * Date-only stringler yerel gece-yarısı olarak yorumlanır (UTC kayması yok).
 */
export function toLocalDate(value: string): Date {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split("-").map((x) => parseInt(x, 10));
        return new Date(y, m - 1, d);
    }
    return new Date(value);
}

export function isSameDate(a: Date, b: Date): boolean {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}

export function isToday(date: Date, now: Date = new Date()): boolean {
    return isSameDate(date, now);
}

/** "1 Haziran" */
export function formatDateShort(date: Date): string {
    return `${date.getDate()} ${MONTH_NAMES_TR[date.getMonth()]}`;
}

/** "1 Haziran, Pazartesi" (gün adı Pzt-bazlı dizine göre). */
export function formatDateFull(date: Date): string {
    const dow = (date.getDay() + 6) % 7; // 0=Pazartesi
    return `${date.getDate()} ${MONTH_NAMES_TR[date.getMonth()]}, ${DAY_NAMES_FULL_TR[dow]}`;
}

// ── Occurrence (oluşum) mekaniği ─────────────────────────────────────────────

/**
 * Her uyarıyı tespit günü (`event`) ve — hedef tarihi varsa ve farklıysa —
 * hedef günü (`due`) olarak çoğaltır. Takvim/gün paneli bu listeyi tüketir.
 */
export function expandAlertOccurrences(alerts: CalendarAlert[]): Occurrence[] {
    const out: Occurrence[] = [];
    for (const a of alerts) {
        out.push({ ...a, occDate: a.date, occKind: "event" });
        if (a.dueDate) {
            const eventDay = toLocalDate(a.date);
            const dueDay = toLocalDate(a.dueDate);
            if (!isSameDate(eventDay, dueDay)) {
                out.push({ ...a, occDate: a.dueDate, occKind: "due" });
            }
        }
    }
    return out;
}

/** Verilen güne (yerel) düşen oluşumlar. */
export function getOccurrencesForDate(items: Occurrence[], date: Date): Occurrence[] {
    return items.filter((it) => isSameDate(toLocalDate(it.occDate), date));
}

/**
 * Hücre/panel sıralaması: önce severity (critical→info), sonra saat.
 * `due` oluşumlar saatsizdir → gün sonuna (1440 dk) sabitlenir.
 */
export function sortOccurrences(items: Occurrence[]): Occurrence[] {
    return [...items].sort((a, b) => {
        const sev = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
        if (sev !== 0) return sev;
        const am = a.occKind === "due" ? 1440 : parseTimeMinutes(a.time);
        const bm = b.occKind === "due" ? 1440 : parseTimeMinutes(b.time);
        return am - bm;
    });
}

/** Bir gün/grup içindeki en yüksek severity. */
export function topSeverity(items: { severity: AlertSeverity }[]): AlertSeverity {
    if (items.some((a) => a.severity === "critical")) return "critical";
    if (items.some((a) => a.severity === "warning")) return "warning";
    return "info";
}

// ── Ay ızgarası ──────────────────────────────────────────────────────────────
export interface MonthDay {
    date: Date;
    current: boolean; // bu aya mı ait
}

/**
 * Pazartesi-başlangıçlı ay ızgarası. Ay 5 satıra sığıyorsa 35, değilse 42 hücre;
 * önceki/sonraki ay günleriyle doldurulur (current=false).
 */
export function getMonthDays(year: number, month: number): MonthDay[] {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();
    let startDow = first.getDay() - 1; // Pazartesi=0
    if (startDow < 0) startDow = 6;

    const days: MonthDay[] = [];
    const prevLast = new Date(year, month, 0).getDate();
    for (let i = startDow - 1; i >= 0; i--) {
        days.push({ date: new Date(year, month - 1, prevLast - i), current: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
        days.push({ date: new Date(year, month, d), current: true });
    }
    const target = days.length > 35 ? 42 : 35;
    let nd = 1;
    while (days.length < target) {
        days.push({ date: new Date(year, month + 1, nd++), current: false });
    }
    return days;
}

// ── İstatistikler ────────────────────────────────────────────────────────────
export interface CalendarStats {
    total: number;
    critical: number;
    warning: number;
    resolved: number;
}

/** Açık (open+acknowledged) uyarılardan toplam/kritik/uyarı + resolved sayısı. */
export function getCalendarStats(alerts: CalendarAlert[]): CalendarStats {
    const open = alerts.filter((a) => a.status === "open" || a.status === "acknowledged");
    return {
        total: open.length,
        critical: open.filter((a) => a.severity === "critical").length,
        warning: open.filter((a) => a.severity === "warning").length,
        resolved: alerts.filter((a) => a.status === "resolved").length,
    };
}

// ── Hedef tarih geri sayım etiketi ───────────────────────────────────────────
/** "Bugün — hedef gün" / "Yarın" / "N gün sonra" / "Dün geçti" / "N gün gecikme". */
export function dueCountdownLabel(dueDate: string, now: Date = new Date()): string {
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const d = toLocalDate(dueDate);
    d.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Bugün — hedef gün";
    if (diff === 1) return "Yarın";
    if (diff > 1) return `${diff} gün sonra`;
    if (diff === -1) return "Dün geçti";
    return `${Math.abs(diff)} gün gecikme`;
}

/** DayCell/AlertCard'da gösterilecek kısa etiket. */
export function eventLabel(a: CalendarAlert): string {
    if (a.product) return a.product.name;
    if (a.orderCode) return a.orderCode;
    return (a.title || "").replace(/^[^:]*:\s*/, "") || a.type;
}
