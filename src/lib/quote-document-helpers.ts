/**
 * Faz 4c — QuoteDocument bilingual labels.
 * Extracted from QuoteDocument.tsx so the component file exports only the component
 * (React Fast Refresh requirement).
 */

/**
 * Faz 4c (2026-05-25) — PMT brand bilingual label pairs.
 *
 * PMT teklif diline uygun: TR ana, EN alt italic. Tüm component bu Map'i
 * kullanır → drift tek noktada yakalanır, source-of-truth.
 * Test edilebilirlik: `import { BILINGUAL_LABELS } from "@/lib/quote-document-helpers"`.
 */
/**
 * PDF eki turu (2026-06): para sembolü + sayı/tarih formatlayıcıları
 * QuoteDocument.tsx'ten buraya taşındı (silinmedi) — HTML belge (QuoteDocument)
 * ve PDF belge (QuotePdfDocument) aynı formatları tek kaynaktan kullanır.
 */
export const CURRENCY_SYMBOLS: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };

export function formatQuoteAmount(n: number): string {
    return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQuoteDate(s: string): string {
    if (!s) return "—";
    try {
        const [y, m, d] = s.split("-");
        return `${d}.${m}.${y}`;
    } catch {
        return s;
    }
}

export const BILINGUAL_LABELS = {
    // Title band
    // Faz 4c Review (2026-05-25): plan §503 wording — "TEKLİF FORMU / COMMERCIAL OFFER"
    title:        { tr: "TEKLİF FORMU",          en: "COMMERCIAL OFFER" },
    // Meta sections
    customer:     { tr: "Müşteri",               en: "Customer" },
    quoteDetails: { tr: "Teklif Detayları",      en: "Quote Details" },
    // Meta rows (customer)
    company:      { tr: "Firma",                 en: "Company" },
    contact:      { tr: "İlgili",                en: "Contact" },
    phone:        { tr: "Telefon",               en: "Phone" },
    email:        { tr: "E-Posta",               en: "Email" },
    address:      { tr: "Adres",                 en: "Address" },
    // Meta rows (quote)
    salesRep:     { tr: "Satış Temsilcisi",      en: "Sales Rep" },
    // Faz 4c Review: plan §503 — "Teklif No / Offer No"
    quoteNo:      { tr: "Teklif No",             en: "Offer No" },
    date:         { tr: "Tarih",                 en: "Date" },
    currency:     { tr: "Para Birimi",           en: "Currency" },
    // Table section + columns
    lineItems:    { tr: "Kalemler",              en: "Line Items" },
    rowNo:        { tr: "Sıra",                  en: "Item" },
    productCode:  { tr: "Ürün Kodu",             en: "Product Code" },
    leadTime:     { tr: "Teslim Süresi",         en: "Lead Time" },
    size:         { tr: "Ölçü",                  en: "Size" },
    description:  { tr: "Ürün Tanımı",           en: "Description" },
    qty:          { tr: "Miktar",                en: "Qty" },
    unitPrice:    { tr: "Birim Fiyat",           en: "Unit Price" },
    totalPrice:   { tr: "Toplam",                en: "Total" },
    hsCode:       { tr: "GTİP Kodu",             en: "HS Code" },
    weight:       { tr: "Ağırlık",               en: "Weight (Kg)" },
    // Totals
    subtotal:     { tr: "Ara Toplam",            en: "Subtotal" },
    discount:     { tr: "İskonto",               en: "Discount" },
    vat:          { tr: "KDV",                   en: "VAT" },
    totalWeight:  { tr: "Toplam Ağırlık",        en: "Total Weight" },
    grandTotal:   { tr: "GENEL TOPLAM",          en: "GRAND TOTAL" },
    // Terms band (3-col)
    termsTitle:   { tr: "Teslimat, Geçerlilik & Ödeme", en: "Delivery, Validity & Payment" },
    delivery:     { tr: "Teslimat Şekli",        en: "Delivery Method" },
    // Faz 4c Review (2026-05-25): label semantik fix — data shape `validUntil` ISO tarih
    validity:     { tr: "Geçerlilik Tarihi",     en: "Valid Until" },
    payment:      { tr: "Ödeme Şekli",           en: "Payment Method" },
    // Notes
    notes:        { tr: "NOTLAR & KOŞULLAR",     en: "Notes & Terms" },
    // Signatures
    signatures:   { tr: "İmzalar",               en: "Signatures" },
    // Footer
    hq:           { tr: "Merkez",                en: "HQ" },
    tel:          { tr: "Tel",                   en: "Tel" },
    web:          { tr: "Web",                   en: "Web" },
    confidential: { tr: "Bu belge gizlidir",     en: "This document is confidential" },
    emptyRows:    { tr: "Kalem girilmedi",       en: "No items" },
} as const;
