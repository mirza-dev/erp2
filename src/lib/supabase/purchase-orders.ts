import { createServiceClient } from "./service";
import type { PurchaseOrderRow, PurchaseOrderLineRow, PurchaseOrderStatus } from "@/lib/database.types";

export type { PurchaseOrderStatus };

export interface PurchaseOrderWithLines extends PurchaseOrderRow {
    lines: PurchaseOrderLineRow[];
}

export const VALID_PO_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
    draft:               ["sent", "confirmed", "cancelled"],
    sent:                ["confirmed", "cancelled", "draft"],   // M1: revize
    confirmed:           ["partially_received", "received", "cancelled"],
    partially_received:  ["received", "cancelled"],
    received:            [],
    cancelled:           [],
};

export interface ListPurchaseOrdersFilter {
    status?: PurchaseOrderStatus;
    vendor_id?: string;
}

export interface CreatePurchaseOrderInput {
    vendorId: string;
    expectedDate?: string | null;
    currency: string;
    notes?: string | null;
    lines: CreatePurchaseOrderLine[];
    createdBy?: string | null;
}

export interface CreatePurchaseOrderLine {
    product_id: string;
    quantity: number;
    unit_price: number;
    discount_pct?: number;
    notes?: string | null;
    source_recommendation_ids?: string[];
}

export async function dbListPurchaseOrders(
    filter: ListPurchaseOrdersFilter = {},
): Promise<PurchaseOrderRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("purchase_orders")
        .select("*")
        .order("created_at", { ascending: false });

    if (filter.status) query = query.eq("status", filter.status);
    if (filter.vendor_id) query = query.eq("vendor_id", filter.vendor_id);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetPurchaseOrderById(
    id: string,
): Promise<PurchaseOrderWithLines | null> {
    const supabase = createServiceClient();

    const { data: po, error: poErr } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", id)
        .single();

    if (poErr || !po) return null;

    const { data: lines } = await supabase
        .from("purchase_order_lines")
        .select("*")
        .eq("po_id", id)
        .order("id");

    return { ...po, lines: lines ?? [] };
}

export async function dbCreatePurchaseOrder(
    input: CreatePurchaseOrderInput,
): Promise<{ id: string; po_number: string }> {
    const supabase = createServiceClient();

    const { data, error } = await supabase.rpc("create_purchase_order_with_lines", {
        p_vendor_id:     input.vendorId,
        p_expected_date: input.expectedDate ?? null,
        p_currency:      input.currency,
        p_notes:         input.notes ?? null,
        p_lines:         input.lines,
        p_actor:         input.createdBy ?? "system",
    });

    if (error || !data?.[0]) throw new Error(error?.message ?? "PO oluşturulamadı.");
    return { id: data[0].po_id, po_number: data[0].po_number };
}

export async function dbReplacePurchaseOrderLines(
    poId: string,
    lines: CreatePurchaseOrderLine[],
    actor: string,
): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("replace_purchase_order_lines", {
        p_po_id:  poId,
        p_lines:  lines,
        p_actor:  actor,
    });
    if (error) throw new Error(error.message);
}

export async function dbTransitionPurchaseOrder(
    id: string,
    next: PurchaseOrderStatus,
    opts?: { reason?: string; actor?: string },
): Promise<void> {
    const supabase = createServiceClient();
    const actor = opts?.actor ?? "system";

    const { data: po } = await supabase
        .from("purchase_orders")
        .select("status")
        .eq("id", id)
        .single();

    if (!po) throw new Error("PO bulunamadı.");

    const current = po.status as PurchaseOrderStatus;
    if (!VALID_PO_TRANSITIONS[current].includes(next)) {
        throw new Error(`Geçersiz durum geçişi: ${current} → ${next}`);
    }

    if (next === "confirmed") {
        const { error } = await supabase.rpc("confirm_po", { p_po_id: id, p_actor: actor });
        if (error) throw new Error(error.message);
        return;
    }

    if (next === "cancelled") {
        const { error } = await supabase.rpc("cancel_po", {
            p_po_id:   id,
            p_reason:  opts?.reason ?? "",
            p_actor:   actor,
        });
        if (error) throw new Error(error.message);
        return;
    }

    // partially_received/received: sadece receive_po_lines RPC (Faz 5) yazabilir;
    // manuel transition akışında set edilmemeli.
    if (next === "partially_received" || next === "received") {
        throw new Error("Bu durum sadece mal kabul akışından (receive_po_lines RPC) geçilir.");
    }

    // sent, draft (M1 revize) → direct UPDATE + compare-and-set (race koruması)
    const updatePayload: Record<string, unknown> = { status: next };
    if (next === "sent") updatePayload.sent_at = new Date().toISOString();
    if (next === "draft" && current === "sent") updatePayload.sent_at = null;  // M1 revize

    const { data: updated, error } = await supabase
        .from("purchase_orders")
        .update(updatePayload)
        .eq("id", id)
        .eq("status", current)        // CAS: durum bu sırada değişmediyse uygula
        .select("id");

    if (error) throw new Error(error.message);
    if (!updated || updated.length === 0) {
        throw new Error("PO durum geçişi başarısız: durum bu sırada değişmiş (yarış).");
    }

    await supabase.from("audit_log").insert({
        action:      next === "draft" ? "po_revised" : `po_${next}`,
        entity_type: "purchase_order",
        entity_id:   id,
        after_state: { status: next },
        source:      "ui",
        actor,
    });
}

const PO_CURRENCY_WHITELIST = ["TRY", "USD", "EUR"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** PO currency whitelist guard. DB CHECK aynı listeyi enforce eder; bu helper 400'e map için. */
export function isValidPoCurrency(c: unknown): c is typeof PO_CURRENCY_WHITELIST[number] {
    return typeof c === "string" && (PO_CURRENCY_WHITELIST as readonly string[]).includes(c);
}

/** JS-side line validation: DB CHECK / cast hatalarını 500 yerine 400'e map etmek için.
 * `product_id` non-empty + UUID format, `quantity > 0` integer, `unit_price >= 0`,
 * `discount_pct ∈ [0,100]`. `Number(null)===0` ve `Number("")===0` tuzakları için
 * sayısal alanlar null/undefined/empty string olamaz (silent 0'a düşüşü engeller). */
export function validatePoLines(raw: unknown): string | null {
    if (!Array.isArray(raw)) return "Line listesi geçerli değil.";
    if (raw.length === 0) return "En az 1 line gereklidir.";
    for (const [i, line] of raw.entries()) {
        if (!line || typeof line !== "object") return `Line ${i + 1}: geçersiz nesne.`;
        const l = line as Record<string, unknown>;

        if (typeof l.product_id !== "string" || !l.product_id.trim())
            return `Line ${i + 1}: product_id zorunludur.`;
        if (!UUID_RE.test(l.product_id.trim()))
            return `Line ${i + 1}: product_id geçerli UUID olmalıdır.`;

        if (l.quantity === undefined || l.quantity === null || l.quantity === "")
            return `Line ${i + 1}: miktar zorunludur.`;
        const qty = Number(l.quantity);
        if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0)
            return `Line ${i + 1}: miktar pozitif tam sayı olmalıdır.`;

        if (l.unit_price === undefined || l.unit_price === null || l.unit_price === "")
            return `Line ${i + 1}: birim fiyat zorunludur.`;
        const price = Number(l.unit_price);
        if (!Number.isFinite(price) || price < 0)
            return `Line ${i + 1}: birim fiyat geçersiz veya negatif olamaz.`;

        if (l.discount_pct !== undefined && l.discount_pct !== null) {
            if (l.discount_pct === "")
                return `Line ${i + 1}: iskonto geçersiz (boş bırakılamaz; alan tamamen kaldırılmalı).`;
            const d = Number(l.discount_pct);
            if (!Number.isFinite(d) || d < 0 || d > 100)
                return `Line ${i + 1}: iskonto 0-100 arası olmalıdır.`;
        }

        // Faz 6 zemini: source_recommendation_ids opsiyonel; verildiyse array of UUID olmalı.
        // Defense-in-depth — Faz 6 service'i server-generated UUID kullanır ama API boundary'de her şey doğrulanır.
        if (l.source_recommendation_ids !== undefined && l.source_recommendation_ids !== null) {
            if (!Array.isArray(l.source_recommendation_ids))
                return `Line ${i + 1}: source_recommendation_ids array olmalıdır.`;
            for (const [j, rid] of l.source_recommendation_ids.entries()) {
                if (typeof rid !== "string" || !UUID_RE.test(rid))
                    return `Line ${i + 1}: source_recommendation_ids[${j}] geçerli UUID olmalıdır.`;
            }
        }
    }
    return null;
}

export async function dbPatchPurchaseOrder(
    id: string,
    patch: { expected_date?: string | null; notes?: string | null; currency?: string },
): Promise<PurchaseOrderRow> {
    const supabase = createServiceClient();

    const { data, error } = await supabase
        .from("purchase_orders")
        .update(patch)
        .eq("id", id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("PO bulunamadı.");
    return data;
}
