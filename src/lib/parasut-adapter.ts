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

export interface ParasutPurchaseBill {
    id:         string;
    attributes: {
        invoice_no:  string | null;
        description: string | null;
        net_total:   number;
        gross_total: number;
        currency:    string;
        issue_date:  string;
    };
}

/**
 * Tahsilat/ödeme durumu (Faz 14) — Paraşüt'ten ERP'ye tek yönlü OKUMA.
 * Satış faturası ve alış faturası için aynı şekil.
 */
export interface ParasutPaymentState {
    id:               string;
    /** Paraşüt enum'u; tanınmayan değer null'a iner. */
    payment_status:   'paid' | 'overdue' | 'unpaid' | 'partially_paid' | null;
    /** Kalan tutar — faturanın KENDİ para biriminde. */
    remaining:        number | null;
    /** Paraşüt'ün hesapladığı TL karşılığı. Toplama YALNIZ bunun üzerinden yapılır. */
    remaining_in_trl: number | null;
    currency:         string | null;
    due_date:         string | null;
}

/**
 * Bir ürünün bir depodaki stok seviyesi (Faz 15) — SALT OKUNUR.
 * Paraşüt `inventory_levels` ucundan gelir.
 */
export interface ParasutInventoryLevel {
    id:            string;
    warehouse_id:  string | null;
    stock_count:   number;
}

/**
 * Stok güncelleme kalemi (Faz 15).
 *
 * DİKKAT: `new_total_inventory` MUTLAK değerdir — delta DEĞİL. Paraşüt stoğu
 * bu değere EŞİTLENİR. Doğası gereği idempotent (aynı değeri iki kez yazmak
 * zararsız), ama eşzamanlı Paraşüt-tarafı hareketin üzerine yazar.
 */
export interface StockUpdateDetailInput {
    product_id:          string;
    new_total_inventory: number;
    warehouse_id?:       string;
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
    /**
     * Paraşüt'te müşteri ve tedarikçi TEK `contacts` havuzunda tutulur; ayrımı
     * bu alan yapar. Verilmezse `customer` varsayılır (satış akışının bugünkü
     * davranışı korunur); Faz 13 tedarikçi akışı `supplier` geçer.
     */
    account_type?: 'customer' | 'supplier';
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
    /**
     * Dövizli faturada TL karşılığının hesaplandığı kur (TCMB, fatura tarihi).
     * Gönderilmezse Paraşüt kendi kurunu uygular → ERP'deki tutarla sapabilir.
     * Çözülemediğinde alan HİÇ gönderilmez (yanlış kur göndermektense
     * Paraşüt'ün kurunu kullanmak doğrudur).
     */
    exchange_rate?:    number;
    /** ERP sipariş numarası — resmî alan (yalnız `description` metni değil). */
    order_no?:         string;
    /** Sipariş tarihi (YYYY-MM-DD). `order_no` doluysa Paraşüt bunu bekler. */
    order_date?:       string;
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

/**
 * Alış faturası (Faz 13) — Paraşüt `purchase_bills#detailed`.
 *
 * STOK INVARIANT (satışın simetriği): `details` içinde warehouse ilişkisi
 * GÖNDERİLMEZ → Paraşüt stok hareketi yaratmaz. ERP stok otoritesidir;
 * Paraşüt stoğu Faz 15 mutabakatından beslenir.
 */
export interface PurchaseBillInput {
    supplier_id:    string;
    issue_date:     string;
    due_date:       string;
    currency:       'TRL' | 'USD' | 'EUR' | 'GBP';
    description:    string;
    /** Tedarikçinin KENDİ fatura numarası — KDV indiriminin resmî künyesi. */
    invoice_no?:    string;
    exchange_rate?: number;
    details: Array<{
        quantity:        number;
        unit_price:      number;
        vat_rate:        number;
        discount_type?:  'percentage' | 'amount';
        discount_value?: number;
        description:     string;
        product_id?:     string;
        // warehouse: KASITLI OLARAK YOK — stok invariant
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
    /**
     * DİKKAT: e-belge `issue_date` alanı spec'te READONLY — faturadan miras
     * alınır. Alan arayüzde geriye dönük uyumluluk için durur, HTTP adapter
     * payload'a KOYMAZ.
     */
    issue_date:    string;
    scenario:      'commercial' | 'basic';
    /** Alıcının e-Fatura gelen kutusu (alias). `listEInvoiceInboxes`'tan gelir. */
    to?:           string;
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

    // Purchase bill — alış faturası (filter[invoice_no] YOK → tedarikçi + sayfalama)
    listPurchaseBillsBySupplier(supplierId: string, page: number, pageSize: number): Promise<ParasutPurchaseBill[]>;
    createPurchaseBill(input: PurchaseBillInput): Promise<ParasutPurchaseBill>;

    // Stok mutabakatı (Faz 15)
    listInventoryLevels(productId: string): Promise<ParasutInventoryLevel[]>;
    /** MUTLAK stok ataması — delta değil. Paraşüt stoğunu verilen değere eşitler. */
    createStockUpdate(details: StockUpdateDetailInput[]): Promise<{ id: string }>;

    // Tahsilat/ödeme durumu (tek yönlü okuma)
    getSalesInvoicePaymentState(id: string): Promise<ParasutPaymentState>;
    getPurchaseBillPaymentState(id: string): Promise<ParasutPaymentState>;

    // E-fatura mükellef kontrolü
    listEInvoiceInboxesByVkn(vkn: string): Promise<ParasutEInvoiceInbox[]>;

    // E-document
    createEInvoice(salesInvoiceId: string, input: EInvoiceInput): Promise<{ trackable_job_id: string }>;
    createEArchive(salesInvoiceId: string, input: EArchiveInput): Promise<{ trackable_job_id: string }>;

    // TrackableJob (spec enum: running | done | error)
    getTrackableJob(id: string): Promise<{ status: 'running' | 'done' | 'error'; errors?: string[] }>;
}
