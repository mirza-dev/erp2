import {
    dbGetPurchaseOrderById,
    dbTransitionPurchaseOrder,
    dbReceivePurchaseOrderLines,
    dbCreatePurchaseOrder,
    dbGetPOsByRecommendationIds,
    type PurchaseOrderStatus,
    type ReceivePOLine,
    type CreatePurchaseOrderLine,
    VALID_PO_TRANSITIONS,
} from "@/lib/supabase/purchase-orders";
import { dbListRecommendations, dbUpdateRecommendationStatus } from "@/lib/supabase/recommendations";

export { VALID_PO_TRANSITIONS };

export interface TransitionResult {
    id: string;
    status: PurchaseOrderStatus;
}

/** Generic state machine transition — validates and delegates to helper. */
export async function serviceTransitionPO(
    id: string,
    next: PurchaseOrderStatus,
    opts?: { reason?: string; actor?: string },
): Promise<TransitionResult> {
    await dbTransitionPurchaseOrder(id, next, opts);
    const po = await dbGetPurchaseOrderById(id);
    if (!po) throw new Error("PO bulunamadı.");
    return { id: po.id, status: po.status };
}

/** Mark PO as sent (draft → sent). */
export async function serviceSendPO(id: string, actor?: string): Promise<TransitionResult> {
    return serviceTransitionPO(id, "sent", { actor });
}

/** Confirm PO (draft|sent → confirmed) — delegates to confirm_po RPC (B4 guards). */
export async function serviceConfirmPO(id: string, actor?: string): Promise<TransitionResult> {
    return serviceTransitionPO(id, "confirmed", { actor });
}

/** Cancel PO from any active state (admin only). */
export async function serviceCancelPO(
    id: string,
    reason: string,
    actor?: string,
): Promise<TransitionResult> {
    return serviceTransitionPO(id, "cancelled", { reason, actor });
}

/** Revise: sent → draft, clears sent_at (M1). */
export async function serviceRevisePO(id: string, actor?: string): Promise<TransitionResult> {
    return serviceTransitionPO(id, "draft", { actor });
}

export interface ReceiveResult {
    id: string;
    status: PurchaseOrderStatus;
}

export interface CreatePOFromRecsLine {
    recommendation_id: string;
    quantity: number;
    unit_price: number;
    discount_pct?: number;
    notes?: string | null;
}

export interface CreatePOFromRecsInput {
    vendor_id: string;
    expected_date?: string | null;
    currency: string;
    notes?: string | null;
    lines: CreatePOFromRecsLine[];
}

export async function serviceCreatePOFromRecommendations(
    input: CreatePOFromRecsInput,
    actor?: string,
): Promise<{ id: string; po_number: string }> {
    const recIds = input.lines.map(l => l.recommendation_id);
    const recs = await dbListRecommendations({
        statusIn: ["suggested", "accepted", "edited"],
    });
    const recMap = new Map(recs.map(r => [r.id, r]));

    const poLines: CreatePurchaseOrderLine[] = [];
    const recsToAccept: Array<{ id: string; editedQty?: number }> = [];

    for (const line of input.lines) {
        const rec = recMap.get(line.recommendation_id);
        if (!rec)
            throw new Error(`Öneri bulunamadı veya geçersiz statüde: ${line.recommendation_id}`);
        if (rec.recommendation_type !== "purchase_suggestion")
            throw new Error(`Öneri purchase_suggestion türünde değil: ${line.recommendation_id}`);
        if (rec.entity_type !== "product" || !rec.entity_id)
            throw new Error(`Öneri ürün ile ilişkili değil: ${line.recommendation_id}`);

        poLines.push({
            product_id: rec.entity_id,
            quantity: line.quantity,
            unit_price: line.unit_price,
            discount_pct: line.discount_pct ?? 0,
            notes: line.notes ?? null,
            source_recommendation_ids: [line.recommendation_id],
        });

        if (rec.status === "suggested") {
            const meta = rec.metadata as Record<string, unknown> | null;
            const metaSuggest = typeof meta?.suggestQty === "number" ? meta.suggestQty : null;
            const isEdited = metaSuggest !== null && line.quantity !== metaSuggest;
            recsToAccept.push({ id: rec.id, editedQty: isEdited ? line.quantity : undefined });
        }
    }

    // Validate all rec IDs were found
    for (const recId of recIds) {
        if (!recMap.has(recId)) {
            throw new Error(`Öneri bulunamadı: ${recId}`);
        }
    }

    // Duplicate PO guard: cancelled PO'su olan rec yeniden bağlanabilir (re-order); diğerleri reddedilir.
    const linkedMap = await dbGetPOsByRecommendationIds(recIds);
    for (const recId of recIds) {
        const linked = linkedMap.get(recId) ?? [];
        const activePO = linked.find(po => po.status !== "cancelled");
        if (activePO) {
            throw new Error(
                `Öneri zaten aktif siparişe bağlı: PO ${activePO.po_number} (${activePO.status}). ` +
                `Yeni sipariş açmak için önce mevcut siparişi iptal edin.`,
            );
        }
    }

    const result = await dbCreatePurchaseOrder({
        vendorId: input.vendor_id,
        expectedDate: input.expected_date,
        currency: input.currency,
        notes: input.notes,
        lines: poLines,
        createdBy: actor,
    });

    for (const r of recsToAccept) {
        try {
            await dbUpdateRecommendationStatus(
                r.id,
                r.editedQty != null ? "edited" : "accepted",
                r.editedQty != null ? { editedMetadata: { suggestQty: r.editedQty } } : undefined,
            );
        } catch {
            // best-effort — PO başarılı olduğu için rec patch fail'i ileride düzeltilir
        }
    }

    return result;
}

/** PO mal kabul (kısmi destekli). receive_po_lines RPC + best-effort alert scan tetikler. */
export async function serviceReceivePOLines(
    id: string,
    lines: ReceivePOLine[],
    actor?: string,
): Promise<ReceiveResult> {
    await dbReceivePurchaseOrderLines(id, lines, actor ?? "system");

    // best-effort: hata olsa da mal kabul başarılıdır
    try {
        await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/alerts/scan`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${process.env.CRON_SECRET ?? ""}`,
            },
        });
    } catch {
        // fire-and-forget; alert scan başarısız olsa kabul işlemi bozulmaz
    }

    const po = await dbGetPurchaseOrderById(id);
    if (!po) throw new Error("PO bulunamadı.");
    return { id: po.id, status: po.status };
}
