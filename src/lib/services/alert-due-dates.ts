/**
 * Server-side enrichment for the alerts calendar.
 *
 * Real `alerts` rows don't carry a target/due date. The meaningful target date
 * lives on the linked entity row:
 *  - `overdue_shipment`                → sales_orders.planned_shipment_date
 *  - `quote_expired` + sales_order     → sales_orders.quote_valid_until (eski eksen)
 *  - `quote_expired` + quote           → quotes.valid_until (V7 teklif modülü)
 *  - `po_overdue`                      → purchase_orders.expected_date
 * This helper batch-joins each entity table ONCE and attaches
 * `due_date` / `due_label` / `order_code` to each alert.
 *
 * NOT handled here (by design):
 *  - `order_deadline` is a PRODUCT-entity alert; its due (stockout) date is
 *    derived client-side from the already-fetched product enrichment
 *    (`productMap[entity_id].orderDeadline`). No join needed.
 *  - stock_x / purchase_recommended / sync_issue have no target date.
 */

import { createServiceClient } from "@/lib/supabase/service";
import type { AlertRow } from "@/lib/database.types";

export interface AlertWithDueMeta extends AlertRow {
    due_date: string | null;
    due_label: string | null;
    order_code: string | null;
}

interface DueMeta {
    due_date: string | null;
    due_label: string | null;
    order_code: string | null;
}

const EMPTY: DueMeta = { due_date: null, due_label: null, order_code: null };

interface OrderDueRow {
    id: string;
    order_number: string | null;
    planned_shipment_date: string | null;
    quote_valid_until: string | null;
}

interface QuoteDueRow {
    id: string;
    quote_number: string | null;
    valid_until: string | null;
}

interface PoDueRow {
    id: string;
    po_number: string | null;
    expected_date: string | null;
}

/** Alert satırının hangi entity join'ine ihtiyacı var? */
function dueSource(a: AlertRow): "sales_order" | "quote" | "po" | null {
    if (!a.entity_id) return null;
    if (a.type === "overdue_shipment") return "sales_order";
    if (a.type === "quote_expired") return a.entity_type === "quote" ? "quote" : "sales_order";
    if (a.type === "po_overdue") return "po";
    return null;
}

/**
 * Her alert için due_date/due_label/order_code ekler. Entity lookup'ları
 * tablo başına TEK batch sorguyla çözülür; herhangi biri patlarsa enrichment
 * non-fatal (alertler o tur işaretsiz döner).
 */
export async function enrichAlertsWithDueMeta(alerts: AlertRow[]): Promise<AlertWithDueMeta[]> {
    // 1) Tablo başına lookup id'leri topla.
    const orderIds = new Set<string>();
    const quoteIds = new Set<string>();
    const poIds = new Set<string>();
    for (const a of alerts) {
        const src = dueSource(a);
        if (src === "sales_order") orderIds.add(a.entity_id as string);
        else if (src === "quote") quoteIds.add(a.entity_id as string);
        else if (src === "po") poIds.add(a.entity_id as string);
    }

    // 2) Batch fetch'ler (boş set için sorgu atılmaz).
    const supabase = orderIds.size + quoteIds.size + poIds.size > 0 ? createServiceClient() : null;
    const orderMap = new Map<string, OrderDueRow>();
    const quoteMap = new Map<string, QuoteDueRow>();
    const poMap = new Map<string, PoDueRow>();

    if (supabase) {
        const [orders, quotes, pos] = await Promise.all([
            orderIds.size > 0
                ? supabase.from("sales_orders").select("id, order_number, planned_shipment_date, quote_valid_until").in("id", Array.from(orderIds))
                : Promise.resolve({ data: [], error: null }),
            quoteIds.size > 0
                ? supabase.from("quotes").select("id, quote_number, valid_until").in("id", Array.from(quoteIds))
                : Promise.resolve({ data: [], error: null }),
            poIds.size > 0
                ? supabase.from("purchase_orders").select("id, po_number, expected_date").in("id", Array.from(poIds))
                : Promise.resolve({ data: [], error: null }),
        ]);
        if (orders.error) console.error("[enrichAlertsWithDueMeta] sales_orders fetch", orders.error);
        else for (const row of (orders.data ?? []) as OrderDueRow[]) orderMap.set(row.id, row);
        if (quotes.error) console.error("[enrichAlertsWithDueMeta] quotes fetch", quotes.error);
        else for (const row of (quotes.data ?? []) as QuoteDueRow[]) quoteMap.set(row.id, row);
        if (pos.error) console.error("[enrichAlertsWithDueMeta] purchase_orders fetch", pos.error);
        else for (const row of (pos.data ?? []) as PoDueRow[]) poMap.set(row.id, row);
    }

    // 3) Her alert'i zenginleştir.
    return alerts.map((a) => {
        const src = dueSource(a);
        let meta: DueMeta = EMPTY;
        if (src === "sales_order") {
            const order = orderMap.get(a.entity_id as string);
            if (order) {
                const due = a.type === "overdue_shipment" ? order.planned_shipment_date : order.quote_valid_until;
                meta = {
                    due_date: due ?? null,
                    due_label: due ? (a.type === "overdue_shipment" ? "Planlanan Sevk" : "Teklif Geçerlilik") : null,
                    order_code: order.order_number ?? null,
                };
            }
        } else if (src === "quote") {
            const quote = quoteMap.get(a.entity_id as string);
            if (quote) {
                meta = {
                    due_date: quote.valid_until ?? null,
                    due_label: quote.valid_until ? "Teklif Geçerlilik" : null,
                    order_code: quote.quote_number ?? null,
                };
            }
        } else if (src === "po") {
            const po = poMap.get(a.entity_id as string);
            if (po) {
                meta = {
                    due_date: po.expected_date ?? null,
                    due_label: po.expected_date ? "Beklenen Teslim" : null,
                    order_code: po.po_number ?? null,
                };
            }
        }
        return { ...a, ...meta };
    });
}
