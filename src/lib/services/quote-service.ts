/**
 * Quote Service — business logic layer for quote status lifecycle.
 * Transition map: draft→sent, sent→accepted|rejected.
 * Terminal states: accepted, rejected, expired (CRON-only).
 * Faz 8: serviceConvertQuoteToOrder — accepted teklif → draft sipariş.
 */

import type { QuoteStatus } from "@/lib/database.types";
import { dbGetQuote, dbUpdateQuoteStatus, dbListExpiredQuotes } from "@/lib/supabase/quotes";
import { dbGetProductById } from "@/lib/supabase/products";
import { dbGetCustomerById } from "@/lib/supabase/customers";
import { dbFindOrderByQuoteId } from "@/lib/supabase/orders";
import { serviceCreateOrder } from "@/lib/services/order-service";

// ── Types ────────────────────────────────────────────────────

export type QuoteTransition = "sent" | "accepted" | "rejected";

export interface QuoteTransitionResult {
    success: boolean;
    error?: string;
    notFound?: boolean;
}

// ── Transition map ───────────────────────────────────────────

const QUOTE_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
    draft:    ["sent"],
    sent:     ["accepted", "rejected"],
    accepted: [],
    rejected: [],
    expired:  [],
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

    const updated = await dbUpdateQuoteStatus(quoteId, target, quote.status as QuoteStatus);
    if (!updated) {
        return { success: false, error: "Teklif durumu eşzamanlı olarak değiştirilmiş. Sayfayı yenileyip tekrar deneyin." };
    }
    return { success: true };
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
export async function serviceConvertQuoteToOrder(quoteId: string): Promise<ConvertResult> {
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

    // 8. Sipariş oluştur
    const order = await serviceCreateOrder({
        customer_id: quote.customer_id ?? undefined,
        customer_name: quote.customer_name,
        customer_email: customerEmail,
        customer_country: customerCountry,
        customer_tax_office: customerTaxOffice,
        customer_tax_number: customerTaxNumber,
        commercial_status: "draft",
        fulfillment_status: "unallocated",
        currency: quote.currency,
        subtotal,
        vat_total: vatTotal,
        grand_total: grandTotal,
        notes: quote.notes ?? undefined,
        quote_id: quoteId,
        quote_valid_until: quote.valid_until ?? undefined,
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
    });

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
