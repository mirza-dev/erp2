import { createServiceClient } from "./service";
import type { QuoteRow, QuoteStatus, QuoteWithLines } from "@/lib/database.types";

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateQuoteLineInput {
    position: number;
    product_id?: string | null;
    product_code: string;
    lead_time?: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    hs_code?: string;
    weight_kg?: number;
    // Faz 4a (2026-05-23): PMT formunda "Ölçü / Size" kolonu (serbest text).
    size_text?: string;
    // Faz 1a (V3-B5, V4-A7): birim ağırlık + KG manuel override flag.
    unit_weight_kg?: number;
    kg_manual_override?: boolean;
    // 098: satır bazlı serbest "Not" (description'dan AYRI; saf açıklayıcı).
    note?: string | null;
    // 099: satır bazlı ölçü birimi (adet/metre/kg…); boş → NULL.
    unit?: string | null;
}

export interface CreateQuoteInput {
    quote_number?: string;          // import flow'da belirtilirse DB default'u override eder
    customer_id?: string | null;
    customer_name: string;
    customer_contact?: string;
    customer_phone?: string;
    customer_email?: string;
    // Faz 1a (V4-A2): müşteri adresi snapshot.
    customer_address?: string;
    sales_rep?: string;
    sales_phone?: string;
    sales_email?: string;
    currency: string;
    vat_rate: number;
    subtotal: number;
    vat_total: number;
    grand_total: number;
    // Faz 3 (V7): header iskonto (KDV matrahından düşülür). dbCreate/dbUpdate
    // header'ı RPC'ye spread eder → payload otomatik geçer.
    discount_amount: number;
    notes?: string;
    sig_prepared?: string;
    sig_approved?: string;
    sig_manager?: string;
    quote_date?: string;
    valid_until?: string;
    // Faz 4a (2026-05-23): PMT brand teklif formunda "Teslimat Şekli" + "Ödeme Şekli".
    delivery_method?: string;
    payment_method?: string;
    // Faz 1a (V4-A3): satıcı (PMT) snapshot — sent'te dondurulur.
    seller_name?: string;
    seller_phone?: string;
    seller_email?: string;
    seller_address?: string;
    seller_tax_id?: string;
    seller_website?: string;
    seller_logo_url?: string;
    lines: CreateQuoteLineInput[];
}

// ── DB functions ──────────────────────────────────────────────────────────────

export async function dbCreateQuote(input: CreateQuoteInput): Promise<QuoteWithLines> {
    const sb = createServiceClient();
    const { lines, ...header } = input;
    const { data: quoteId, error } = await sb.rpc("create_quote_with_lines", {
        p_header: { ...header, updated_at: new Date().toISOString() },
        p_lines: lines,
    });
    if (error) throw error;
    const created = (await dbGetQuote(quoteId as string))!;
    // Faz 8c: quotes audit katmanı (helper seviyesi — product-types/vendors paterni;
    // best-effort, actor'sız [codebase audit'leri actor yakalamıyor → tutarlı]).
    await sb.from("audit_log").insert({
        action: "quote_created",
        entity_type: "quote",
        entity_id: created.id,
        after_state: { quote_number: created.quote_number, status: created.status, grand_total: created.grand_total },
        source: "ui",
    });
    return created;
}

export async function dbGetQuote(id: string): Promise<QuoteWithLines | null> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("quotes")
        .select("*, quote_line_items(*)")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const lines = ((data.quote_line_items ?? []) as QuoteWithLines["lines"])
        .slice()
        .sort((a, b) => a.position - b.position);
    const { quote_line_items: _, ...rest } = data;
    return { ...rest, lines } as QuoteWithLines;
}

export async function dbListQuotes(filter: { status?: string; page?: number } = {}): Promise<QuoteRow[]> {
    const sb = createServiceClient();
    const PAGE_SIZE = 20;
    const from = ((filter.page ?? 1) - 1) * PAGE_SIZE;

    let q = sb
        .from("quotes")
        .select("id, quote_number, status, customer_name, currency, grand_total, quote_date, valid_until, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    if (filter.status) q = q.eq("status", filter.status);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as QuoteRow[];
}

export async function dbUpdateQuote(
    id: string,
    input: Omit<CreateQuoteInput, "lines"> & { lines: CreateQuoteLineInput[] }
): Promise<QuoteWithLines> {
    const sb = createServiceClient();
    const { lines, ...header } = input;
    const { error } = await sb.rpc("update_quote_with_lines", {
        p_id: id,
        p_header: { ...header, updated_at: new Date().toISOString() },
        p_lines: lines,
    });
    if (error) throw error;
    const updated = (await dbGetQuote(id))!;
    // Faz 8c: audit (helper seviyesi, best-effort).
    await sb.from("audit_log").insert({
        action: "quote_updated",
        entity_type: "quote",
        entity_id: id,
        after_state: { quote_number: updated.quote_number, status: updated.status, grand_total: updated.grand_total },
        source: "ui",
    });
    return updated;
}

export async function dbDeleteQuote(id: string, actor?: string | null): Promise<void> {
    const sb = createServiceClient();
    // Faz 6: before-snapshot silmeden ÖNCE; audit yalnız silme BAŞARILI olunca
    // (yalan "quote_deleted" audit'i önlenir — diğer delete helper'larıyla tutarlı).
    const { data: existing } = await sb
        .from("quotes").select("*").eq("id", id).maybeSingle();
    const { error } = await sb.from("quotes").delete().eq("id", id);
    if (error) throw error;
    if (existing) {
        await sb.from("audit_log").insert({
            actor: actor ?? null,
            action: "quote_deleted",
            entity_type: "quote",
            entity_id: id,
            before_state: existing,
            source: "ui",
        });
    }
}

export async function dbUpdateQuoteStatus(
    id: string,
    status: QuoteStatus,
    expectedCurrentStatus: QuoteStatus
): Promise<boolean> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("quotes")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("status", expectedCurrentStatus)
        .select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
}

export async function dbListExpiredQuotes(): Promise<QuoteRow[]> {
    const sb = createServiceClient();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { data, error } = await sb
        .from("quotes")
        .select("id, quote_number, status, customer_name, valid_until, created_at, updated_at")
        .in("status", ["draft", "sent"])
        .not("valid_until", "is", null)
        .lt("valid_until", todayStr);
    if (error) throw error;
    return (data ?? []) as unknown as QuoteRow[];
}

export async function dbFindQuoteByNumber(quoteNumber: string): Promise<QuoteRow | null> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("quotes")
        .select("*")
        .eq("quote_number", quoteNumber)
        .maybeSingle();
    if (error) throw error;
    return data as QuoteRow | null;
}

/**
 * Faz 5: create_quote_revision RPC (074) — kaynak teklifin düzenlenebilir
 * kopyasını yaratır (atomik), kaynağı 'revised' yapar. Yeni quote id döner.
 * RPC hata kodları service katmanında map'lenir (42501=invalid status, P0002=not found).
 */
export async function dbCreateQuoteRevision(sourceId: string): Promise<string> {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("create_quote_revision", { p_source_id: sourceId });
    if (error) throw error;
    const newQuoteId = data as string;
    // Faz 8c: audit (helper seviyesi, best-effort). entity = kaynak teklif; after_state
    // yeni revizyon teklifine işaret eder.
    await sb.from("audit_log").insert({
        action: "quote_revised",
        entity_type: "quote",
        entity_id: sourceId,
        after_state: { new_quote_id: newQuoteId, source_quote_id: sourceId },
        source: "ui",
    });
    return newQuoteId;
}

/**
 * Faz 5: revizyon zincirinin tüm üyeleri (kök + revizyonlar), revision_no artan.
 * root = coalesce(root_quote_id, id). Detail enrichment (revisedBy/revisionOf) için.
 */
export async function dbListQuoteChain(rootId: string): Promise<Array<Pick<QuoteRow, "id" | "quote_number" | "revision_no" | "status">>> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("quotes")
        .select("id, quote_number, revision_no, status")
        .or(`id.eq.${rootId},root_quote_id.eq.${rootId}`)
        .order("revision_no", { ascending: true });
    if (error) throw error;
    return (data ?? []) as Array<Pick<QuoteRow, "id" | "quote_number" | "revision_no" | "status">>;
}

/** Faz 6 (V5-A4): accept_quote_and_create_order RPC dönüşü. */
export interface AcceptOrderResult {
    order_id: string;
    order_number: string;
    /** Bu teklif için sipariş zaten vardı (idempotent — yeni üretilmedi). */
    already: boolean;
}

/**
 * Faz 6 (V7): kabul edilen teklifi TEK atomik transaction'da taslak siparişe
 * dönüştürür (077). RPC hata kodları (P0002/42501/23502/22003/23514) servis
 * katmanında HTTP'ye map'lenir. p_actor null olabilir (created_by/audit NULL).
 */
export async function dbAcceptQuoteAndCreateOrder(
    quoteId: string,
    actor: string | null,
): Promise<AcceptOrderResult> {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("accept_quote_and_create_order", {
        p_quote_id: quoteId,
        p_actor: actor,
    });
    if (error) throw error;
    return data as AcceptOrderResult;
}

/** Teklif gönderilince yaratılan bekleyen sipariş + rezervasyon sonucu (088). */
export interface SendQuoteOrderResult {
    order_id: string;
    order_number: string;
    /** Bu teklif için (cancelled olmayan) sipariş zaten vardı → yeniden yaratılmadı. */
    already: boolean;
    /** allocate_order_lines shortage listesi (kısmi/yetersiz rezerve). */
    shortages: Array<{ product_name: string; requested: number; reserved: number; shortage: number }>;
    total_reserved: number;
    total_requested: number;
}

/**
 * Teklif GÖNDERİLİNCE (088): bağlı 'pending_approval' sipariş yaratır + stok HARD
 * rezerve eder (allocate_order_lines). Servis quote'u önce 'sent'e flip eder, sonra
 * bunu çağırır. İdempotent: cancelled-olmayan sipariş varsa onu döndürür. RPC hata
 * kodları (P0002/42501/23502/22003) servis katmanında map'lenir. Zero-stock'ta RAISE
 * ETMEZ — kısmi rezerve + shortage döner (teklif yine gönderilir).
 */
export async function dbSendQuoteCreatePendingOrder(
    quoteId: string,
    actor: string | null,
): Promise<SendQuoteOrderResult> {
    const sb = createServiceClient();
    const { data, error } = await sb.rpc("send_quote_and_create_pending_order", {
        p_quote_id: quoteId,
        p_actor: actor,
    });
    if (error) throw error;
    return data as SendQuoteOrderResult;
}

/**
 * Teklife bağlı bekleyen siparişi iptal eder (088) → rezerv release. reject/expire/
 * revise yollarından çağrılır. Bağlı (cancelled olmayan) sipariş yoksa no-op
 * (`no_order: true`). cancel_order'ın shipped guard'ı korunur (sevk başlamışsa iptal
 * etmez — döndürdüğü success:false best-effort olarak yutulur, caller throw etmez).
 */
export async function dbCancelQuoteLinkedOrder(quoteId: string): Promise<void> {
    const sb = createServiceClient();
    const { error } = await sb.rpc("cancel_quote_linked_order", { p_quote_id: quoteId });
    if (error) throw error;
}

// ── Rezervasyon reconciler sorguları (denetim K4+Y3, 2026-06) ───────────────

export interface QuoteReservationMismatches {
    /** status=sent ama bağlı (cancelled olmayan) sipariş YOK → rezervasyon kaçmış. */
    sentWithoutOrder: Array<{ id: string; quote_number: string }>;
    /** status=rejected/expired ama bağlı pending_approval sipariş YAŞIYOR → phantom rezerv. */
    terminalWithActiveOrder: Array<{ id: string; quote_number: string; status: string }>;
}

/**
 * Send/reject yollarının best-effort yan etkileri başarısız kaldığında oluşan
 * iki yönlü tutarsızlığı listeler (alert-scan reconciler'ı tüketir):
 *  - sent + linked-order-yok  → dbSendQuoteCreatePendingOrder ile onarılır
 *  - terminal + pending-order → dbCancelQuoteLinkedOrder ile bırakılır
 */
export async function dbListQuoteReservationMismatches(): Promise<QuoteReservationMismatches> {
    const sb = createServiceClient();

    const [{ data: sent, error: e1 }, { data: terminal, error: e2 }] = await Promise.all([
        sb.from("quotes").select("id, quote_number").eq("status", "sent"),
        sb.from("quotes").select("id, quote_number, status").in("status", ["rejected", "expired"]),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);

    const allIds = [...(sent ?? []), ...(terminal ?? [])].map((q) => q.id);
    if (allIds.length === 0) return { sentWithoutOrder: [], terminalWithActiveOrder: [] };

    const { data: orders, error: e3 } = await sb
        .from("sales_orders")
        .select("quote_id, commercial_status")
        .in("quote_id", allIds)
        .neq("commercial_status", "cancelled");
    if (e3) throw new Error(e3.message);

    const hasOrder = new Set((orders ?? []).map((o) => o.quote_id));
    const hasPending = new Set(
        (orders ?? [])
            .filter((o) => o.commercial_status === "pending_approval")
            .map((o) => o.quote_id),
    );

    return {
        sentWithoutOrder: (sent ?? []).filter((q) => !hasOrder.has(q.id)),
        terminalWithActiveOrder: (terminal ?? []).filter((q) => hasPending.has(q.id)),
    };
}
