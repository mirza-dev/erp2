/**
 * Alert Service — stock scan + alert lifecycle.
 * Follows domain-rules.md §6 (critical/warning rules) + §12 (alert lifecycle).
 */

import { dbListProducts } from "@/lib/supabase/products";
import {
    dbListAlerts,
    dbGetAlertById,
    dbOpenAlertExists,
    dbCreateAlert,
    dbUpdateAlertStatus,
    dbResolveAlertsForEntity,
    type ListAlertsFilter,
} from "@/lib/supabase/alerts";
import type { AlertStatus } from "@/lib/database.types";

// ── Lifecycle transitions (domain-rules §12.3) ───────────────

const ALERT_TRANSITIONS: Record<AlertStatus, AlertStatus[]> = {
    open:         ["acknowledged", "resolved", "dismissed"],
    acknowledged: ["resolved", "dismissed"],
    resolved:     [],
    dismissed:    [],
};

function isValidAlertTransition(from: AlertStatus, to: AlertStatus): boolean {
    return ALERT_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Stock Scan ───────────────────────────────────────────────

export interface ScanResult {
    scanned: number;
    created: number;
    resolved: number;
}

/**
 * Scans all active products and creates/resolves alerts based on stock levels.
 * domain-rules §6.1:
 *   critical: available_now <= min_stock_level
 *   warning:  available_now > min_stock_level AND available_now <= min_stock_level * 1.5
 */
export async function serviceScanStockAlerts(): Promise<ScanResult> {
    const products = await dbListProducts({ is_active: true, pageSize: 500 });

    let created = 0;
    let resolved = 0;

    for (const product of products) {
        const available = product.available_now;
        const min = product.min_stock_level;
        const isCritical = available <= min;
        const isWarning  = !isCritical && available <= Math.ceil(min * 1.5);

        const entityId = product.id;

        if (isCritical) {
            // Resolve any existing warning for this product (escalate)
            resolved += await dbResolveAlertsForEntity("stock_risk", entityId, "escalated_to_critical");

            const exists = await dbOpenAlertExists("stock_critical", entityId);
            if (!exists) {
                await dbCreateAlert({
                    type: "stock_critical",
                    severity: "critical",
                    title: `Kritik Stok: ${product.name}`,
                    description: `Mevcut stok (${available} ${product.unit}) minimum seviye (${min} ${product.unit}) altında.`,
                    entity_type: "product",
                    entity_id: entityId,
                });
                created++;
            }
        } else if (isWarning) {
            const exists = await dbOpenAlertExists("stock_risk", entityId);
            if (!exists) {
                await dbCreateAlert({
                    type: "stock_risk",
                    severity: "warning",
                    title: `Stok Uyarısı: ${product.name}`,
                    description: `Mevcut stok (${available} ${product.unit}) minimum seviyenin %150'sine (${Math.ceil(min * 1.5)} ${product.unit}) yaklaşıyor.`,
                    entity_type: "product",
                    entity_id: entityId,
                });
                created++;
            }
        } else {
            // Stock is healthy — resolve any open stock alerts
            const r1 = await dbResolveAlertsForEntity("stock_critical", entityId);
            const r2 = await dbResolveAlertsForEntity("stock_risk", entityId);
            resolved += r1 + r2;
        }
    }

    return { scanned: products.length, created, resolved };
}

// ── Alert CRUD ───────────────────────────────────────────────

export async function serviceListAlerts(filter: ListAlertsFilter = {}) {
    return dbListAlerts(filter);
}

export async function serviceGetAlert(id: string) {
    return dbGetAlertById(id);
}

export interface UpdateAlertStatusResult {
    success: boolean;
    error?: string;
}

export async function serviceUpdateAlertStatus(
    id: string,
    newStatus: AlertStatus,
    reason?: string
): Promise<UpdateAlertStatusResult> {
    const alert = await dbGetAlertById(id);
    if (!alert) return { success: false, error: "Alert bulunamadı." };

    if (!isValidAlertTransition(alert.status, newStatus)) {
        return { success: false, error: `'${alert.status}' durumundan '${newStatus}' durumuna geçilemez.` };
    }

    await dbUpdateAlertStatus(id, newStatus, reason);
    return { success: true };
}
