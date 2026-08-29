/**
 * Developer Console — etiketler ve biçimlendiriciler (bileşen DEĞİL).
 *
 * `ConsoleWidgets.tsx`'ten ayrıldı: React Fast Refresh yalnız SADECE bileşen
 * export eden dosyalarda çalışır; aynı dosyada sabit/fonksiyon export'u
 * geliştirmede tüm modülün yeniden yüklenmesine yol açar. Repoda emsali
 * `lib/pagination-helpers.ts` (Pagination.tsx'ten aynı gerekçeyle ayrılmıştı).
 */
import type { HealthStatus } from "@/lib/telemetry/health";
import type { TelemetrySeverity } from "@/lib/database.types";

export const SEVERITY_LABELS: Record<TelemetrySeverity, string> = {
    info: "Bilgi",
    warning: "Uyarı",
    error: "Hata",
    critical: "Kritik",
};

export const HEALTH_LABELS: Record<HealthStatus, string> = {
    healthy: "Sağlıklı",
    degraded: "Bozulmuş",
    critical: "Kritik",
    unknown: "Bilinmiyor",
};

// ── Biçimlendiriciler ────────────────────────────────────────────────────

const DATE_TIME = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "medium" });
const TIME_ONLY = new Intl.DateTimeFormat("tr-TR", { timeStyle: "medium" });

export function formatDateTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const t = Date.parse(iso);
    return Number.isNaN(t) ? "—" : DATE_TIME.format(t);
}

export function formatTime(iso: string | null | undefined): string {
    if (!iso) return "—";
    const t = Date.parse(iso);
    return Number.isNaN(t) ? "—" : TIME_ONLY.format(t);
}

/** "3 dk önce" — tazelik tarihten daha hızlı okunur. */
export function formatRelative(iso: string | null | undefined, now = Date.now()): string {
    if (!iso) return "—";
    const t = Date.parse(iso);
    if (Number.isNaN(t)) return "—";
    const diff = Math.max(0, now - t);
    const minutes = Math.floor(diff / 60_000);
    if (minutes < 1) return "az önce";
    if (minutes < 60) return `${minutes} dk önce`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} sa önce`;
    return `${Math.floor(hours / 24)} gün önce`;
}

export function formatMs(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
    return ms >= 1_000 ? `${(ms / 1_000).toFixed(2)} sn` : `${Math.round(ms)} ms`;
}

export function formatPercent(rate: number | null | undefined): string {
    if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
    return `%${(rate * 100).toFixed(1)}`;
}

/** Yavaş uçları göze çarpar yapmak için ton eşiği. */
export function latencyTone(ms: number | null): "default" | "warning" | "danger" {
    if (ms === null) return "default";
    if (ms >= 1_500) return "danger";
    if (ms >= 600) return "warning";
    return "default";
}
