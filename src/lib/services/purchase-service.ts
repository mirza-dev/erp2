/**
 * Purchase Suggestion Service — deterministik satın alma önerisi üretimi.
 * domain-rules §6.1: critical = available_now <= min_stock_level
 *
 * Formül (Faz 6 — lead-time-aware):
 * - Veri var: target = daily_usage × lead_time_days + min (emniyet stoğu)
 * - Veri yok: target = min × 2 (fallback)
 * - MOQ rounding: max(moq, ceil(needed / moq) * moq)
 */

import { dbListProducts, dbGetQuotedQuantities } from "@/lib/supabase/products";
import {
    dbListAlerts,
    dbListActiveAlerts,
    dbCreateAlert,
    dbResolveAlertsForEntity,
} from "@/lib/supabase/alerts";
import { computeCoverageDays, computeTargetStock, buildPurchaseDescription } from "@/lib/stock-utils";

// ── Formül ───────────────────────────────────────────────────

interface SuggestResult {
    suggestQty: number;
    targetStock: number;
    formula: "lead_time" | "fallback";
    leadTimeDemand: number | null;
}

/**
 * Önerilen satın alma miktarını hesaplar.
 * computeTargetStock ile target belirler, MOQ'ya yuvarlar.
 */
function calcSuggestQty(
    available: number,
    min: number,
    moq: number,
    dailyUsage: number | null,
    leadTimeDays: number | null
): SuggestResult {
    const { target, formula, leadTimeDemand } = computeTargetStock(min, dailyUsage, leadTimeDays);
    const needed = Math.max(0, target - available);
    const suggestQty = needed === 0 ? moq : Math.max(moq, Math.ceil(needed / moq) * moq);
    return { suggestQty, targetStock: target, formula, leadTimeDemand };
}

// ── Scan ─────────────────────────────────────────────────────

export interface PurchaseScanResult {
    scanned: number;
    created: number;
    resolved: number;
}

/**
 * Tüm aktif ürünleri tarar:
 * - available_now <= min_stock_level → purchase_recommended alert oluştur (deduplicate)
 * - Stock recovered → open purchase_recommended alertleri kapat
 */
export async function serviceScanPurchaseSuggestions(): Promise<PurchaseScanResult> {
    const [products, activeAlerts, quotedMap] = await Promise.all([
        dbListProducts({ is_active: true, pageSize: 500 }),
        dbListActiveAlerts(),
        dbGetQuotedQuantities(),
    ]);

    // Dedup: open + acknowledged purchase_recommended alertleri önceden topla
    const activePurchaseSet = new Set<string>();
    for (const a of activeAlerts) {
        if (a.type === "purchase_recommended" && a.entity_id) {
            activePurchaseSet.add(a.entity_id);
        }
    }

    let created = 0;
    let resolved = 0;
    let scanned = 0;

    for (const product of products) {
        if (product.product_type === "manufactured") continue;
        scanned++;
        const available = product.available_now - (quotedMap.get(product.id) ?? 0); // promisable
        const min = product.min_stock_level;
        const moq = product.reorder_qty ?? min;
        const entityId = product.id;

        if (available <= min) {
            const exists = activePurchaseSet.has(entityId);
            if (!exists) {
                const dailyUsage = product.daily_usage ?? null;
                const leadTimeDays = product.lead_time_days ?? null;
                const coverageDays = computeCoverageDays(Math.max(0, available), dailyUsage);

                const { suggestQty, targetStock, formula, leadTimeDemand } = calcSuggestQty(
                    available, min, moq, dailyUsage, leadTimeDays
                );

                await dbCreateAlert({
                    type: "purchase_recommended",
                    severity: "warning",
                    title: `Satın Alma Önerisi: ${product.name}`,
                    description: buildPurchaseDescription({
                        available, min, dailyUsage, coverageDays, leadTimeDays,
                        unit: product.unit,
                        suggestQty, moq,
                        preferredVendor: product.preferred_vendor ?? null,
                        targetStock, formula, leadTimeDemand,
                    }),
                    entity_type: "product",
                    entity_id: entityId,
                    ai_inputs_summary: {
                        available, min, dailyUsage, coverageDays, leadTimeDays,
                        suggestQty, moq, targetStock,
                        formula, leadTimeDemand,
                        unit: product.unit,
                    },
                });
                created++;
            }
        } else {
            // Stok yeterli — açık önerileri kapat
            const r = await dbResolveAlertsForEntity("purchase_recommended", entityId, "stock_recovered");
            resolved += r;
        }
    }

    return { scanned, created, resolved };
}

// ── List ─────────────────────────────────────────────────────

export async function serviceListPurchaseSuggestions() {
    return dbListAlerts({ type: "purchase_recommended", status: "open" });
}
