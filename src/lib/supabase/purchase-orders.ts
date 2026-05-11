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

    // sent, draft (M1 revize), partially_received, received → direct UPDATE
    const updatePayload: Record<string, unknown> = { status: next };
    if (next === "sent") updatePayload.sent_at = new Date().toISOString();
    if (next === "draft" && current === "sent") updatePayload.sent_at = null;  // M1 revize

    const { error } = await supabase
        .from("purchase_orders")
        .update(updatePayload)
        .eq("id", id);

    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
        action:      next === "draft" ? "po_revised" : `po_${next}`,
        entity_type: "purchase_order",
        entity_id:   id,
        after_state: { status: next },
        source:      "ui",
        actor,
    });
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
