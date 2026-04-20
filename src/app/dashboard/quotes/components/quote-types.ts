export interface QuoteRow {
    code: string;
    lead: string;
    desc: string;
    qty: string;
    price: string;
    hs: string;
    kg: string;
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
    signatures: QuoteSignature[];

    // Meta
    status: "draft" | "approved";
}
