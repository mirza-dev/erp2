/**
 * Quote Service — business logic layer for quote status lifecycle.
 * serviceTransitionQuote geçişleri: draft→sent, sent→rejected.
 * accepted Faz 6'da bu transition'dan çıkarıldı → atomik /accept yolu
 * (serviceAcceptQuoteToOrder + RPC 077). Terminal: accepted, rejected,
 * expired (CRON-only), revised (Faz 5).
 */

import { createHash } from "crypto";
import { localISODate } from "@/lib/stock-utils";
import type { QuoteStatus } from "@/lib/database.types";
import { dbGetQuote, dbUpdateQuoteStatus, dbListExpiredQuotes, dbCreateQuoteRevision, dbAcceptQuoteAndCreateOrder, dbSendQuoteCreatePendingOrder, dbCancelQuoteLinkedOrder, dbListQuoteReservationMismatches } from "@/lib/supabase/quotes";
import type { SendQuoteOrderResult } from "@/lib/supabase/quotes";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { dbGetQuoteArchive, dbCreateQuoteArchive, dbArchiveObjectStatus, dbDeleteQuoteArchive } from "@/lib/supabase/quote-pdf-archives";
import { buildQuoteDataFromDetail, renderQuoteArchiveHtml } from "@/lib/quote-archive-html";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { validateQuoteForSend, validateQuoteLineQuantities } from "@/lib/quote-validation";
import { sendDirectEmail } from "@/lib/services/email-service";
import { renderQuoteToCustomer } from "@/lib/email/templates";
import { dbCreateEmailLog, dbUpdateEmailLogStatus } from "@/lib/supabase/email-logs";
import { dbCreateAlert, dbResolveAlertsForEntity } from "@/lib/supabase/alerts";

// ── Types ────────────────────────────────────────────────────

// Faz 6 (V4-A8): "accepted" transition kaldırıldı — accept artık atomik
// POST /api/quotes/[id]/accept (serviceAcceptQuoteToOrder). Bu yol yalnız
// draft→sent ve sent→rejected geçişlerini yönetir.
export type QuoteTransition = "sent" | "rejected";

export interface QuoteTransitionResult {
    success: boolean;
    error?: string;
    notFound?: boolean;
    /** Faz 2 (V4-A2/V4-A4): send-time validasyon ihlali → route 422 maps. */
    validationFailed?: boolean;
    /** Faz 4: send başarılı ama arşiv üretilemedi → UI warning toast (sessiz değil). */
    archiveWarning?: boolean;
    /** 088: send başarılı ama bekleyen sipariş/rezervasyon yaratılamadı → UI warning. */
    reservationWarning?: boolean;
    /** 088: send sonrası bağlı siparişin stok kısmi/yetersiz rezerve shortage listesi. */
    shortages?: SendQuoteOrderResult["shortages"];
    /** 088: send'te yaratılan bekleyen siparişin numarası (UI bilgi/toast). */
    reservedOrderNumber?: string;
}

// ── Transition map ───────────────────────────────────────────

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
    draft:    ["sent"],
    sent:     ["rejected"],   // Faz 6: accepted ayrı atomik yol (/accept)
    accepted: [],
    rejected: [],
    expired:  [],
    revised:  [],   // Faz 5: terminal — revize edilmiş kaynak (geçiş yok)
};

export function isValidQuoteTransition(from: QuoteStatus, to: QuoteStatus): boolean {
    return QUOTE_TRANSITIONS[from]?.includes(to) ?? false;
}

// ── Status Transition ────────────────────────────────────────

export async function serviceTransitionQuote(
    quoteId: string,
    transition: QuoteTransition
): Promise<QuoteTransitionResult> {
    const quote = await dbGetQuote(quoteId);
    if (!quote) return { success: false, error: "Teklif bulunamadı.", notFound: true };

    const target = transition as QuoteStatus;
    if (!isValidQuoteTransition(quote.status, target)) {
        return {
            success: false,
            error: `'${quote.status}' durumundaki teklif '${target}' durumuna geçirilemez.`,
        };
    }

    // Faz 2 (V4-A2/V4-A4/V7-A11): sent'e geçmeden önce müşteri adresi + her gerçek
    // kalemin ürüne bağlı olduğu + adet pozitif tam sayı hard check. qty kontrolü
    // burada da çalışır (defense-in-depth): legacy/pre-Faz-2 draft'lar POST/PATCH
    // qty guard'ından geçmemiş olabilir → küsüratlı/0 adetli teklif sent OLAMAZ.
    // Soft GTİP uyarısı formda kalır.
    if (target === "sent") {
        const qtyErr = validateQuoteLineQuantities(quote.lines);
        if (qtyErr) return { success: false, error: qtyErr, validationFailed: true };
        const vErr = validateQuoteForSend(quote);
        if (vErr) return { success: false, error: vErr, validationFailed: true };
    }

    const updated = await dbUpdateQuoteStatus(quoteId, target, quote.status as QuoteStatus);
    if (!updated) {
        return { success: false, error: "Teklif durumu eşzamanlı olarak değiştirilmiş. Sayfayı yenileyip tekrar deneyin." };
    }

    // Faz 4 (V7-A5): send anında dondurulmuş HTML arşivi üret. NON-FATAL —
    // arşiv başarısız olsa da send başarılı kalır (eksik arşiv Faz 6 accept'te
    // recover/generate ile telafi edilir), AMA SESSİZ DEĞİL: archiveWarning flag'i
    // route → UI'a taşınır (warning toast). Kullanıcı kararı (2026-05-30): A.
    let archiveWarning = false;
    if (target === "sent") {
        try {
            await serviceArchiveQuotePdf(quoteId);
        } catch (err) {
            console.error(`[quote-archive] sent arşivi başarısız (quote ${quoteId}):`, err);
            archiveWarning = true;
        }
    }

    // 088: teklif gönderilince stok HARD rezerve → bağlı 'pending_approval' sipariş
    // yarat (oversell önleme; ürün-sahibi kararı). Rezervasyon asıl amaç olduğundan
    // başarısızlık SESSİZ DEĞİL — reservationWarning UI'a taşınır (archiveWarning paterni).
    // status zaten 'sent'e flip oldu; RPC idempotent (yeniden denenebilir).
    let reservationWarning = false;
    let shortages: SendQuoteOrderResult["shortages"] | undefined;
    let reservedOrderNumber: string | undefined;
    if (target === "sent") {
        try {
            const res = await dbSendQuoteCreatePendingOrder(quoteId, null);
            reservedOrderNumber = res.order_number;
            if (res.shortages && res.shortages.length > 0) shortages = res.shortages;
        } catch (err) {
            console.error(`[quote-reserve] sent rezervasyonu başarısız (quote ${quoteId}):`, err);
            reservationWarning = true;
        }
    }

    // sent→rejected: bağlı bekleyen siparişi iptal et → rezerv release (088).
    // Best-effort: release başarısızlığı reddetme geçişini bozmaz (status zaten flip).
    if (target === "rejected") {
        try {
            await dbCancelQuoteLinkedOrder(quoteId);
        } catch (err) {
            console.error(`[quote-reserve] reddetmede bağlı sipariş iptali başarısız (quote ${quoteId}):`, err);
        }
    }

    // Bilinen kabul edilen boşluk (Bulgu 3 / P2-B, 2026-05-30): arşiv yalnız SEND
    // anında üretilir; accept belgeyi değiştirmez. Send arşivi başarısız olur
    // (archiveWarning) ve kullanıcı yine "Kabul Et" derse accepted teklif arşivsiz
    // kalabilir. Burada accept'i BLOKLAMIYORUZ — bu, "arşiv send'te non-blocking"
    // kararı A ile tutarlı (send geçer ama accept bloklanırsa asimetri olur). Gerçek
    // çözüm = Faz 6 accept recover/generate (V7-A5, serviceArchiveQuotePdf reuse);
    // o güne dek arşivi tüketen bir akış yok → bugünkü etki sıfır.

    return { success: true, archiveWarning, reservationWarning, shortages, reservedOrderNumber };
}

// ── PDF Arşiv (Faz 4) ────────────────────────────────────────

export interface QuoteArchiveResult {
    archived: boolean;
    /** Arşiv zaten vardı (V3-A5 idempotent — yeniden üretilmedi). */
    existing: boolean;
    revisionNo?: number;
    error?: string;
    notFound?: boolean;
}

/**
 * Faz 4 (V7): gönderilmiş teklifin dondurulmuş HTML snapshot arşivini üretir.
 * V3-A5 idempotent: aynı (quote, revision_no) için arşiv VARSA yeniden üretmez.
 * Send hook'undan ve (gelecekte) Faz 6 accept recover/generate'ten reusable.
 */
export async function serviceArchiveQuotePdf(
    quoteId: string,
    actorUserId?: string | null,
): Promise<QuoteArchiveResult> {
    const quote = await dbGetQuote(quoteId);
    if (!quote) return { archived: false, existing: false, error: "Teklif bulunamadı.", notFound: true };

    const revisionNo = Number(quote.revision_no ?? 1);

    // Faz 6 (Bulgular #1/#2 — advisor): DB satırı varsa storage OBJESİNİ üç-durumlu
    // doğrula. `dbGetQuoteArchive` yalnız satıra bakar; nadir crash/timeout
    // penceresinde satır var/dosya yok ("phantom") olabilir → accept eksik-dosyalı
    // arşive sipariş bağlamasın. RPC'nin 23514 guard'ı arşiv SATIRINI kontrol eder,
    // storage OBJESİNE erişemez → bu, "dosya gerçekten var mı" invariant'ının TEK
    // uygulama noktası.
    //   present → idempotent existing dön.
    //   missing → KESİN yok: stale satırı sil + yeniden üret (fall-through). Yeniden
    //     üretim bugünkü template'i kullanır (deploy'lar arası QuoteDocument değişebilir;
    //     dosyasız phantom'dan iyidir, çok nadir).
    //   unknown → list HATASI (geçici blip): YIKMA (sağlam arşivi koru) + BAŞARI DÖNME
    //     (fail-closed). throw → accept 502 (kullanıcı tekrar dener; tasarımca
    //     retryable). Send hook bunu try/catch'le archiveWarning'e indirir (non-fatal).
    const existing = await dbGetQuoteArchive(quoteId, revisionNo);
    if (existing) {
        const status = await dbArchiveObjectStatus(existing.file_path);
        if (status === "present") return { archived: true, existing: true, revisionNo };
        if (status === "unknown") {
            throw new Error(`Arşiv dosyası varlığı doğrulanamadı (geçici storage hatası, quote ${quoteId}). Tekrar deneyin.`);
        }
        // status === "missing" → KESİN yok
        await dbDeleteQuoteArchive(existing.id, existing.file_path);
        // fall-through → render + dbCreateQuoteArchive (yeniden üretim)
    }

    const detail = mapQuoteDetail(quote);
    const company = await dbGetCompanySettings().catch(() => null);
    const data = buildQuoteDataFromDetail(detail, company);
    const html = await renderQuoteArchiveHtml(data);
    const contentHash = createHash("sha256").update(html).digest("hex");
    const byteSize = Buffer.byteLength(html, "utf-8");

    try {
        await dbCreateQuoteArchive({
            quoteId,
            revisionNo,
            html,
            contentHash,
            byteSize,
            createdBy: actorUserId ?? null,
        });
    } catch (err) {
        // Concurrency (UNIQUE 23505): paralel istek aynı (quote, revision_no) satırını
        // açmış olabilir. ⚠️ Bulgular #1: re-read'de SADECE satırı görüp başarı dönmek
        // YETMEZ — kazanan istek satırı insert edip henüz upload etmemiş olabilir VEYA
        // upload'ı fail edip satırı silmek üzere olabilir → accept arşivsiz/404'lü
        // referansa kayar. Bu yüzden satır + OBJE present birlikte doğrulanır.
        //   present → kazanan tamamladı, idempotent başarı.
        //   missing/unknown → kazanan henüz bitirmedi ya da fail etti → throw (accept
        //     502 → retry; retry'de kazanan biter, self-heal). Burada YENİDEN ÜRETME:
        //     kazananın satırı UNIQUE slot'u hâlâ tutuyor → regenerate 23505'e
        //     yeniden çarpar (advisor).
        const racedExisting = await dbGetQuoteArchive(quoteId, revisionNo);
        if (racedExisting) {
            const status = await dbArchiveObjectStatus(racedExisting.file_path);
            if (status === "present") return { archived: true, existing: true, revisionNo };
        }
        throw err;
    }

    return { archived: true, existing: false, revisionNo };
}

// ── Müşteriye teklif e-postası (HTML ek) ─────────────────────

const QUOTE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SendQuoteToCustomerResult {
    ok: boolean;
    notFound?: boolean;
    /** Teklifte müşteri e-postası yok/geçersiz → route 400 (gönderim atılmaz). */
    reason?: "no_email";
    /** Resend/config hatası → route 502/503. */
    error?: string;
    messageId?: string;
}

/**
 * Teklif belgesini (arşivle birebir dondurulmuş HTML) teklifte yazan müşteri
 * e-postasına EK olarak gönderir. Status transition'dan bağımsız, reusable.
 *
 * Belge HTML'i = serviceArchiveQuotePdf ile AYNI pipeline (deterministik):
 *   mapQuoteDetail → buildQuoteDataFromDetail → renderQuoteArchiveHtml.
 * `email_logs` kaydı tutar (entity_type='quote'); generic retry'a girmez
 * (dbListFailedEmailsForRetry quote'u dışlar — ek yeniden eklenemez).
 *
 * NOT (gelecek "Tekrar Gönder"): burada arşiv BUCKET'ından değil, yeniden
 * render'dan ek üretiyoruz. Normal akışta (send → anında e-posta, aynı deploy)
 * byte-identical + archiveWarning durumunda da çalışır (daha sağlam). Ancak
 * post-redeploy template değişiminde dondurulmuş arşivden sapabilir. Resend
 * özelliği eklenirse `dbGetArchiveSignedUrl` ile FROZEN arşivi ek yapmayı tercih et.
 */
export async function serviceSendQuoteToCustomer(
    quoteId: string,
    actorUserId?: string | null,
): Promise<SendQuoteToCustomerResult> {
    const quote = await dbGetQuote(quoteId);
    if (!quote) return { ok: false, notFound: true };

    const detail = mapQuoteDetail(quote);
    const to = detail.customerEmail?.trim() ?? "";
    if (!QUOTE_EMAIL_RE.test(to)) return { ok: false, reason: "no_email" };

    // Belge HTML'i — arşivle birebir
    const company = await dbGetCompanySettings().catch(() => null);
    const data = buildQuoteDataFromDetail(detail, company);
    const docHtml = await renderQuoteArchiveHtml(data);

    const body = renderQuoteToCustomer({
        quoteNumber: detail.quoteNumber,
        customerName: detail.customerName,
        validUntil: detail.validUntil,
        companyName: company?.name ?? null,
    });

    // Log (pending) — fail olursa gönderimi yine de dene (best-effort audit)
    let logId: string | null = null;
    try {
        logId = await dbCreateEmailLog({
            user_id: actorUserId ?? "00000000-0000-0000-0000-000000000000",
            notification_type: "quote_customer_send",
            entity_type: "quote",
            entity_id: quoteId,
            recipient_email: to,
            subject: body.subject,
        });
    } catch (err) {
        console.error("[quote-service] email log create failed", err);
    }

    const sendRes = await sendDirectEmail({
        to,
        subject: body.subject,
        html: body.html,
        text: body.text,
        attachments: [{
            filename: `Teklif-${detail.quoteNumber}.html`,
            content: Buffer.from(docHtml, "utf-8"),
        }],
    });

    if (logId) {
        try {
            await dbUpdateEmailLogStatus(
                logId,
                sendRes.ok ? "sent" : "failed",
                sendRes.ok ? { resend_message_id: sendRes.messageId } : { error: sendRes.error },
            );
        } catch { /* best-effort log update */ }
    }

    if (!sendRes.ok) return { ok: false, error: sendRes.error };
    return { ok: true, messageId: sendRes.messageId };
}

// ── Accept → Sipariş (Faz 6, atomik) ─────────────────────────

export interface AcceptQuoteResult {
    success: boolean;
    orderId?: string;
    orderNumber?: string;
    /** Bu teklif için sipariş zaten vardı (idempotent → mevcut order döner). */
    already?: boolean;
    error?: string;
    notFound?: boolean;
    /** sent/accepted dışı durum → route 409. */
    invalidStatus?: boolean;
    /** valid_until geçmiş → route 400. */
    expired?: boolean;
    /** RPC iş kuralı ihlali (silinmiş ürün/küsürat qty/arşiv bypass) → route 422. */
    unprocessable?: boolean;
    /** Arşiv recover/generate throw → route 502 (geçici; kullanıcı tekrar dener). */
    archiveFailed?: boolean;
}

/**
 * Faz 6 (V5-A4 + V4-A8 + V7-A5): kabul edilen teklifi TEK atomik işlemde taslak
 * siparişe dönüştürür. Eski iki yolu (PATCH transition:accepted + /convert)
 * birleştirir; ikisi de 410 ile deprecate edildi.
 *
 * Akış: status guard (sent|accepted) → valid_until kontrolü →
 *   serviceArchiveQuotePdf recover/generate (V7-A5; eksikse üret, fail→502) →
 *   accept_quote_and_create_order RPC (077, atomik) → RPC hata kodu → HTTP map.
 */
export async function serviceAcceptQuoteToOrder(
    quoteId: string,
    actor?: string | null,
): Promise<AcceptQuoteResult> {
    const quote = await dbGetQuote(quoteId);
    if (!quote) return { success: false, error: "Teklif bulunamadı.", notFound: true };

    // Erken status kontrolü (kullanıcı-dostu; RPC de FOR UPDATE altında guard'lar).
    // 'accepted' izinli: eski akışta accept edilip convert edilmemiş legacy teklif
    // /accept ile tamamlanır (RPC idempotency mevcut order'ı döndürür).
    if (quote.status !== "sent" && quote.status !== "accepted") {
        return {
            success: false,
            invalidStatus: true,
            error: `'${quote.status}' durumundaki teklif siparişe dönüştürülemez. Yalnızca gönderilmiş veya kabul edilmiş teklifler.`,
        };
    }

    // valid_until geçmiş → blokla (convert ile aynı; string karşılaştırma kuralı).
    if (quote.valid_until) {
        const today = localISODate(Date.now());
        if (quote.valid_until < today) {
            return {
                success: false,
                expired: true,
                error: `Teklifin geçerlilik tarihi geçmiş (${quote.valid_until}). Dönüştürmeden önce teklifi revize edin.`,
            };
        }
    }

    // V7-A5 recover/generate: arşiv eksikse üret (idempotent — varsa no-op). Fail
    // → 502 (geçici hata, accept RPC çağrılmaz). Normal sent akışında arşiv send'te
    // üretilmiştir → bu çağrı no-op; legacy/arşiv-fail teklifte burada telafi edilir.
    try {
        await serviceArchiveQuotePdf(quoteId, actor ?? null);
    } catch (err) {
        console.error(`[quote-accept] arşiv recover/generate başarısız (quote ${quoteId}):`, err);
        return { success: false, archiveFailed: true, error: "Teklif arşivi üretilemedi. Lütfen tekrar deneyin." };
    }

    // Atomik accept + sipariş (077 RPC).
    try {
        const res = await dbAcceptQuoteAndCreateOrder(quoteId, actor ?? null);
        return { success: true, orderId: res.order_id, orderNumber: res.order_number, already: res.already };
    } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        const msg = err instanceof Error ? err.message : String(err);
        if (code === "P0002") return { success: false, notFound: true, error: "Teklif bulunamadı." };
        if (code === "42501") return { success: false, invalidStatus: true, error: msg };
        if (code === "23502") return { success: false, unprocessable: true, error: "Teklifte ürünü silinmiş satır var. Teklifi revize edip tekrar deneyin." };
        if (code === "22003") return { success: false, unprocessable: true, error: "Teklif satır adedi pozitif tam sayı olmalı." };
        // 078 Bulgu: 23514 (check_violation) jenerik bir koddur — order_lines'ın
        // quantity>0 / unit_price>=0 / discount_pct gibi TÜM check constraint'leri
        // bu kodu üretir. Bu yüzden 23514'ü "arşiv bulunamadı"ya MAP ETMİYORUZ
        // (yanıltıcı olur). Arşiv-yok guard'ı (RPC 23514) zaten yalnız doğrudan-RPC
        // bypass'ında tetiklenir (service her zaman önce recover/generate eder) →
        // o nadir durum + diğer check ihlalleri dürüstçe 500'e (throw) düşer.
        throw err;
    }
}

// ── Revizyon (Faz 5) ─────────────────────────────────────────

export interface QuoteRevisionResult {
    success: boolean;
    error?: string;
    notFound?: boolean;
    /** Kaynak revize edilebilir durumda değil (draft/accepted/revised) → route 409. */
    invalidStatus?: boolean;
    newQuoteId?: string;
    newQuoteNumber?: string;
}

/**
 * Faz 5: sent/rejected/expired teklifin düzenlenebilir kopyasını (revizyon)
 * yaratır; kaynağı 'revised' yapar. Kopya + status mantığı create_quote_revision
 * RPC'sinde (074, atomik). Burada RPC hata kodları HTTP'ye map'lenir.
 *   - 42501 → invalidStatus (revize edilemez durum)
 *   - P0002 → notFound (kaynak yok)
 */
export async function serviceCreateQuoteRevision(sourceId: string): Promise<QuoteRevisionResult> {
    let newId: string;
    try {
        newId = await dbCreateQuoteRevision(sourceId);
    } catch (err: unknown) {
        const code = (err as { code?: string })?.code;
        const msg = err instanceof Error ? err.message : String(err);
        if (code === "42501") return { success: false, error: msg, invalidStatus: true };
        if (code === "P0002") return { success: false, error: "Kaynak teklif bulunamadı.", notFound: true };
        throw err;
    }
    // 088: kaynak teklif 'revised' oldu (RPC 074) → revizyon supersede eder, eski
    // bağlı bekleyen siparişi iptal et → rezerv release. Yeni draft teklif gönderilene
    // dek stok tutulmaz. Best-effort.
    try {
        await dbCancelQuoteLinkedOrder(sourceId);
    } catch (err) {
        console.error(`[quote-reserve] revize'de kaynak siparişi iptali başarısız (quote ${sourceId}):`, err);
    }
    // Revizyon, süresi dolan teklifin aksiyonudur → açık quote_expired uyarısını kapat.
    try {
        await dbResolveAlertsForEntity("quote_expired", sourceId, "quote_revised");
    } catch (err) {
        console.error(`[quote-expire-alert] revize'de uyarı kapatılamadı (quote ${sourceId}):`, err);
    }
    const created = await dbGetQuote(newId);
    return { success: true, newQuoteId: newId, newQuoteNumber: created?.quote_number };
}

// ── Quote Expiry (CRON) ──────────────────────────────────────

/**
 * Süresi dolmuş teklifleri tarar:
 *   - draft/sent + valid_until < today → status = expired
 *   - sent olanlar için quote_expired uyarısı üretir (müşteriye sunulmuş teklif
 *     sessizce ölmesin — Uyarılar sayfasında takip edilir). draft sessiz kalır.
 *
 * Endpoint: POST /api/quotes/expire (CRON_SECRET ile çağrılır)
 */
export async function serviceExpireQuotes(): Promise<{ expired: number; expiredIds: string[]; alerted: number }> {
    const expiredQuotes = await dbListExpiredQuotes();
    const expiredIds: string[] = [];
    let alerted = 0;
    for (const q of expiredQuotes) {
        const updated = await dbUpdateQuoteStatus(q.id, "expired", q.status as QuoteStatus);
        if (updated) {
            expiredIds.push(q.id);
            // 088: süresi dolan teklifin bağlı bekleyen siparişini iptal et → rezerv
            // release (spekülatif teklif stoğu tutmasın). Best-effort.
            try {
                await dbCancelQuoteLinkedOrder(q.id);
            } catch (err) {
                console.error(`[quote-reserve] expire'da bağlı sipariş iptali başarısız (quote ${q.id}):`, err);
            }
            // Dedup'u idx_alerts_active_dedup üstlenir (dbCreateAlert 23505 → null).
            if (q.status === "sent") {
                try {
                    const alert = await dbCreateAlert({
                        type: "quote_expired",
                        severity: "warning",
                        title: `Teklif Süresi Doldu: ${q.quote_number}`,
                        description: `${q.customer_name} — ${q.quote_number} teklifinin geçerliliği ${q.valid_until} tarihinde doldu. Revize edin ya da müşteriyle teyitleşin.`,
                        entity_type: "quote",
                        entity_id: q.id,
                    });
                    if (alert) alerted++;
                } catch (err) {
                    // Uyarı best-effort: alert yazılamasa da expiry işlemi geçerli.
                    console.error(`[quote-expire-alert] uyarı oluşturulamadı (quote ${q.id}):`, err);
                }
            }
        }
        // else: status already changed by concurrent action, skip
    }
    return { expired: expiredIds.length, expiredIds, alerted };
}

// ── Quote → Order Conversion ────────────────────────────────
// Faz 8b: serviceConvertQuoteToOrder + ConvertResult KALDIRILDI (ölü kod).
// Yerini Faz 6 atomik accept aldı: serviceAcceptQuoteToOrder (RPC 077,
// accept_quote_and_create_order) — tek transaction'da accept + draft order +
// donmuş totaller + arşiv recover. /convert route'u 410 Gone döner (eski URL
// uyumu). Eski iki-adımlı convert akışı tamamen emekli.

// ── Query ────────────────────────────────────────────────────

export async function serviceGetQuote(id: string) {
    return dbGetQuote(id);
}

// ── Rezervasyon reconciler (denetim K4+Y3, 2026-06) ─────────────────────────

export interface QuoteReconcileResult {
    /** sent + sipariş-yok → pending order yeniden yaratıldı */
    repaired: number;
    /** rejected/expired + pending order → iptal edildi (rezerv bırakıldı) */
    released: number;
    /** onarılamayan tutarsızlık için açılan sync_issue alert sayısı */
    alerted: number;
}

/**
 * Send/reject best-effort yan etkilerinin iki yönlü artıklarını onarır.
 * Alert-scan cron'undan (aynı advisory lock altında) çağrılır:
 *  - "sent ama bağlı sipariş yok" → rezervasyon RPC'si yeniden denenir
 *    (RPC idempotent: quote FOR UPDATE + cancelled-hariç kontrol).
 *  - "rejected/expired ama pending order yaşıyor" → cancel RPC'si denenir.
 * İkinci deneme de başarısızsa sync_issue alert açılır (entity-bağlı dedup
 * idx_alerts_active_dedup ile — her taramada çoğalmaz).
 */
export async function serviceReconcileQuoteReservations(): Promise<QuoteReconcileResult> {
    const mismatches = await dbListQuoteReservationMismatches();
    const result: QuoteReconcileResult = { repaired: 0, released: 0, alerted: 0 };

    for (const q of mismatches.sentWithoutOrder) {
        try {
            await dbSendQuoteCreatePendingOrder(q.id, null);
            result.repaired++;
            console.info(`[quote-reconcile] ${q.quote_number}: eksik rezervasyon onarıldı`);
        } catch (err) {
            const created = await dbCreateAlert({
                type: "sync_issue",
                severity: "warning",
                title: `Teklif rezervasyonu onarılamadı: ${q.quote_number}`,
                description: `Teklif 'sent' ama bağlı bekleyen sipariş yok; otomatik onarım başarısız: ${err instanceof Error ? err.message : String(err)}`,
                entity_type: "quote",
                entity_id: q.id,
                source: "system",
            }).catch(() => null);
            if (created) result.alerted++;
        }
    }

    for (const q of mismatches.terminalWithActiveOrder) {
        try {
            await dbCancelQuoteLinkedOrder(q.id);
            result.released++;
            console.info(`[quote-reconcile] ${q.quote_number}: phantom rezervasyon bırakıldı (${q.status})`);
        } catch (err) {
            const created = await dbCreateAlert({
                type: "sync_issue",
                severity: "warning",
                title: `Phantom rezervasyon bırakılamadı: ${q.quote_number}`,
                description: `Teklif '${q.status}' ama bağlı bekleyen sipariş hâlâ rezerv tutuyor; otomatik iptal başarısız: ${err instanceof Error ? err.message : String(err)}`,
                entity_type: "quote",
                entity_id: q.id,
                source: "system",
            }).catch(() => null);
            if (created) result.alerted++;
        }
    }

    return result;
}
