/**
 * Paraşüt — MockParasutAdapter
 * Tüm adapter metodlarını in-memory map ile implement eder.
 * Gerçek HTTP adapter kullanıma hazır olduğunda bu dosya yerini alır.
 */

import {
    ParasutError,
    type ParasutAdapter,
    type OAuthTokens,
    type ParasutContact,
    type ParasutProduct,
    type ParasutInvoice,
    type ParasutInvoiceWithEDocument,
    type ParasutShipmentDocument,
    type ParasutEInvoiceInbox,
    type ContactInput,
    type ProductInput,
    type InvoiceInput,
    type ShipmentDocInput,
    type EInvoiceInput,
    type EArchiveInput,
} from './parasut-adapter';

// ── Re-exports for legacy callers ─────────────────────────────────────────────

export type { ParasutAdapter, OAuthTokens } from './parasut-adapter';
export { ParasutError } from './parasut-adapter';

// ── Mock delay helper ─────────────────────────────────────────────────────────

function mockDelay(minMs = 200, maxMs = 600): Promise<void> {
    return new Promise(r => setTimeout(r, minMs + Math.floor(Math.random() * (maxMs - minMs))));
}

// ── MockParasutAdapter ────────────────────────────────────────────────────────

export class MockParasutAdapter implements ParasutAdapter {
    private contacts        = new Map<string, ParasutContact>();
    private products        = new Map<string, ParasutProduct>();
    private invoices        = new Map<string, ParasutInvoice>();
    private shipments       = new Map<string, ParasutShipmentDocument>();
    private trackableJobs   = new Map<string, { callCount: number; error: boolean }>();
    private eDocuments      = new Map<string, string>(); // invoiceId → eDocId
    // 'random' = %10 rastgele (production mock default)
    // 'disabled' = hata yok (deterministik test)
    // 'forced'   = her zaman hata (hata yolu testi)
    private _errorMode: 'random' | 'disabled' | 'forced' = 'random';

    /**
     * Deterministik test kontrolü.
     *   setErrorMode(false) → hata yok (deterministik)
     *   setErrorMode(true)  → her zaman hata
     * reset() çağrısı 'random' default'una döner.
     */
    setErrorMode(force: boolean): void {
        this._errorMode = force ? 'forced' : 'disabled';
    }

    /** Reset all in-memory state between tests. */
    reset(): void {
        this.contacts.clear();
        this.products.clear();
        this.invoices.clear();
        this.shipments.clear();
        this.trackableJobs.clear();
        this.eDocuments.clear();
        this._pendingJobForInvoice.clear();
        this._pendingJobType.clear();
        this._errorMode = 'random';
    }

    private _shouldError(probability = 0.1): void {
        if (this._errorMode === 'forced' || (this._errorMode === 'random' && Math.random() < probability)) {
            throw new ParasutError('server', 'Mock server error (simulated)');
        }
    }

    // ── OAuth ───────────────────────────────────────────────────────────────

    async exchangeAuthCode(_code: string, _redirectUri: string): Promise<OAuthTokens> {
        await mockDelay();
        return {
            access_token:  `mock_access_${Date.now()}`,
            refresh_token: `mock_refresh_${Date.now()}`,
            expires_at:    new Date(Date.now() + 7200_000).toISOString(),
        };
    }

    async refreshToken(_refreshToken: string): Promise<OAuthTokens> {
        await mockDelay();
        return {
            access_token:  `mock_access_${Date.now()}`,
            refresh_token: `mock_refresh_${Date.now()}`,
            expires_at:    new Date(Date.now() + 7200_000).toISOString(),
        };
    }

    // ── Contact ─────────────────────────────────────────────────────────────

    async findContactsByTaxNumber(taxNumber: string): Promise<ParasutContact[]> {
        await mockDelay();
        return [...this.contacts.values()].filter(c => c.attributes.tax_number === taxNumber);
    }

    async findContactsByEmail(email: string): Promise<ParasutContact[]> {
        await mockDelay();
        return [...this.contacts.values()].filter(c => c.attributes.email === email);
    }

    async createContact(input: ContactInput): Promise<ParasutContact> {
        await mockDelay();
        this._shouldError();
        const id = `contact_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const contact: ParasutContact = {
            id,
            attributes: { name: input.name, tax_number: input.tax_number, email: input.email ?? null },
        };
        this.contacts.set(id, contact);
        return contact;
    }

    // ── Product ─────────────────────────────────────────────────────────────

    async findProductsByCode(code: string): Promise<ParasutProduct[]> {
        await mockDelay();
        return [...this.products.values()].filter(p => p.attributes.code === code);
    }

    async createProduct(input: ProductInput): Promise<ParasutProduct> {
        await mockDelay();
        this._shouldError();
        const id = `product_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const product: ParasutProduct = {
            id,
            attributes: { code: input.code, name: input.name, sales_price: input.sales_price ?? null },
        };
        this.products.set(id, product);
        return product;
    }

    // ── Sales invoice ────────────────────────────────────────────────────────

    async findSalesInvoicesByNumber(series: string, numberInt: number): Promise<ParasutInvoice[]> {
        await mockDelay();
        return [...this.invoices.values()].filter(
            inv => inv.attributes.invoice_series === series && inv.attributes.invoice_id === numberInt
        );
    }

    async createSalesInvoice(input: InvoiceInput): Promise<ParasutInvoice> {
        // Stok invariant assertion
        if (input.shipment_included !== false) {
            throw new ParasutError('validation', 'createSalesInvoice: shipment_included MUST be false');
        }
        for (const d of input.details) {
            if ('warehouse' in d) {
                throw new ParasutError('validation', 'createSalesInvoice: detail must NOT contain warehouse (stok invariant)');
            }
        }

        await mockDelay();
        this._shouldError();

        const id = `invoice_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const invoice: ParasutInvoice = {
            id,
            attributes: {
                invoice_no:      `${input.invoice_series}${new Date().getFullYear()}${String(input.invoice_id).padStart(6, '0')}`,
                invoice_series:  input.invoice_series,
                invoice_id:      input.invoice_id,
                net_total:       input.details.reduce((s, d) => s + d.quantity * d.unit_price, 0),
                gross_total:     input.details.reduce((s, d) => s + d.quantity * d.unit_price * (1 + (d.vat_rate ?? 20) / 100), 0),
                currency:        input.currency,
                issue_date:      input.issue_date,
            },
        };
        this.invoices.set(id, invoice);
        return invoice;
    }

    async getSalesInvoiceWithActiveEDocument(id: string): Promise<ParasutInvoiceWithEDocument> {
        await mockDelay();
        const invoice = this.invoices.get(id);
        if (!invoice) throw new ParasutError('not_found', `Invoice not found: ${id}`);

        const eDocId = this.eDocuments.get(id);
        // Doğru tip: hangi create metodu çağrıldıysa onu yansıt
        const jobId = [...this._pendingJobForInvoice.entries()].find(([, inv]) => inv === id)?.[0];
        const eDocType = (jobId ? this._pendingJobType.get(jobId) : null) ?? 'e_archives';
        return {
            ...invoice,
            active_e_document: eDocId
                ? { id: eDocId, type: eDocType, attributes: { status: 'done' } }
                : null,
        };
    }

    // ── Shipment document ────────────────────────────────────────────────────

    async listRecentShipmentDocuments(page: number, pageSize: number): Promise<ParasutShipmentDocument[]> {
        await mockDelay();
        const all = [...this.shipments.values()];
        const start = (page - 1) * pageSize;
        return all.slice(start, start + pageSize);
    }

    async createShipmentDocument(input: ShipmentDocInput): Promise<ParasutShipmentDocument> {
        // Stok invariant assertion
        if (input.inflow !== false) {
            throw new ParasutError('validation', 'createShipmentDocument: inflow MUST be false for sales');
        }
        if (!input.procurement_number) {
            throw new ParasutError('validation', 'createShipmentDocument: procurement_number is required');
        }

        await mockDelay();
        this._shouldError();

        const id = `shipment_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const shipment: ParasutShipmentDocument = {
            id,
            attributes: {
                inflow:             false,
                procurement_number: input.procurement_number,
                shipment_date:      input.shipment_date,
                issue_date:         input.issue_date,
            },
        };
        this.shipments.set(id, shipment);
        return shipment;
    }

    // ── E-fatura mükellef ────────────────────────────────────────────────────

    async listEInvoiceInboxesByVkn(_vkn: string): Promise<ParasutEInvoiceInbox[]> {
        await mockDelay();
        // Mock: boş döner (e_archive akışı test edilir)
        return [];
    }

    // ── E-document ───────────────────────────────────────────────────────────

    async createEInvoice(salesInvoiceId: string, _input: EInvoiceInput): Promise<{ trackable_job_id: string }> {
        await mockDelay();
        this._shouldError();
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.trackableJobs.set(jobId, { callCount: 0, error: false });
        this._pendingJobForInvoice.set(jobId, salesInvoiceId);
        this._pendingJobType.set(jobId, 'e_invoices');
        return { trackable_job_id: jobId };
    }

    async createEArchive(salesInvoiceId: string, _input: EArchiveInput): Promise<{ trackable_job_id: string }> {
        await mockDelay();
        this._shouldError();
        const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        this.trackableJobs.set(jobId, { callCount: 0, error: false });
        this._pendingJobForInvoice.set(jobId, salesInvoiceId);
        this._pendingJobType.set(jobId, 'e_archives');
        return { trackable_job_id: jobId };
    }

    private _pendingJobForInvoice = new Map<string, string>();
    private _pendingJobType = new Map<string, 'e_invoices' | 'e_archives'>();

    async getTrackableJob(id: string): Promise<{ status: 'running' | 'done' | 'error'; errors?: string[] }> {
        await mockDelay();
        const job = this.trackableJobs.get(id);
        if (!job) throw new ParasutError('not_found', `TrackableJob not found: ${id}`);

        job.callCount++;

        if (job.error) {
            return { status: 'error', errors: ['Mock e-document error'] };
        }

        // İlk 2 çağrı running, sonra done
        if (job.callCount <= 2) return { status: 'running' };

        // done → e_document oluştur
        const invoiceId = this._pendingJobForInvoice.get(id);
        if (invoiceId && !this.eDocuments.has(invoiceId)) {
            const eDocId = `edoc_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            this.eDocuments.set(invoiceId, eDocId);
        }
        return { status: 'done' };
    }
}

// ── Singleton mock instance ───────────────────────────────────────────────────

export const mockParasutAdapter = new MockParasutAdapter();

// ── Adapter factory ───────────────────────────────────────────────────────────

/**
 * Returns the active ParasutAdapter for use in server code.
 * PARASUT_USE_MOCK !== "false" → MockParasutAdapter (default in dev/test).
 * When PARASUT_USE_MOCK=false, a real HTTP adapter must be returned here (Faz 10).
 */
export function getParasutAdapter(): ParasutAdapter {
    if (process.env.PARASUT_USE_MOCK !== "false") {
        return mockParasutAdapter;
    }
    // Real HTTP adapter placeholder — implement in Faz 10
    throw new Error("Real ParasutAdapter not yet implemented. Set PARASUT_USE_MOCK to use mock.");
}

// ── Legacy types (backward compat) ───────────────────────────────────────────

export interface ParasutDetailAttribute {
    quantity:       number;
    unit_price:     number;
    vat_rate:       20;
    description:    string;
    discount_type:  'percentage';
    discount_value: number;
    product:        { data: { type: 'products'; id: string } };
}

export interface ParasutInvoicePayload {
    data: {
        type: 'sales_invoices';
        attributes: {
            item_type:          'invoice';
            description:        string;
            issue_date:         string;
            due_date:           string;
            currency:           'TRL' | 'USD' | 'EUR' | 'GBP';
            invoice_series:     'KE';
            invoice_id:         number;
            details_attributes: ParasutDetailAttribute[];
        };
        relationships: {
            contact: { data: { type: 'contacts'; id: string } };
        };
    };
}

export type ParasutSyncResult =
    | { success: true;  invoiceId: string; sentAt: string }
    | { success: false; error: string };

/**
 * Legacy wrapper — mevcut parasut-service.ts kullanıyor.
 * Yeni kod direkt MockParasutAdapter metotlarını çağırmalı.
 */
export async function sendInvoiceToParasut(
    payload: ParasutInvoicePayload
): Promise<ParasutSyncResult> {
    const attrs = payload.data.attributes;
    const contact = payload.data.relationships.contact.data.id;

    try {
        const inv = await mockParasutAdapter.createSalesInvoice({
            contact_id:        contact,
            invoice_series:    attrs.invoice_series,
            invoice_id:        attrs.invoice_id,
            issue_date:        attrs.issue_date,
            due_date:          attrs.due_date,
            currency:          attrs.currency === 'GBP' ? 'GBP' : attrs.currency,
            shipment_included: false,
            description:       attrs.description,
            details:           attrs.details_attributes.map(d => ({
                quantity:       d.quantity,
                unit_price:     d.unit_price,
                vat_rate:       d.vat_rate,
                discount_type:  d.discount_type,
                discount_value: d.discount_value,
                description:    d.description,
                product_id:     d.product.data.id,
            })),
        });
        return { success: true, invoiceId: inv.id, sentAt: new Date().toISOString() };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { success: false, error: msg };
    }
}

/** Legacy re-export — service.ts mapOrderToInvoice kullanıyor */
export function mapOrderToInvoice(order: {
    orderNumber: string;
    createdAt: string;
    currency: string;
    customerId: string;
    lines: Array<{
        quantity: number;
        unitPrice: number;
        discountPct: number;
        productName: string;
        productSku: string;
        productId: string;
    }>;
}): ParasutInvoicePayload {
    const issued = new Date(order.createdAt);
    const due = new Date(issued);
    due.setDate(due.getDate() + 30);

    const parts = order.orderNumber.split('-');
    const invoiceId = parts.length >= 3
        ? parseInt(parts[1] + parts[2], 10)
        : Date.now();

    const mapCurr = (c: string): 'TRL' | 'USD' | 'EUR' | 'GBP' => {
        if (c === 'USD') return 'USD';
        if (c === 'EUR') return 'EUR';
        if (c === 'GBP') return 'GBP';
        return 'TRL';
    };

    return {
        data: {
            type: 'sales_invoices',
            attributes: {
                item_type:      'invoice',
                description:    `KokpitERP #${order.orderNumber}`,
                issue_date:     order.createdAt.slice(0, 10),
                due_date:       due.toISOString().slice(0, 10),
                currency:       mapCurr(order.currency),
                invoice_series: 'KE',
                invoice_id:     invoiceId,
                details_attributes: order.lines.map(line => ({
                    quantity:       line.quantity,
                    unit_price:     line.unitPrice,
                    vat_rate:       20,
                    description:    `${line.productName} (${line.productSku})`,
                    discount_type:  'percentage',
                    discount_value: line.discountPct,
                    product:        { data: { type: 'products', id: line.productId } },
                })),
            },
            relationships: {
                contact: { data: { type: 'contacts', id: order.customerId } },
            },
        },
    };
}
