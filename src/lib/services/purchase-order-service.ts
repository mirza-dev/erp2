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
    dbSetVendorInvoiceIdentity,
} from "@/lib/supabase/purchase-orders";
import { dbListRecommendations, dbUpdateRecommendationStatus } from "@/lib/supabase/recommendations";
import { dbTryResolveShortages } from "@/lib/supabase/products";
import { serviceRunAlertScan } from "@/lib/services/alert-scan-runner";

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
    // Paraşüt alış faturası (Faz 13) — satıştaki `ship` tetiğinin aynası.
    // YALNIZ tamamen mal kabul edildiğinde: kısmi kabulde PO toplamını gider
    // yazmak muhasebeyi yanıltırdı. Best-effort — Paraşüt hatası mal kabulü
    // ve stok hareketini GERİ ALMAZ; CRON emniyet ağı tekrar dener.
    if (po.status === "received") {
        try {
            const { serviceSyncPurchaseOrderToParasut } = await import("@/lib/services/parasut-purchase-service");
            await serviceSyncPurchaseOrderToParasut(po.id).catch(() => { /* best-effort */ });
        } catch { /* modül yüklenemese bile mal kabul bozulmaz */ }
    }

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
    /**
     * KOBİ-sim K2 — tedarikçi fatura künyesi yazılamadıysa true.
     *
     * Künye yazımı bilinçli olarak mal kabulden SONRA ve non-fatal: fatura
     * numarası hatası stok hareketini geri almamalı. Ama eskiden hata tamamen
     * yutuluyordu → kullanıcı "kaydedildi" görüyor, indirilecek KDV'nin resmî
     * künyesi sessizce kayboluyordu. Özellikle mig.107 uygulanmamışsa (kolonlar
     * yok) HER yazım sessizce düşerdi. Artık uyarı UI'a taşınır
     * (`archiveWarning` / `reservationWarning` kalıbı).
     */
    invoiceWarning?: boolean;
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
export interface VendorInvoiceIdentity {
    /** Tedarikçinin KENDİ fatura numarası — KDV indiriminin resmî künyesi. */
    vendor_invoice_no?:   string | null;
    /** Tedarikçi faturasının tarihi (YYYY-MM-DD) — KDV dönemini belirler. */
    vendor_invoice_date?: string | null;
}

export async function serviceReceivePOLines(
    id: string,
    lines: ReceivePOLine[],
    actor?: string,
    invoice?: VendorInvoiceIdentity,
): Promise<ReceiveResult> {
    await dbReceivePurchaseOrderLines(id, lines, actor ?? "system");

    // Tedarikçi fatura künyesi — fatura fiziksel olarak malla birlikte gelir,
    // bu yüzden mal kabul anında yazılır. Stok hareketinden SONRA yazılması
    // bilinçli: künye yazımı başarısız olsa bile mal kabul geçerli kalmalı.
    let invoiceWarning = false;
    if (invoice && (invoice.vendor_invoice_no || invoice.vendor_invoice_date)) {
        try {
            await dbSetVendorInvoiceIdentity(id, invoice);
        } catch (err) {
            console.error(JSON.stringify({ po_vendor_invoice_write_fail: String(err), poId: id }));
            invoiceWarning = true;
        }
    }

    const po = await dbGetPurchaseOrderById(id);
    if (!po) throw new Error("PO bulunamadı.");

    // Mal kabulü gelen ürünlerin stoğunu artırdı → bu ürünler için açık shortage'ları
    // FIFO çöz (inventory/movements + production-service ile aynı best-effort kalıp).
    // try_resolve_shortages tüm shortage'ı çözülen siparişi partially_allocated→allocated
    // yükseltir (mig.008) → PO ile tedarik edilen onaylı sipariş artık sevk edilebilir.
    // Aksi halde sipariş partially_allocated'da kalıcı sıkışırdı (denetim Y1).
    try {
        const receivedLineIds = new Set(lines.map((l) => l.line_id));
        const productIds = new Set(
            po.lines.filter((pl) => receivedLineIds.has(pl.id)).map((pl) => pl.product_id),
        );
        for (const pid of productIds) {
            await dbTryResolveShortages(pid);
        }
    } catch {
        // fire-and-forget; yeniden tahsisat başarısız olsa mal kabul bozulmaz
    }

    // KOBİ-sim Y5 — mal kabul sonrası uyarı taraması.
    //
    // Eskiden burada kendi sunucumuza HTTP atılıyordu:
    //   fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/alerts/scan`, …)
    // `NEXT_PUBLIC_APP_URL` set değilken URL göreli kalıyor, Node fetch bunu
    // ayrıştıramayıp FIRLATIYOR ve aşağıdaki boş catch yutuyordu → tarama HİÇ
    // koşmuyordu. Sonuç: tamamen teslim alınmış PO'nun "geciken tedarik"
    // uyarısı ekranda kalıyordu (Sibel, Gün 5).
    //
    // Artık servis doğrudan çağrılıyor: env bağımlılığı ve bir ağ turu yok,
    // advisory lock semantiği korunuyor. best-effort — tarama patlasa da mal
    // kabul geçerlidir.
    try {
        await serviceRunAlertScan();
    } catch (scanErr) {
        console.error("[po-receive] alert scan başarısız (non-fatal)", scanErr);
    }

    return { id: po.id, status: po.status, ...(invoiceWarning ? { invoiceWarning: true } : {}) };
}
