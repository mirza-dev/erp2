/**
 * Quote Service — business logic layer for quote status lifecycle.
 * Transition map: draft→sent, sent→accepted|rejected.
 * Terminal states: accepted, rejected, expired (CRON-only).
 * Faz 8: serviceConvertQuoteToOrder — accepted teklif → draft sipariş.
 */

import { createHash } from "crypto";
import type { QuoteStatus } from "@/lib/database.types";
import { dbGetQuote, dbUpdateQuoteStatus, dbListExpiredQuotes, dbCreateQuoteRevision } from "@/lib/supabase/quotes";
import { dbGetProductById } from "@/lib/supabase/products";
import { dbGetCustomerById } from "@/lib/supabase/customers";
import { dbFindOrderByQuoteId } from "@/lib/supabase/orders";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { dbGetQuoteArchive, dbCreateQuoteArchive } from "@/lib/supabase/quote-pdf-archives";
import { serviceCreateOrder } from "@/lib/services/order-service";
import { buildQuoteDataFromDetail, renderQuoteArchiveHtml } from "@/lib/quote-archive-html";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { validateQuoteForSend, validateQuoteLineQuantities } from "@/lib/quote-validation";

// ── Types ────────────────────────────────────────────────────

export type QuoteTransition = "sent" | "accepted" | "rejected";

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
    sent:     ["accepted", "rejected"],
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

    const existing = await dbGetQuoteArchive(quoteId, revisionNo);
    if (existing) return { archived: true, existing: true, revisionNo };

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
        // Concurrency: paralel istek aynı (quote, revision_no) arşivini commit etmiş
        // olabilir (UNIQUE 23505). Re-read → varsa idempotent existing döner; yoksa
        // gerçek hata (storage down vb.) propagate eder. Faz 6 recovery güvenli.
        const racedExisting = await dbGetQuoteArchive(quoteId, revisionNo);
        if (racedExisting) return { archived: true, existing: true, revisionNo };
        throw err;
    }

    return { archived: true, existing: false, revisionNo };
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

// ── Quote → Order Conversion (Faz 8) ────────────────────────

export interface ConvertResult {
    success: boolean;
    orderId?: string;
    orderNumber?: string;
    error?: string;
    warnings?: string[];
    notFound?: boolean;
    alreadyConverted?: boolean;
    existingOrderId?: string;
    existingOrderNumber?: string;
}

/**
 * Kabul edilmiş teklifi taslak siparişe dönüştürür.
 *   - Sadece accepted teklifler dönüştürülebilir.
 *   - quote_id FK üzerinden idempotency kontrolü yapılır.
 *   - product_id null olan satırlar atlanır (uyarı ile).
 *   - Ürün adı/SKU/birimi products tablosundan çekilir.
 *   - Müşteri detayları (country/tax) customers tablosundan zenginleştirilir.
 */
export async function serviceConvertQuoteToOrder(quoteId: string, createdBy?: string): Promise<ConvertResult> {
    // 1. Teklif var mı?
    const quote = await dbGetQuote(quoteId);
    if (!quote) return { success: false, error: "Teklif bulunamadı.", notFound: true };

    // 2. Sadece accepted teklifler
    if (quote.status !== "accepted") {
        return {
            success: false,
            error: `'${quote.status}' durumundaki teklif siparişe dönüştürülemez. Yalnızca kabul edilmiş teklifler dönüştürülebilir.`,
        };
    }

    // 3. Daha önce dönüştürüldü mü?
    const existing = await dbFindOrderByQuoteId(quoteId);
    if (existing) {
        return {
            success: false,
            error: "Bu teklif daha önce siparişe dönüştürülmüş.",
            alreadyConverted: true,
            existingOrderId: existing.id,
            existingOrderNumber: existing.order_number,
        };
    }

    // 3b. Faz 3 (V7) interim guard: header iskontolu teklif siparişe dönüştürülemez.
    // sales_orders'ta header iskonto kolonu YOK (Faz 6/075'te gelecek) → convert
    // iskontoyu sessizce düşürür ve order grand_total'ı quote'tan yüksek olur
    // (sessiz finansal hata). "Koru" kolon olmadan imkânsız → BLOCK. Faz 6'da kalkar.
    if (Number(quote.discount_amount) > 0) {
        return {
            success: false,
            error: `İskontolu teklif (iskonto: ${quote.discount_amount}) şu an siparişe dönüştürülemez — sipariş tarafı iskonto desteği sonraki fazda gelecek.`,
        };
    }

    // 4. Satırları filtrele
    const validLines = quote.lines.filter(l => l.product_id != null);
    const skippedLines = quote.lines.filter(l => l.product_id == null);

    if (validLines.length === 0) {
        return {
            success: false,
            error: "Teklifin hiçbir satırında ürün eşleşmesi yok. Siparişe dönüştürmek için en az bir satırda ürün seçili olmalıdır.",
        };
    }

    // 5. Ürün detaylarını çek
    const productMap = new Map<string, { name: string; sku: string; unit: string }>();
    for (const line of validLines) {
        const product = await dbGetProductById(line.product_id!);
        if (!product) {
            return {
                success: false,
                error: `Ürün bulunamadı: ${line.product_code} (satır ${line.position}). Ürün silinmiş olabilir.`,
            };
        }
        productMap.set(line.product_id!, { name: product.name, sku: product.sku, unit: product.unit });
    }

    // 6. Müşteri detaylarını çek (opsiyonel zenginleştirme)
    const warnings: string[] = [];
    let customerCountry: string | undefined;
    let customerTaxOffice: string | undefined;
    let customerTaxNumber: string | undefined;
    let customerEmail: string | undefined = quote.customer_email ?? undefined;

    if (quote.customer_id) {
        const customer = await dbGetCustomerById(quote.customer_id);
        if (customer) {
            customerCountry = customer.country ?? undefined;
            customerTaxOffice = customer.tax_office ?? undefined;
            customerTaxNumber = customer.tax_number ?? undefined;
            customerEmail = quote.customer_email ?? customer.email ?? undefined;
        } else {
            warnings.push("Müşteri kaydı bulunamadı, müşteri detayları (ülke/vergi) aktarılmadı.");
        }
    }

    // Atlanmış satırlar için uyarı
    for (const l of skippedLines) {
        warnings.push(`Satır ${l.position}: ürün eşleşmesi yok, atlandı.`);
    }

    // 7. Finansalları valid satırlardan yeniden hesapla
    const subtotal = validLines.reduce((sum, l) => sum + Number(l.line_total), 0);
    const vatTotal = Math.round(subtotal * (Number(quote.vat_rate) / 100) * 100) / 100;
    const grandTotal = Math.round((subtotal + vatTotal) * 100) / 100;

    // 8a. Geçerlilik tarihi kontrolü — geçmişse 400 döndür (serviceCreateOrder'a varmadan)
    const validUntil = quote.valid_until ?? undefined;
    if (validUntil) {
        const today = new Date().toISOString().slice(0, 10);
        if (validUntil < today) {
            return {
                success: false,
                error: `Teklifin geçerlilik tarihi geçmiş (${validUntil}). Dönüştürmeden önce geçerlilik tarihini güncelleyin.`,
            };
        }
    }

    // 8b. Atlanmış satırları sipariş notuna ekle (kalıcı iz)
    let orderNotes = quote.notes ?? undefined;
    if (skippedLines.length > 0) {
        const skippedNote = `[Dönüştürme: ${skippedLines.length} satır ürün eşleşmesi olmadığı için atlandı — ${skippedLines.map(l => `Satır ${l.position}`).join(", ")}]`;
        orderNotes = orderNotes ? `${orderNotes}\n${skippedNote}` : skippedNote;
    }

    // 8c. Sipariş oluştur
    const orderInput = {
        customer_id: quote.customer_id ?? undefined,
        customer_name: quote.customer_name,
        customer_email: customerEmail,
        customer_country: customerCountry,
        customer_tax_office: customerTaxOffice,
        customer_tax_number: customerTaxNumber,
        commercial_status: "draft" as const,
        fulfillment_status: "unallocated" as const,
        currency: quote.currency,
        subtotal,
        vat_total: vatTotal,
        grand_total: grandTotal,
        notes: orderNotes,
        quote_id: quoteId,
        quote_valid_until: validUntil,
        created_by: createdBy,
        lines: validLines.map(line => ({
            product_id: line.product_id!,
            product_name: productMap.get(line.product_id!)!.name,
            product_sku: productMap.get(line.product_id!)!.sku,
            unit: productMap.get(line.product_id!)!.unit,
            quantity: Number(line.quantity),
            unit_price: Number(line.unit_price),
            discount_pct: 0,
            line_total: Number(line.line_total),
        })),
    };

    let order: Awaited<ReturnType<typeof serviceCreateOrder>>;
    try {
        order = await serviceCreateOrder(orderInput);
    } catch (err: unknown) {
        // DB unique constraint violation: aynı quote_id zaten sipariş var (race condition)
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("23505") || msg.includes("uq_sales_orders_quote_id")) {
            const raceExisting = await dbFindOrderByQuoteId(quoteId);
            return {
                success: false,
                error: "Bu teklif daha önce siparişe dönüştürülmüş.",
                alreadyConverted: true,
                existingOrderId: raceExisting?.id,
                existingOrderNumber: raceExisting?.order_number,
            };
        }
        throw err;
    }

    return {
        success: true,
        orderId: order.id,
        orderNumber: order.order_number,
        warnings: warnings.length > 0 ? warnings : undefined,
    };
}

// ── Query ────────────────────────────────────────────────────

export async function serviceGetQuote(id: string) {
    return dbGetQuote(id);
}
