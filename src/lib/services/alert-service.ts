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
import { computeCoverageDays, buildStockAlertDescription, type StockRiskInputs } from "@/lib/stock-utils";

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
        const dailyUsage = product.daily_usage ?? null;
        const leadTimeDays = product.lead_time_days ?? null;
        const coverageDays = computeCoverageDays(available, dailyUsage);
        const riskInputs: StockRiskInputs = { available, min, dailyUsage, coverageDays, leadTimeDays, unit: product.unit };

        if (isCritical) {
            // Resolve any existing warning for this product (escalate)
            resolved += await dbResolveAlertsForEntity("stock_risk", entityId, "escalated_to_critical");

            const exists = await dbOpenAlertExists("stock_critical", entityId);
            if (!exists) {
                await dbCreateAlert({
                    type: "stock_critical",
                    severity: "critical",
                    title: `Kritik Stok: ${product.name}`,
                    description: buildStockAlertDescription(riskInputs, "critical"),
                    entity_type: "product",
                    entity_id: entityId,
                    ai_inputs_summary: { available, min, dailyUsage, coverageDays, leadTimeDays, unit: product.unit },
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
                    description: buildStockAlertDescription(riskInputs, "warning"),
                    entity_type: "product",
                    entity_id: entityId,
                    ai_inputs_summary: { available, min, dailyUsage, coverageDays, leadTimeDays, unit: product.unit },
                });
                created++;
            }
        } else {
            // Stock is healthy — resolve any open stock alerts
            const r1 = await dbResolveAlertsForEntity("stock_critical", entityId);
            const r2 = await dbResolveAlertsForEntity("stock_risk", entityId);
            resolved += r1 + r2;
        }

        // Order shortage: reserved stock exceeds available — active orders at risk
        const reserved = product.reserved ?? 0;
        if (reserved > 0 && available < reserved) {
            const shortageExists = await dbOpenAlertExists("order_shortage", entityId);
            if (!shortageExists) {
                const shortfall = reserved - available;
                await dbCreateAlert({
                    type: "order_shortage",
                    severity: "critical",
                    title: `Sipariş Eksik: ${product.name}`,
                    description: `${reserved} ${product.unit} rezerve edilmiş, ancak sadece ${available} ${product.unit} mevcut. ${shortfall} ${product.unit} eksik.`,
                    entity_type: "product",
                    entity_id: entityId,
                });
                created++;
            }
        } else if (reserved > 0 && available >= reserved) {
            // Shortage resolved
            resolved += await dbResolveAlertsForEntity("order_shortage", entityId, "stock_recovered");
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
