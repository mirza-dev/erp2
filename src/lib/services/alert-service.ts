/**
 * Alert Service — stock scan + alert lifecycle.
 * Follows domain-rules.md §6 (critical/warning rules) + §12 (alert lifecycle).
 */

import { dbListAllActiveProducts, dbListProducts, dbGetOpenShortagesByProduct, dbGetQuotedQuantities } from "@/lib/supabase/products";
import { dbListOrders, dbListOverdueShipments } from "@/lib/supabase/orders";
import {
    dbListAlerts,
    dbGetAlertById,
    dbCreateAlert,
    dbUpdateAlertStatus,
    dbDismissAlertsBySource,
    dbListActiveAlerts,
    dbBatchResolveAlerts,
    type ListAlertsFilter,
    type BatchResolveEntry,
} from "@/lib/supabase/alerts";
import type { AlertStatus } from "@/lib/database.types";
import { computeCoverageDays, computeOrderDeadline, dateDaysFromToday, buildStockAlertDescription, type StockRiskInputs } from "@/lib/stock-utils";
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
 *
 * N+1 optimized: pre-fetches active alerts into an in-memory Set, collects
 * resolve operations into a batch, and relies on the unique index
 * idx_alerts_active_dedup as a safety net against duplicate creates.
 */
export async function serviceScanStockAlerts(): Promise<ScanResult> {
    const [products, shortageMap, activeAlerts, quotedMap] = await Promise.all([
        dbListAllActiveProducts(),
        dbGetOpenShortagesByProduct(),
        dbListActiveAlerts(),
        dbGetQuotedQuantities(),
    ]);

    // Build dedup map: "type:entityId" → severity, for O(1) lookups + severity diff detection
    const activeMap = new Map<string, string>();
    for (const a of activeAlerts) {
        if (a.entity_id) activeMap.set(`${a.type}:${a.entity_id}`, a.severity);
    }

    let created = 0;
    const toResolve: BatchResolveEntry[] = [];
    // Deferred creates for severity-change cases (resolved first, then created)
    const toCreate: Parameters<typeof dbCreateAlert>[0][] = [];

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
            toResolve.push({ type: "stock_risk", entityId, reason: "escalated_to_critical" });

            if (!activeMap.has(`stock_critical:${entityId}`)) {
                const alert = await dbCreateAlert({
                    type: "stock_critical",
                    severity: "critical",
                    title: `Kritik Stok: ${product.name}`,
                    description: buildStockAlertDescription(riskInputs, "critical"),
                    entity_type: "product",
                    entity_id: entityId,
                    ai_inputs_summary: { available, min, dailyUsage, coverageDays, leadTimeDays, unit: product.unit },
                });
                if (alert) created++;
            }
        } else if (isWarning) {
            if (!activeMap.has(`stock_risk:${entityId}`)) {
                const alert = await dbCreateAlert({
                    type: "stock_risk",
                    severity: "warning",
                    title: `Stok Uyarısı: ${product.name}`,
                    description: buildStockAlertDescription(riskInputs, "warning"),
                    entity_type: "product",
                    entity_id: entityId,
                    ai_inputs_summary: { available, min, dailyUsage, coverageDays, leadTimeDays, unit: product.unit },
                });
                if (alert) created++;
            }
        } else {
            // Stock is healthy — resolve any open stock alerts
            toResolve.push({ type: "stock_critical", entityId, reason: "stock_recovered" });
            toResolve.push({ type: "stock_risk", entityId, reason: "stock_recovered" });
        }

        // Order deadline: sipariş son tarihi ≤ 7 gün → alert
        // promisable kullanılır (available_now - quoted) — UI/API ile tutarlı
        const quoted = quotedMap.get(product.id) ?? 0;
        const promisable = product.available_now - quoted;
        const { orderDeadline } = computeOrderDeadline(
            promisable,
            dailyUsage,
            leadTimeDays,
        );
        if (orderDeadline !== null) {
            const daysLeft = dateDaysFromToday(orderDeadline);
            if (daysLeft <= 7) {
                const newSeverity = daysLeft < 0 ? "critical" as const : "warning" as const;
                const deadlineTitle = daysLeft < 0
                    ? `${product.name}: Sipariş son tarihi geçti`
                    : `${product.name}: Sipariş son tarihi ${daysLeft} gün kaldı`;
                const deadlineDesc = daysLeft < 0
                    ? `Sipariş son tarihi ${Math.abs(daysLeft)} gün önce geçti. Tedarik süresi: ${leadTimeDays ?? "?"} gün.`
                    : `Sipariş verilmesi için ${daysLeft} gün kaldı. Tedarik süresi: ${leadTimeDays ?? "?"} gün.`;
                const alertInput = {
                    type: "order_deadline" as const,
                    severity: newSeverity,
                    title: deadlineTitle,
                    description: deadlineDesc,
                    entity_type: "product" as const,
                    entity_id: entityId,
                };
                const existingSeverity = activeMap.get(`order_deadline:${entityId}`);
                if (existingSeverity === undefined) {
                    // Alert yok — inline oluştur
                    const alert = await dbCreateAlert(alertInput);
                    if (alert) created++;
                } else if (existingSeverity !== newSeverity) {
                    // Severity değişti (warning → critical veya tersi) — eski resolve et, yeni oluştur
                    toResolve.push({ type: "order_deadline", entityId, reason: "deadline_severity_changed" });
                    toCreate.push(alertInput);
                }
                // else: aynı severity → aksiyon gerekmez
            } else {
                toResolve.push({ type: "order_deadline", entityId, reason: "deadline_not_imminent" });
            }
        } else {
            toResolve.push({ type: "order_deadline", entityId, reason: "deadline_not_computable" });
        }

        // Order shortage: source of truth is the shortages table.
        const openShortageQty = shortageMap.get(product.id) ?? 0;
        if (openShortageQty > 0) {
            if (!activeMap.has(`order_shortage:${entityId}`)) {
                const alert = await dbCreateAlert({
                    type: "order_shortage",
                    severity: "critical",
                    title: `Sipariş Eksik: ${product.name}`,
                    description: `${openShortageQty} ${product.unit} eksik — onaylı sipariş karşılanamıyor.`,
                    entity_type: "product",
                    entity_id: entityId,
                });
                if (alert) created++;
            }
        } else {
            // No open shortages for this product — resolve any stale alert
            toResolve.push({ type: "order_shortage", entityId, reason: "shortage_resolved" });
        }
    }

    // Batch resolve — groups by type+reason, ~3-5 DB calls instead of ~1000
    const resolved = await dbBatchResolveAlerts(toResolve);

    // Deferred creates: severity-changed alerts (resolved above, now safe to create)
    for (const input of toCreate) {
        const alert = await dbCreateAlert(input);
        if (alert) created++;
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
        const alert = await dbCreateAlert({
            type: "purchase_recommended",
            severity: "info",
            title: insight,
            description: result.summary,
            source: "ai",
            ai_confidence: result.confidence,
            ai_reason: insight,
            ai_model_version: "claude-haiku-4-5-20251001",
        });
        if (alert) created++;
    }

    for (const anomaly of result.anomalies) {
        const alert = await dbCreateAlert({
            type: "stock_risk",
            severity: "warning",
            title: anomaly,
            description: result.summary,
            source: "ai",
            ai_confidence: result.confidence,
            ai_reason: anomaly,
            ai_model_version: "claude-haiku-4-5-20251001",
        });
        if (alert) created++;
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

// ── Overdue Shipment Scan ────────────────────────────────────

/** Creates overdue_shipment alerts for approved orders past their planned ship
 *  date (or 7+ days since creation if no date set). Deduplicates active alerts. */
export async function serviceCheckOverdueShipments(): Promise<{ alerted: number }> {
    const orders = await dbListOverdueShipments();
    if (orders.length === 0) return { alerted: 0 };

    const activeAlerts = await dbListActiveAlerts();
    const activeSet = new Set(
        activeAlerts
            .filter(a => a.type === "overdue_shipment")
            .map(a => a.entity_id)
    );

    let alerted = 0;
    for (const order of orders) {
        if (activeSet.has(order.id)) continue;
        await dbCreateAlert({
            type: "overdue_shipment",
            severity: "warning",
            title: `Geciken Sevkiyat: ${order.order_number}`,
            description: order.planned_shipment_date
                ? `${order.customer_name} — Planlanan sevk tarihi ${order.planned_shipment_date} geçti.`
                : `${order.customer_name} — Onaydan 7+ gün geçti, henüz sevk edilmedi.`,
            entity_type: "sales_order",
            entity_id: order.id,
        });
        alerted++;
    }
    return { alerted };
}
