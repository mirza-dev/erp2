export interface QuoteRow {
    code: string;
    lead: string;
    desc: string;
    qty: string;
    price: string;
    hs: string;
    kg: string;
    // Faz 4a Review (2026-05-23): PMT brand "Ölçü / Size" kolonu. Form
    // ve DB tarafında zaten taşınıyordu; preview/PDF kontratta yoktu.
    // Faz 4c bilingual PMT layout'unda görsel olarak da kullanılacak.
    size: string;
}

export interface QuoteSignature {
    role: string;
    roleTr: string;
    name: string;
    title: string;
}

export type Currency = "TRY" | "USD" | "EUR";

export interface QuoteData {
    // Seller
    sellerName: string;
    sellerTel: string;
    sellerEmail: string;
    sellerAddr: string;
    sellerTaxId: string;
    sellerWeb: string;
    logoSrc: string | null;

    // Customer
    custCompany: string;
    custContact: string;
    custPhone: string;
    custEmail: string;

    // Quote details
    quoteNo: string;
    quoteDate: string;
    validUntil: string;
    salesRep: string;
    salesPhone: string;
    salesEmail: string;
    currency: Currency;
    vatRate: number;

    // Line items
    rows: QuoteRow[];

    // Totals (pre-computed)
    subtotal: number;
    vatTotal: number;
    grandTotal: number;
    totalKg: number;

    // Footer
    notes: string;
    // Faz 4a Review (2026-05-23): PMT brand Teslimat/Ödeme bilgisi.
    // Form ve DB save path'inde zaten taşınıyordu; preview/PDF kontratta
    // yoktu. Faz 4c PMT brand layout terms band'i bu alanları kullanacak.
    deliveryMethod: string;
    paymentMethod: string;
    signatures: QuoteSignature[];

    // Meta
    status: "draft" | "sent" | "accepted" | "rejected" | "expired";
}
