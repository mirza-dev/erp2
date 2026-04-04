/**
 * Alert Service — stock scan + alert lifecycle.
 * Follows domain-rules.md §6 (critical/warning rules) + §12 (alert lifecycle).
 */

import { dbListProducts, dbGetOpenShortagesByProduct } from "@/lib/supabase/products";
import { dbListOrders } from "@/lib/supabase/orders";
import {
    dbListAlerts,
    dbGetAlertById,
    dbOpenAlertExists,
    dbCreateAlert,
    dbUpdateAlertStatus,
    dbResolveAlertsForEntity,
    dbDismissAlertsBySource,
    type ListAlertsFilter,
} from "@/lib/supabase/alerts";
import type { AlertStatus } from "@/lib/database.types";
import { computeCoverageDays, buildStockAlertDescription, type StockRiskInputs } from "@/lib/stock-utils";
import { isAIAvailable, aiGenerateOpsSummary, type OpsSummaryInput } from "@/lib/services/ai-service";

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
    const [products, shortageMap] = await Promise.all([
        dbListProducts({ is_active: true, pageSize: 500 }),
        dbGetOpenShortagesByProduct(),
    ]);

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

        // Order shortage: source of truth is the shortages table.
        // available_now = on_hand - reserved, so (available < reserved) ≡ (on_hand < 2*reserved)
        // which fires false positives when stock is healthy but heavily reserved.
        // Correct check: open shortage records for approved orders in the shortages table.
        const openShortageQty = shortageMap.get(product.id) ?? 0;
        if (openShortageQty > 0) {
            const shortageExists = await dbOpenAlertExists("order_shortage", entityId);
            if (!shortageExists) {
                await dbCreateAlert({
                    type: "order_shortage",
                    severity: "critical",
                    title: `Sipariş Eksik: ${product.name}`,
                    description: `${openShortageQty} ${product.unit} eksik — onaylı sipariş karşılanamıyor.`,
                    entity_type: "product",
                    entity_id: entityId,
                });
                created++;
            }
        } else {
            // No open shortages for this product — resolve any stale alert
            resolved += await dbResolveAlertsForEntity("order_shortage", entityId, "shortage_resolved");
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

// ── AI Alert Generation ─────────────────────────────────────

export interface AiAlertGenerationResult {
    ai_available: boolean;
    dismissed: number;
    created: number;
    summary: string;
}

export async function serviceGenerateAiAlerts(): Promise<AiAlertGenerationResult> {
    if (!isAIAvailable()) {
        return { ai_available: false, dismissed: 0, created: 0, summary: "" };
    }

    // Gather metrics (same logic as ops-summary route)
    const [products, alerts, pendingOrders, approvedOrders] = await Promise.all([
        dbListProducts({ is_active: true, pageSize: 500 }),
        dbListAlerts({ status: "open" }),
        dbListOrders({ commercial_status: "pending_approval", pageSize: 200 }),
        dbListOrders({ commercial_status: "approved", pageSize: 200 }),
    ]);

    const critical = products.filter(p => p.available_now <= p.min_stock_level);
    const warning = products.filter(p =>
        p.available_now > p.min_stock_level &&
        p.available_now <= Math.ceil(p.min_stock_level * 1.5)
    );

    const topCritical = critical
        .map(p => ({
            name: p.name,
            available: p.available_now,
            min: p.min_stock_level,
            coverageDays: computeCoverageDays(p.available_now, p.daily_usage),
        }))
        .sort((a, b) => (a.coverageDays ?? 999) - (b.coverageDays ?? 999))
        .slice(0, 5);

    const highRiskOrderCount = [...pendingOrders, ...approvedOrders]
        .filter(o => o.ai_risk_level === "high")
        .length;

    const metrics: OpsSummaryInput = {
        criticalStockCount: critical.length,
        warningStockCount: warning.length,
        atRiskCount: warning.length,
        topCriticalItems: topCritical,
        pendingOrderCount: pendingOrders.length,
        approvedOrderCount: approvedOrders.length,
        highRiskOrderCount,
        openAlertCount: alerts.length,
    };

    // Call AI
    const result = await aiGenerateOpsSummary(metrics);

    // Dismiss old AI alerts
    const dismissed = await dbDismissAlertsBySource("ai");

    // Create new alerts from insights
    let created = 0;

    for (const insight of result.insights) {
        await dbCreateAlert({
            type: "purchase_recommended",
            severity: "info",
            title: insight,
            description: result.summary,
            source: "ai",
            ai_confidence: result.confidence,
            ai_reason: insight,
            ai_model_version: "claude-haiku-4-5-20251001",
        });
        created++;
    }

    for (const anomaly of result.anomalies) {
        await dbCreateAlert({
            type: "stock_risk",
            severity: "warning",
            title: anomaly,
            description: result.summary,
            source: "ai",
            ai_confidence: result.confidence,
            ai_reason: anomaly,
            ai_model_version: "claude-haiku-4-5-20251001",
        });
        created++;
    }

    return { ai_available: true, dismissed, created, summary: result.summary };
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
