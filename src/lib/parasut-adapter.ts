import type { ParasutErrorKind } from './parasut-constants';

// ── Error ────────────────────────────────────────────────────────────────────

export class ParasutError extends Error {
    constructor(
        public kind: ParasutErrorKind,
        message: string,
        public retryAfterSec?: number,
    ) {
        super(message);
        this.name = 'ParasutError';
    }
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

export interface OAuthTokens {
    access_token:  string;
    refresh_token: string;
    expires_at:    string; // ISO
}

// ── Domain types ─────────────────────────────────────────────────────────────

export interface ParasutContact {
    id:         string;
    attributes: {
        name:       string;
        tax_number: string | null;
        email:      string | null;
    };
}

export interface ParasutProduct {
    id:         string;
    attributes: {
        code:        string;
        name:        string;
        sales_price: number | null;
    };
}

export interface ParasutInvoice {
    id:         string;
    attributes: {
        invoice_no:         string | null;
        invoice_series:     string | null;
        invoice_id:         number | null;
        net_total:          number;
        gross_total:        number;
        currency:           string;
        issue_date:         string;
    };
}

export interface ParasutEDocument {
    id:         string;
    type:       'e_invoices' | 'e_archives';
    attributes: { status: string };
}

export interface ParasutInvoiceWithEDocument extends ParasutInvoice {
    active_e_document: ParasutEDocument | null;
}

export interface ParasutShipmentDocument {
    id:         string;
    attributes: {
        inflow:             boolean;
        procurement_number: string | null;
        shipment_date:      string | null;
        issue_date:         string;
    };
}

export interface ParasutEInvoiceInbox {
    id:         string;
    attributes: { vkn: string; alias: string };
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface ContactInput {
    name:        string;
    tax_number:  string;
    email?:      string;
    tax_office?: string;
}

export interface ProductInput {
    code:        string;
    name:        string;
    sales_price?: number;
    vat_rate?:   number;
}

export interface InvoiceInput {
    contact_id:        string;
    invoice_series:    string;
    invoice_id:        number;
    issue_date:        string;
    due_date:          string;
    currency:          'TRL' | 'USD' | 'EUR' | 'GBP';
    shipment_included: false; // KESIN false — stok invariant
    description:       string;
    details: Array<{
        quantity:        number;
        unit_price:      number;
        vat_rate:        number;
        discount_type?:  'percentage' | 'amount';
        discount_value?: number;
        description:     string;
        product_id?:     string;
        // warehouse: KASITLI OLARAK YOK — stok hareketi yaratmasın
    }>;
}

export interface ShipmentDocInput {
    contact_id:         string;
    issue_date:         string;
    shipment_date:      string;
    inflow:             false; // KESIN false — satış
    procurement_number: string;
    description:        string;
    city?:              string;
    district?:          string;
    address?:           string;
    details: Array<{
        quantity:      number;
        product_id:    string;
        description:   string;
        warehouse_id?: string;
    }>;
}

export interface EInvoiceInput {
    issue_date:    string;
    scenario:      'commercial' | 'basic';
}

export interface EArchiveInput {
    issue_date:    string;
    internet_sale: boolean;
}

// ── Adapter interface ─────────────────────────────────────────────────────────

export interface ParasutAdapter {
    // OAuth
    exchangeAuthCode(code: string, redirectUri: string): Promise<OAuthTokens>;
    refreshToken(refreshToken: string): Promise<OAuthTokens>;

    // Contact
    findContactsByTaxNumber(taxNumber: string): Promise<ParasutContact[]>;
    findContactsByEmail(email: string): Promise<ParasutContact[]>;
    createContact(input: ContactInput): Promise<ParasutContact>;
    updateContact(id: string, patch: Partial<ContactInput>): Promise<ParasutContact>;

    // Product (filter[code] = SKU)
    findProductsByCode(code: string): Promise<ParasutProduct[]>;
    createProduct(input: ProductInput): Promise<ParasutProduct>;

    // Sales invoice
    findSalesInvoicesByNumber(series: string, numberInt: number): Promise<ParasutInvoice[]>;
    createSalesInvoice(input: InvoiceInput): Promise<ParasutInvoice>;
    getSalesInvoiceWithActiveEDocument(id: string): Promise<ParasutInvoiceWithEDocument>;

    // Shipment document (filter zayıf — pagination + local filtre)
    listRecentShipmentDocuments(page: number, pageSize: number): Promise<ParasutShipmentDocument[]>;
    createShipmentDocument(input: ShipmentDocInput): Promise<ParasutShipmentDocument>;

    // E-fatura mükellef kontrolü
    listEInvoiceInboxesByVkn(vkn: string): Promise<ParasutEInvoiceInbox[]>;

    // E-document
    createEInvoice(salesInvoiceId: string, input: EInvoiceInput): Promise<{ trackable_job_id: string }>;
    createEArchive(salesInvoiceId: string, input: EArchiveInput): Promise<{ trackable_job_id: string }>;

    // TrackableJob (spec enum: running | done | error)
    getTrackableJob(id: string): Promise<{ status: 'running' | 'done' | 'error'; errors?: string[] }>;
}
