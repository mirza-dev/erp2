/**
 * Purchase Suggestion Service — deterministik satın alma önerisi üretimi.
 * domain-rules §6.1: critical = available_now <= min_stock_level
 * Formül: target = min*2, needed = max(0, target - available), rounded up to MOQ
 */

import { dbListProducts } from "@/lib/supabase/products";
import {
    dbListAlerts,
    dbOpenAlertExists,
    dbCreateAlert,
    dbResolveAlertsForEntity,
} from "@/lib/supabase/alerts";

// ── Formül ───────────────────────────────────────────────────

/**
 * Önerilen satın alma miktarını hesaplar.
 * target = min_stock_level * 2
 * needed = max(0, target - available_now)
 * moq = product.reorder_qty ?? min_stock_level
 * suggest = max(moq, ceil(needed / moq) * moq)
 */
function calcSuggestQty(available: number, min: number, moq: number): number {
    const target = min * 2;
    const needed = Math.max(0, target - available);
    if (needed === 0) return moq;
    return Math.max(moq, Math.ceil(needed / moq) * moq);
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
    const products = await dbListProducts({ is_active: true, pageSize: 500 });

    let created = 0;
    let resolved = 0;

    for (const product of products) {
        const available = product.available_now;
        const min = product.min_stock_level;
        const moq = product.reorder_qty ?? min;
        const entityId = product.id;

        if (available <= min) {
            const exists = await dbOpenAlertExists("purchase_recommended", entityId);
            if (!exists) {
                const suggestQty = calcSuggestQty(available, min, moq);
                const vendorNote = product.preferred_vendor
                    ? ` — Tedarikçi: ${product.preferred_vendor}`
                    : "";

                await dbCreateAlert({
                    type: "purchase_recommended",
                    severity: "warning",
                    title: `Satın Alma Önerisi: ${product.name}`,
                    description: `Mevcut stok (${available} ${product.unit}), minimum seviyede (${min} ${product.unit}). Önerilen sipariş: ${suggestQty} ${product.unit}${vendorNote}.`,
                    entity_type: "product",
                    entity_id: entityId,
                });
                created++;
            }
        } else {
            // Stok yeterli — açık önerileri kapat
            const r = await dbResolveAlertsForEntity("purchase_recommended", entityId, "stock_recovered");
            resolved += r;
        }
    }

    return { scanned: products.length, created, resolved };
}

// ── List ─────────────────────────────────────────────────────

export async function serviceListPurchaseSuggestions() {
    return dbListAlerts({ type: "purchase_recommended", status: "open" });
}
