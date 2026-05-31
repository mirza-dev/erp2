/**
 * Quote Service — business logic layer for quote status lifecycle.
 * Transition map: draft→sent, sent→accepted|rejected.
 * Terminal states: accepted, rejected, expired (CRON-only).
 * Faz 6: accept → atomik serviceAcceptQuoteToOrder (RPC 077).
 */

import { createHash } from "crypto";
import type { QuoteStatus } from "@/lib/database.types";
import { dbGetQuote, dbUpdateQuoteStatus, dbListExpiredQuotes, dbCreateQuoteRevision, dbAcceptQuoteAndCreateOrder } from "@/lib/supabase/quotes";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { dbGetQuoteArchive, dbCreateQuoteArchive, dbArchiveObjectStatus, dbDeleteQuoteArchive } from "@/lib/supabase/quote-pdf-archives";
import { buildQuoteDataFromDetail, renderQuoteArchiveHtml } from "@/lib/quote-archive-html";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { validateQuoteForSend, validateQuoteLineQuantities } from "@/lib/quote-validation";

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

    // Bilinen kabul edilen boşluk (Bulgu 3 / P2-B, 2026-05-30): arşiv yalnız SEND
    // anında üretilir; accept belgeyi değiştirmez. Send arşivi başarısız olur
    // (archiveWarning) ve kullanıcı yine "Kabul Et" derse accepted teklif arşivsiz
    // kalabilir. Burada accept'i BLOKLAMIYORUZ — bu, "arşiv send'te non-blocking"
    // kararı A ile tutarlı (send geçer ama accept bloklanırsa asimetri olur). Gerçek
    // çözüm = Faz 6 accept recover/generate (V7-A5, serviceArchiveQuotePdf reuse);
    // o güne dek arşivi tüketen bir akış yok → bugünkü etki sıfır.

    return { success: true, archiveWarning };
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
        const today = new Date().toISOString().slice(0, 10);
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
    const created = await dbGetQuote(newId);
    return { success: true, newQuoteId: newId, newQuoteNumber: created?.quote_number };
}

// ── Quote Expiry (CRON) ──────────────────────────────────────

/**
 * Süresi dolmuş teklifleri tarar:
 *   - draft/sent + valid_until < today → status = expired
 *
 * Endpoint: POST /api/quotes/expire (CRON_SECRET ile çağrılır)
 */
export async function serviceExpireQuotes(): Promise<{ expired: number; expiredIds: string[] }> {
    const expiredQuotes = await dbListExpiredQuotes();
    const expiredIds: string[] = [];
    for (const q of expiredQuotes) {
        const updated = await dbUpdateQuoteStatus(q.id, "expired", q.status as QuoteStatus);
        if (updated) expiredIds.push(q.id);
        // else: status already changed by concurrent action, skip
    }
    return { expired: expiredIds.length, expiredIds };
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
