/**
 * Pure UI helper functions for the alerts page.
 * Extracted here so they can be unit-tested without mounting the page component.
 *
 * Source of truth for order_shortage qty: the alert's description field,
 * written by alert-service.ts as "${shortageQty} ${unit} eksik — onaylı sipariş karşılanamıyor."
 */

import type { AlertRow } from "@/lib/database.types";

/**
 * Parses the shortage quantity from the first order_shortage alert's description.
 * Returns null if no such alert exists or the description doesn't start with a number.
 */
export function extractShortageQty(alerts: AlertRow[]): number | null {
    const alert = alerts.find((a) => a.type === "order_shortage");
    if (!alert?.description) return null;
    const match = alert.description.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

export function shortReason(alerts: AlertRow[]): string {
    const types = alerts.map((a) => a.type);
    if (types.includes("order_shortage"))  return "Onaylı sipariş stokla karşılanamıyor";
    if (types.includes("stock_critical"))  return "Stok kritik seviyenin altında";
    // order_deadline: geçmişse kritik, yaklaşıyorsa uyarı — mevcut severity'den oku
    const deadlineAlert = alerts.find((a) => a.type === "order_deadline");
    if (deadlineAlert) {
        return deadlineAlert.severity === "critical"
            ? "Sipariş son tarihi geçti"
            : "Sipariş son tarihi yaklaşıyor";
    }
    if (types.includes("stock_risk"))      return "Stok uyarı eşiğine yaklaşıyor";
    if (types.includes("overdue_shipment")) return "Planlanan sevk tarihi geçti";
    return "Stok riski tespit edildi";
}

export function shortImpact(
    alerts: AlertRow[],
    available: number,
    _reserved: number,
    unit: string,
    covDays: number | null
): string {
    const hasShortage = alerts.some((a) => a.type === "order_shortage");
    if (hasShortage) {
        const qty = extractShortageQty(alerts);
        return qty !== null ? `${qty} ${unit} eksik` : `${unit} eksik`;
    }
    if (available === 0) return "Stok tükendi";
    if (covDays !== null && covDays <= 14) return `~${covDays} günlük stok`;
    return `${available} ${unit} mevcut`;
}
