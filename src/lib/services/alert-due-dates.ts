/**
 * Server-side enrichment for the alerts calendar.
 *
 * Real `alerts` rows don't carry a target/due date. For order-entity alert types
 * (`overdue_shipment`, `quote_expired`) the meaningful target date lives on the
 * linked `sales_orders` row (planned shipment / quote validity). This helper
 * batch-joins those orders ONCE and attaches `due_date` / `due_label` /
 * `order_code` to each alert.
 *
 * NOT handled here (by design):
 *  - `order_deadline` is a PRODUCT-entity alert; its due (stockout) date is
 *    derived client-side from the already-fetched product enrichment
 *    (`productMap[entity_id].orderDeadline`). No order join needed.
 *  - stock_x / purchase_recommended / sync_issue have no target date.
 */

import { createServiceClient } from "@/lib/supabase/service";
import type { AlertRow, AlertType } from "@/lib/database.types";

export interface AlertWithDueMeta extends AlertRow {
    due_date: string | null;
    due_label: string | null;
    order_code: string | null;
}

/** Alert tipleri → bağlı sales_order'dan okunan hedef tarih alanı + etiket. */
const ORDER_DUE_FIELD: Partial<Record<AlertType, { field: "planned_shipment_date" | "quote_valid_until"; label: string }>> = {
    overdue_shipment: { field: "planned_shipment_date", label: "Planlanan Sevk" },
    quote_expired:    { field: "quote_valid_until",     label: "Teklif Geçerlilik" },
};

interface OrderDueRow {
    id: string;
    order_number: string | null;
    planned_shipment_date: string | null;
    quote_valid_until: string | null;
}

/**
 * Her alert için due_date/due_label/order_code ekler. Order-entity alertlerinin
 * entity_id'leri tek batch `sales_orders` sorgusuyla çözülür.
 */
export async function enrichAlertsWithDueMeta(alerts: AlertRow[]): Promise<AlertWithDueMeta[]> {
    // 1) Hedef tarih için order lookup gereken entity_id'leri topla.
    const orderIds = new Set<string>();
    for (const a of alerts) {
        if (ORDER_DUE_FIELD[a.type] && a.entity_id) orderIds.add(a.entity_id);
    }

    // 2) Tek batch fetch (boşsa sorgu atma).
    const orderMap = new Map<string, OrderDueRow>();
    if (orderIds.size > 0) {
        const supabase = createServiceClient();
        const { data, error } = await supabase
            .from("sales_orders")
            .select("id, order_number, planned_shipment_date, quote_valid_until")
            .in("id", Array.from(orderIds));
        if (error) {
            // Zenginleştirme non-fatal: order verisi alınamazsa alertler yine döner
            // (due işaretleri o tur görünmez). Sessiz çökme yerine logla.
            console.error("[enrichAlertsWithDueMeta] sales_orders fetch", error);
        } else {
            for (const row of (data ?? []) as OrderDueRow[]) orderMap.set(row.id, row);
        }
    }

    // 3) Her alert'i zenginleştir.
    return alerts.map((a) => {
        const spec = ORDER_DUE_FIELD[a.type];
        const order = a.entity_id ? orderMap.get(a.entity_id) : undefined;
        let due_date: string | null = null;
        let due_label: string | null = null;
        let order_code: string | null = null;
        if (spec && order) {
            due_date = order[spec.field] ?? null;
            due_label = due_date ? spec.label : null;
            order_code = order.order_number ?? null;
        }
        return { ...a, due_date, due_label, order_code };
    });
}
