/**
 * Teklif V7 — Faz 2: Validasyon katmanı (pure helper'lar).
 *
 * DB değişikliği yok; alanlar Faz 1a/1b'de eklendi. Bu helper'lar route'lar
 * (create/edit qty) ve quote-service (send-time hard check) tarafından
 * paylaşılır, izole test edilir.
 *
 * "Gerçek ürün satırı" (substantive) — buildQuotePayload code VEYA desc'i olan
 * her satırı tutar, boş qty'yi quantity:0 gönderir. Başlık/ayraç satırlarını
 * yanlışlıkla reddetmemek için her kuralın kendi substantive predicate'i var:
 *   - qty validator (create/edit): product_id != null || unit_price > 0
 *   - product_id send-time hard check: unit_price > 0 || quantity > 0
 *   - GTİP soft warn (form): product_id || price>0 || qty>0
 */

export interface QuoteLineForValidation {
    product_id?: string | null;
    quantity?: number;
    unit_price?: number;
    hs_code?: string | null;
}

/**
 * V7-A11 — create/edit. Gerçek ürün satırlarında (product_id veya fiyatı olan)
 * adet pozitif tam sayı olmalı; order_lines.quantity integer ile uyum için
 * küsürat sessiz yuvarlanmasın. Hata mesajı | null döner.
 */
export function validateQuoteLineQuantities(lines: QuoteLineForValidation[]): string | null {
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const isReal = (ln.product_id != null) || ((ln.unit_price ?? 0) > 0);
        if (!isReal) continue;
        const q = ln.quantity ?? 0;
        if (!Number.isInteger(q) || q <= 0) {
            return `Satır ${i + 1}: adet pozitif tam sayı olmalı (girilen: ${q}).`;
        }
    }
    return null;
}

/**
 * V4-A2 + V4-A4 — send-time hard check. Sent'e geçmeden önce müşteri adresi
 * zorunlu (resmi PDF) ve her gerçek kalem bir ürüne bağlı olmalı (manuel/custom
 * satır izinsiz). Hata mesajı | null döner.
 */
export function validateQuoteForSend(quote: {
    customer_address?: string | null;
    lines: QuoteLineForValidation[];
}): string | null {
    if (!quote.customer_address || !quote.customer_address.trim()) {
        return "Teklifi göndermeden önce müşteri adresi girilmeli.";
    }
    for (let i = 0; i < quote.lines.length; i++) {
        const ln = quote.lines[i];
        const substantive = ((ln.unit_price ?? 0) > 0) || ((ln.quantity ?? 0) > 0);
        if (substantive && ln.product_id == null) {
            return `Satır ${i + 1}: gönderilecek teklifteki her kalem bir ürüne bağlı olmalı (manuel/custom satır izinsiz).`;
        }
    }
    return null;
}

/**
 * V3-A1 — GTİP soft warn (form inline). Eksik-GTİP gerçek satır indekslerini
 * (1-based) döner; gönderimi ENGELLEMEZ, yalnız UI bilgilendirmesi.
 */
export function findMissingHsLines(lines: QuoteLineForValidation[]): number[] {
    const out: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        const ln = lines[i];
        const substantive = (ln.product_id != null) || ((ln.unit_price ?? 0) > 0) || ((ln.quantity ?? 0) > 0);
        if (substantive && (!ln.hs_code || !ln.hs_code.trim())) out.push(i + 1);
    }
    return out;
}
