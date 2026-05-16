import {
    dbGetPurchaseOrderById,
    dbTransitionPurchaseOrder,
    dbReceivePurchaseOrderLines,
    type PurchaseOrderStatus,
    type ReceivePOLine,
    VALID_PO_TRANSITIONS,
} from "@/lib/supabase/purchase-orders";

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
