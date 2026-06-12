/**
 * Alert Service — stock scan + alert lifecycle.
 * Follows domain-rules.md §6 (critical/warning rules) + §12 (alert lifecycle).
 */

import { dbListAllActiveProducts, dbGetOpenShortagesByProduct, dbGetQuotedQuantities } from "@/lib/supabase/products";
import { dbListOrders, dbListOverdueShipments } from "@/lib/supabase/orders";
import { dbGetIncomingPOQuantities, dbListOverduePurchaseOrders } from "@/lib/supabase/purchase-orders";
import {
    dbListAlerts,
    dbGetAlertById,
    dbCreateAlert,
    dbUpdateAlertStatus,
    dbListActiveAlerts,
    dbListRecentlyDismissed,
    dbBatchResolveAlerts,
    dbUpdateActiveAlertContent,
    type ListAlertsFilter,
    type BatchResolveEntry,
} from "@/lib/supabase/alerts";
import type { AlertStatus, AlertType } from "@/lib/database.types";
import { computeCoverageDays, computeOrderDeadline, dateDaysFromToday, buildStockAlertDescription, type StockRiskInputs } from "@/lib/stock-utils";
import { isAIAvailable, aiGenerateAlertFindings } from "@/lib/services/ai-service";
import { notifyUsersByEmail } from "@/lib/services/email-service";

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
    /** Y8 (2026-06): kritik-stok e-postası gönderilemeyen alıcı sayısı — sessiz
     *  kayıp görünür olur (log'a yazılan failed'ları retry cron'u yeniden dener). */
    emailFailed: number;
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
// Sprint A G8: severity rank for escalation detection.
// Daha düşük severity yoksaylanmışken daha yüksek severity'ye çıkıldıysa bypass eder.
const SEVERITY_RANK: Record<string, number> = { info: 0, warning: 1, critical: 2 };

export async function serviceScanStockAlerts(): Promise<ScanResult> {
    const [products, shortageMap, activeAlerts, quotedMap, recentlyDismissed] = await Promise.all([
        dbListAllActiveProducts(),
        dbGetOpenShortagesByProduct(),
        dbListActiveAlerts(),
        dbGetQuotedQuantities(),
        dbListRecentlyDismissed(24),
    ]);

    // Build dedup map: "type:entityId" → severity, for O(1) lookups + severity diff detection
    const activeMap = new Map<string, string>();
    for (const a of activeAlerts) {
        if (a.entity_id) activeMap.set(`${a.type}:${a.entity_id}`, a.severity);
    }

    // Sprint A G8: Son 24 saatteki dismissed → "type:entityId" → dismissed_severity (en yenisi).
    // Severity escalation bypass: yeni severity rank > yoksaylan severity rank → izin ver.
    const dismissedMap = new Map<string, string>();
    for (const a of recentlyDismissed) {
        if (!a.entity_id) continue;
        const key = `${a.type}:${a.entity_id}`;
        const existing = dismissedMap.get(key);
        // Birden fazla dismiss varsa en yenisini tut (DB sırası garanti değil; severity rank max'ını koru).
        if (!existing || (SEVERITY_RANK[a.dismissed_severity ?? a.severity] ?? 0) > (SEVERITY_RANK[existing] ?? 0)) {
            dismissedMap.set(key, a.dismissed_severity ?? a.severity);
        }
    }

    /** Bu type+entity için yeni alert oluşturmak yasak mı? (24h dismiss + severity bypass kuralı) */
    function isBlockedByDismiss(type: string, entityId: string, newSeverity: string): boolean {
        const dismissedSev = dismissedMap.get(`${type}:${entityId}`);
        if (!dismissedSev) return false;
        const newRank      = SEVERITY_RANK[newSeverity] ?? 0;
        const dismissedRnk = SEVERITY_RANK[dismissedSev] ?? 0;
        return newRank <= dismissedRnk; // sadece daha kötü durumda (newRank > dismissedRnk) bypass
    }

    let created = 0;
    let emailFailed = 0;
    const toResolve: BatchResolveEntry[] = [];

    // Orphan cleanup — aktif ürün setinde olmayan uyarıları resolve et.
    // Sebep: ürün silinince (hard delete) ya da is_active=false yapılınca,
    // ona bağlı stok/sipariş tabanlı uyarılar geçersiz kalıyor; liste çöp doluyor.
    const activeProductIds = new Set(products.map(p => p.id));
    const ORPHAN_TARGET_TYPES = ["stock_critical", "stock_risk", "order_deadline", "order_shortage"] as const;
    for (const a of activeAlerts) {
        if (
            a.entity_type === "product" &&
            a.entity_id &&
            !activeProductIds.has(a.entity_id) &&
            (ORPHAN_TARGET_TYPES as readonly string[]).includes(a.type)
        ) {
            toResolve.push({ type: a.type, entityId: a.entity_id, reason: "auto_cleanup_orphaned" });
            // activeMap'ten de düş ki sonraki create akışları yanılmasın.
            activeMap.delete(`${a.type}:${a.entity_id}`);
        }
    }
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

            if (!activeMap.has(`stock_critical:${entityId}`) && !isBlockedByDismiss("stock_critical", entityId, "critical")) {
                const alert = await dbCreateAlert({
                    type: "stock_critical",
                    severity: "critical",
                    title: `Kritik Stok: ${product.name}`,
                    description: buildStockAlertDescription(riskInputs, "critical"),
                    entity_type: "product",
                    entity_id: entityId,
                    ai_inputs_summary: { available, min, dailyUsage, coverageDays, leadTimeDays, unit: product.unit },
                });
                if (alert) {
                    created++;
                    // Y8 (2026-06): kritik-stok e-postası artık AWAITED — cron
                    // bağlamında gecikme kabul edilebilir; başarısızlık sayaçla
                    // görünür (eski fire-and-forget + 24h alert-dedup birleşimi
                    // bildirimi sessizce yutabiliyordu). Hata taramayı düşürmez;
                    // email-log'a yazılmış failed kayıtları retry cron'u dener.
                    try {
                        const mail = await notifyUsersByEmail({
                            notificationType: "stock_critical",
                            entityType: "product",
                            entityId,
                            render: { type: "stock_critical", ctx: {
                                productName: product.name,
                                sku: product.sku,
                                available,
                                min,
                            } },
                        });
                        emailFailed += mail.failed;
                    } catch (err) {
                        emailFailed++;
                        console.error("[email stock_critical]", err);
                    }
                }
            }
        } else if (isWarning) {
            if (!activeMap.has(`stock_risk:${entityId}`) && !isBlockedByDismiss("stock_risk", entityId, "warning")) {
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
                    if (isBlockedByDismiss("order_deadline", entityId, newSeverity)) {
                        // 24h içinde aynı/daha yüksek severity ile yoksaylanmış → atla.
                    } else {
                        // Alert yok — inline oluştur
                        const alert = await dbCreateAlert(alertInput);
                        if (alert) created++;
                    }
                } else if (existingSeverity !== newSeverity) {
                    // Severity değişti (warning → critical veya tersi) — eski resolve et, yeni oluştur
                    // (escalation geçmişi kayıtta kalsın diye bilinçli resolve+create)
                    toResolve.push({ type: "order_deadline", entityId, reason: "deadline_severity_changed" });
                    toCreate.push(alertInput);
                } else {
                    // Aynı severity — metin dinamik (gün sayısı), satırı YERİNDE tazele.
                    // Eski davranış (resolve+create) her 6 saatlik taramada günde 4 "çözüldü"
                    // kopyası üretip takvimi ve tabloyu şişiriyordu.
                    await dbUpdateActiveAlertContent("order_deadline", entityId, {
                        title: deadlineTitle,
                        description: deadlineDesc,
                    });
                }
            } else {
                toResolve.push({ type: "order_deadline", entityId, reason: "deadline_not_imminent" });
            }
        } else {
            toResolve.push({ type: "order_deadline", entityId, reason: "deadline_not_computable" });
        }

        // Order shortage: source of truth is the shortages table.
        const openShortageQty = shortageMap.get(product.id) ?? 0;
        if (openShortageQty > 0) {
            if (!activeMap.has(`order_shortage:${entityId}`) && !isBlockedByDismiss("order_shortage", entityId, "critical")) {
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

    return { scanned: products.length, created, resolved, emailFailed };
}

// ── Alert CRUD ───────────────────────────────────────────────

export async function serviceListAlerts(
    filter: ListAlertsFilter = {},
    opts?: import("@/lib/supabase/alerts").ListAlertsOptions,
) {
    return dbListAlerts(filter, opts);
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
    aiAvailable: boolean;
    /** Kapanan AI uyarısı sayısı (bulgusu geçen + entity'siz eski nesil). */
    dismissed: number;
    created: number;
    /** İçeriği yerinde tazelenen mevcut AI uyarısı sayısı (churn yok). */
    updated: number;
    summary: string;
}

/**
 * AI bulgu üretimi — entity-bağlı, dedup'lu, churn'süz.
 *
 * Eski davranış: her çağrıda TÜM source=ai uyarıları dismiss edilip serbest
 * metin insight/anomali'ler entity'siz yeniden yaratılıyordu (6 saatlik cron'da
 * günde 4 batch takvim gürültüsü). Yeni davranış:
 *  - AI'a riskli ürün alt kümesi (≤30) zengin satırlarla verilir, çıktı
 *    product_id'ye bağlı yapılandırılmış bulgudur (ai-service tool şeması).
 *  - Aynı ürün için aktif AI uyarısı varsa İÇERİĞİ tazelenir (update-in-place).
 *  - Bulgusu geçen ürünlerin AI uyarıları resolve edilir.
 *  - Kural-bazlı stok uyarısı zaten açık olan ürüne AI bulgusu eklenmez,
 *    24 saat içinde yoksayılmış stok uyarısı olan ürün de atlanır.
 */
export async function serviceGenerateAiAlerts(): Promise<AiAlertGenerationResult> {
    if (!isAIAvailable()) {
        return { aiAvailable: false, dismissed: 0, created: 0, updated: 0, summary: "" };
    }

    const [products, shortageMap, quotedMap, incomingMap, activeAlerts, recentlyDismissed, pendingOrders, approvedOrders] = await Promise.all([
        dbListAllActiveProducts(),
        dbGetOpenShortagesByProduct(),
        dbGetQuotedQuantities(),
        dbGetIncomingPOQuantities(),
        dbListActiveAlerts(),
        dbListRecentlyDismissed(24),
        dbListOrders({ commercial_status: "pending_approval", pageSize: 200 }),
        dbListOrders({ commercial_status: "approved", pageSize: 200 }),
    ]);

    // Riskli ürün alt kümesi: eşiğe yaklaşanlar + eksiği olanlar + kapsama/lead gerilimi.
    const candidates = products.map(p => {
        const quoted = quotedMap.get(p.id) ?? 0;
        return {
            id: p.id,
            sku: p.sku,
            name: p.name,
            unit: p.unit,
            available: p.available_now,
            promisable: p.available_now - quoted,
            min: p.min_stock_level,
            dailyUsage: p.daily_usage ?? null,
            coverageDays: computeCoverageDays(p.available_now, p.daily_usage ?? null),
            leadTimeDays: p.lead_time_days ?? null,
            openShortageQty: shortageMap.get(p.id) ?? 0,
            incomingPoQty: incomingMap.get(p.id) ?? 0,
        };
    }).filter(c =>
        c.promisable <= c.min * 2 ||
        c.openShortageQty > 0 ||
        (c.coverageDays !== null && c.leadTimeDays !== null && c.coverageDays < c.leadTimeDays * 1.5)
    );
    candidates.sort((a, b) => (a.coverageDays ?? 9999) - (b.coverageDays ?? 9999));
    const subset = candidates.slice(0, 30);

    const critical = products.filter(p => p.available_now <= p.min_stock_level);
    const warning = products.filter(p =>
        p.available_now > p.min_stock_level &&
        p.available_now <= Math.ceil(p.min_stock_level * 1.5)
    );

    const result = await aiGenerateAlertFindings({
        aggregates: {
            criticalStockCount: critical.length,
            warningStockCount: warning.length,
            pendingOrderCount: pendingOrders.length,
            approvedOrderCount: approvedOrders.length,
            openAlertCount: activeAlerts.length,
        },
        products: subset,
    });

    // AI çağrısı başarısız olduysa (401, ağ, vb.) mevcut AI uyarılarına DOKUNMA:
    // "bulgu yok" ile "AI cevap veremedi" farklı — degraded'da temizlik yapılırsa
    // geçerli bulgular API arızasında sessizce silinir (smoke 2026-06-11 bulgusu).
    if (result.degraded) {
        return { aiAvailable: true, dismissed: 0, created: 0, updated: 0, summary: "" };
    }

    // Aktif AI uyarıları (entity'li) + kural-bazlı stok uyarısı olan ürünler.
    const activeAiByEntity = new Map<string, { type: AlertType }>();
    const ruleStockEntities = new Set<string>();
    const legacyNoEntityAi: string[] = [];
    for (const a of activeAlerts) {
        if (a.source === "ai") {
            if (a.entity_id) activeAiByEntity.set(a.entity_id, { type: a.type });
            else legacyNoEntityAi.push(a.id);
        } else if ((a.type === "stock_critical" || a.type === "stock_risk") && a.entity_id) {
            ruleStockEntities.add(a.entity_id);
        }
    }
    // 24h içinde yoksayılmış stok uyarısı olan ürünler — kullanıcı kararına saygı.
    const dismissedStockEntities = new Set(
        recentlyDismissed
            .filter(a => (a.type === "stock_risk" || a.type === "stock_critical") && a.entity_id)
            .map(a => a.entity_id as string),
    );

    let created = 0;
    let updated = 0;
    const keepEntities = new Set<string>();

    for (const f of result.findings) {
        const existing = activeAiByEntity.get(f.productId);
        const title = f.title;
        const description = `${f.detail}\nÖnerilen aksiyon: ${f.action}`;

        if (existing) {
            keepEntities.add(f.productId);
            await dbUpdateActiveAlertContent(existing.type, f.productId, { title, description });
            updated++;
            continue;
        }
        if (ruleStockEntities.has(f.productId) || dismissedStockEntities.has(f.productId)) continue;

        const alert = await dbCreateAlert({
            type: "stock_risk",
            severity: f.severity === "warning" ? "warning" : "info",
            title,
            description,
            entity_type: "product",
            entity_id: f.productId,
            source: "ai",
            ai_confidence: f.confidence,
            ai_reason: f.detail,
            ai_model_version: result.modelVersion,
        });
        if (alert) {
            created++;
            keepEntities.add(f.productId);
        }
    }

    // Bulgusu geçen ürünlerin AI uyarıları → resolve (yerine yenisi YARATILMAZ).
    const stale: BatchResolveEntry[] = [];
    for (const [entityId, a] of activeAiByEntity) {
        if (!keepEntities.has(entityId)) stale.push({ type: a.type, entityId, reason: "ai_finding_cleared" });
    }
    let dismissed = stale.length > 0 ? await dbBatchResolveAlerts(stale) : 0;

    // Tek seferlik geçiş temizliği: entity'siz eski nesil AI uyarıları artık üretilmiyor.
    for (const id of legacyNoEntityAi) {
        await dbUpdateAlertStatus(id, "dismissed", "legacy_entityless_ai_alert");
        dismissed++;
    }

    return { aiAvailable: true, dismissed, created, updated, summary: result.summary };
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

// ── Overdue Purchase Order Scan ──────────────────────────────

/**
 * Beklenen teslim tarihi geçen açık (sent/confirmed/partially_received) PO'lar
 * için po_overdue uyarısı üretir; artık gecikmede olmayan (teslim alınan,
 * iptal edilen ya da tarihi ileri alınan) PO'ların uyarılarını resolve eder.
 * /api/alerts/scan route'undan stok taramasıyla birlikte çağrılır (aynı lock).
 */
export async function serviceCheckOverduePurchaseOrders(): Promise<{ alerted: number; resolved: number }> {
    const [overduePos, activeAlerts] = await Promise.all([
        dbListOverduePurchaseOrders(),
        dbListActiveAlerts(),
    ]);

    const poAlerts = activeAlerts.filter(a => a.type === "po_overdue");
    const overdueIds = new Set(overduePos.map(po => po.id));

    const toResolve: BatchResolveEntry[] = poAlerts
        .filter(a => a.entity_id !== null && !overdueIds.has(a.entity_id))
        .map(a => ({ type: "po_overdue", entityId: a.entity_id as string, reason: "po_no_longer_overdue" }));
    const resolved = toResolve.length > 0 ? await dbBatchResolveAlerts(toResolve) : 0;

    const activeSet = new Set(poAlerts.map(a => a.entity_id));
    let alerted = 0;
    for (const po of overduePos) {
        if (activeSet.has(po.id)) continue;
        const daysLate = Math.max(1, dateDaysFromToday(po.expected_date as string) * -1);
        const alert = await dbCreateAlert({
            type: "po_overdue",
            severity: "warning",
            title: `Geciken Tedarik: ${po.po_number}`,
            description: `Beklenen teslim tarihi ${po.expected_date} — ${daysLate} gün gecikti. Tedarikçiyle teyitleşin ya da teslim tarihini güncelleyin.`,
            entity_type: "purchase_order",
            entity_id: po.id,
        });
        if (alert) alerted++;
    }
    return { alerted, resolved };
}

// ── Overdue Shipment Scan ────────────────────────────────────

/** Creates overdue_shipment alerts for approved orders past their planned ship
 *  date (or 7+ days since creation if no date set). Deduplicates active alerts.
 *  Also resolves stale overdue_shipment alerts for orders that are no longer overdue
 *  (shipped, cancelled, etc.) — safety-net for ship endpoint alert resolve failures. */
export async function serviceCheckOverdueShipments(): Promise<{ alerted: number; resolved: number }> {
    const [orders, activeAlerts] = await Promise.all([
        dbListOverdueShipments(),
        dbListActiveAlerts(),
    ]);

    const overdueAlerts = activeAlerts.filter(a => a.type === "overdue_shipment");
    const overdueOrderIds = new Set(orders.map(o => o.id));

    // Resolve stale alerts: active overdue_shipment alerts whose orders are no longer overdue
    const toResolve: BatchResolveEntry[] = overdueAlerts
        .filter(a => a.entity_id !== null && !overdueOrderIds.has(a.entity_id))
        .map(a => ({ type: "overdue_shipment", entityId: a.entity_id as string, reason: "order_shipped" }));
    const resolved = toResolve.length > 0 ? await dbBatchResolveAlerts(toResolve) : 0;

    // Create new alerts for overdue orders without an active alert
    const activeSet = new Set(overdueAlerts.map(a => a.entity_id));
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
    return { alerted, resolved };
}
