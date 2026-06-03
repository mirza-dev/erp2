/**
 * Import Service — ImportBatch lifecycle + ImportDraft merge.
 * domain-rules §9: import = parse → preview → user confirmation → draft entity creation
 * §9.2: hiçbir zaman doğrudan approved entity oluşturmaz
 */

import {
    dbGetBatch, dbUpdateBatchStatus, dbListDrafts, dbUpdateDraft,
    dbClaimBatchForConfirm,
    type CreateDraftInput, dbCreateDrafts,
} from "@/lib/supabase/import";
import type { VendorRow } from "@/lib/database.types";
import { dbIncrementMappingSuccess } from "@/lib/supabase/column-mappings";
import { dbCreateCustomer, dbFindCustomerByName, dbFindCustomerByCode, dbFindCustomerByEmail, dbUpdateCustomer } from "@/lib/supabase/customers";
import { dbLookupEntityAlias, dbSaveEntityAlias } from "@/lib/supabase/entity-aliases";
import { dbCreateProduct, dbFindProductBySku, dbRecordMovementAtomic, dbRecordStockTransfer, dbUpdateProduct } from "@/lib/supabase/products";
import type { Permission } from "@/lib/auth/permissions";
import { dbCreateVendor, dbListVendors, dbUpdateVendor } from "@/lib/supabase/vendors";
import { dbUpsertProductVendorLink } from "@/lib/supabase/product-vendor-links";
import { dbFindOrderByOriginalNumber, dbCreateOrder } from "@/lib/supabase/orders";
import { dbCreateQuote, dbFindQuoteByNumber, dbUpdateQuote } from "@/lib/supabase/quotes";
import { dbCreateShipment } from "@/lib/supabase/shipments";
import { dbCreateInvoice, dbFindInvoiceByNumber, dbUpdateInvoice, dbUpdateInvoiceStatus, dbSumPaymentsForInvoice } from "@/lib/supabase/invoices";
import { dbCreatePayment } from "@/lib/supabase/payments";
// order-service is intentionally NOT imported here:
// serviceCreateOrder validates lines.length > 0, which would always fail for
// import order drafts (lines come separately as order_line entity drafts, processed
// after the order header in the same batch).  We call dbCreateOrder directly so
// the RPC receives lines:[] and creates the header only — order_lines are appended
// in the order_line branch.  §9.2 compliance (draft only) is enforced below.
import { createServiceClient } from "@/lib/supabase/service";
import {
    defaultFieldApprovals,
    FINANCIAL_IMPORT_FIELDS,
    normalizeStockDirection,
    parseBooleanLike,
    type ImportFieldApproval,
} from "@/lib/import-center";

// ── Batch ────────────────────────────────────────────────────

/** Batch'e draft ekle ve status → review yap */
export async function serviceAddDraftsToBatch(
    batchId: string,
    drafts: Omit<CreateDraftInput, "batch_id">[]
) {
    const batch = await dbGetBatch(batchId);
    if (!batch) throw new Error("Batch bulunamadı.");
    if (batch.status === "confirmed") throw new Error("Onaylanmış batch'e draft eklenemez.");

    const created = await dbCreateDrafts(drafts.map(d => ({ ...d, batch_id: batchId })));

    // pending → review
    if (batch.status === "pending" || batch.status === "processing") {
        await dbUpdateBatchStatus(batchId, "review");
    }

    return created;
}

// ── Confirm ──────────────────────────────────────────────────

export type ConfirmEntityType =
    | "customer" | "product" | "vendor" | "quote" | "order" | "order_line"
    | "stock" | "shipment" | "invoice" | "payment";

export interface EntityCounts {
    added: number;
    updated: number;
    skipped: number;
}

export interface ConfirmResult {
    added: number;    // gerçekten INSERT edilen yeni kayıtlar (toplam — geriye dönük uyumlu)
    updated: number;  // mevcut kaydın UPDATE edildiği veya eşlendiği durumlar (toplam)
    skipped: number;  // (toplam)
    errors: string[];
    /** Sprint B G6: Sonuç ekranında "neyin ne kadar aktarıldığı" için entity-bazlı kırılım. */
    byEntity: Record<ConfirmEntityType, EntityCounts>;
}

export interface ConfirmBatchOptions {
    actorUserId?: string | null;
    permissions?: Set<Permission>;
}

function makeEmptyByEntity(): Record<ConfirmEntityType, EntityCounts> {
    return {
        customer:   { added: 0, updated: 0, skipped: 0 },
        product:    { added: 0, updated: 0, skipped: 0 },
        vendor:     { added: 0, updated: 0, skipped: 0 },
        quote:      { added: 0, updated: 0, skipped: 0 },
        order:      { added: 0, updated: 0, skipped: 0 },
        order_line: { added: 0, updated: 0, skipped: 0 },
        stock:      { added: 0, updated: 0, skipped: 0 },
        shipment:   { added: 0, updated: 0, skipped: 0 },
        invoice:    { added: 0, updated: 0, skipped: 0 },
        payment:    { added: 0, updated: 0, skipped: 0 },
    };
}

// Entity processing order — respects dependency chain
const ENTITY_PRIORITY: Record<string, number> = {
    product: 1, vendor: 2, customer: 3, quote: 4, order: 5,
    order_line: 6, stock: 6, shipment: 7, invoice: 8, payment: 9,
};

const IMPORT_OPERATION_FIELD = "__ai_import_operation";
const DEFAULT_CONFIRM_PERMS = new Set<Permission>([
    "manage_import",
    "manage_product_master",
    "view_sales_prices",
    "view_purchase_costs",
    "stock_adjust_general",
    "manage_vendors",
]);

/**
 * Numeric field parser that preserves 0 as a valid value.
 * Handles TR format (1.234,56) with thousands dot + decimal comma.
 * Treats null/undefined/"" as absent (returns undefined), but keeps 0 and "0".
 */
function parseNumeric(value: unknown): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    if (typeof value === "number") return value;
    const s = String(value).trim();
    // TR format: 1.234,56 → strip thousands dots, replace decimal comma
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
        const n = Number(s.replace(/\./g, "").replace(",", "."));
        return Number.isNaN(n) ? undefined : n;
    }
    // EN format or simple comma-decimal: 1234.56 or 1234,56
    const n = Number(s.replace(",", "."));
    return Number.isNaN(n) ? undefined : n;
}

function maybeString(value: unknown): string | undefined {
    if (value === null || value === undefined) return undefined;
    const s = String(value).trim();
    return s ? s : undefined;
}

function maybeFiniteNumber(value: unknown): number | undefined {
    const parsed = parseNumeric(value);
    return parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined;
}

function parseApprovals(raw: unknown, data: Record<string, unknown>): Record<string, ImportFieldApproval> {
    const defaults = defaultFieldApprovals(data);
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaults;
    const allowed = new Set<ImportFieldApproval>(["apply", "skip", "clear"]);
    const out = { ...defaults };
    for (const [field, value] of Object.entries(raw as Record<string, unknown>)) {
        if (allowed.has(value as ImportFieldApproval)) out[field] = value as ImportFieldApproval;
    }
    return out;
}

function canApplyFinancialField(field: string, perms: Set<Permission>): boolean {
    if (field === "price") {
        return perms.has("manage_import") && perms.has("manage_product_master") && perms.has("view_sales_prices");
    }
    if (field === "cost_price") {
        return perms.has("manage_import") && perms.has("manage_product_master") && perms.has("view_purchase_costs");
    }
    return true;
}

function buildApprovedData(input: {
    data: Record<string, unknown>;
    approvals: Record<string, ImportFieldApproval>;
    perms: Set<Permission>;
}): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (input.data[IMPORT_OPERATION_FIELD] !== undefined) {
        result[IMPORT_OPERATION_FIELD] = input.data[IMPORT_OPERATION_FIELD];
    }
    for (const [field, value] of Object.entries(input.data)) {
        if (field === IMPORT_OPERATION_FIELD) continue;
        const approval = input.approvals[field] ?? (FINANCIAL_IMPORT_FIELDS.has(field) ? "skip" : "apply");
        if (approval === "skip") continue;
        if (!canApplyFinancialField(field, input.perms)) continue;
        result[field] = approval === "clear" ? "" : value;
    }
    return result;
}

function hasStockPermission(perms: Set<Permission>): boolean {
    return perms.has("manage_import") && perms.has("stock_adjust_general");
}

function normalizeEmail(value: unknown): string | undefined {
    const s = maybeString(value)?.toLowerCase();
    return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined;
}

/**
 * Batch'teki tüm confirmed (veya pending) draftları merge et.
 * domain-rules §9.2: hiçbir zaman doğrudan approved order oluşturmaz
 */
export async function serviceConfirmBatch(batchId: string, options: ConfirmBatchOptions = {}): Promise<ConfirmResult> {
    const batch = await dbGetBatch(batchId);
    if (!batch) throw new Error("Batch bulunamadı.");
    if (batch.status === "confirmed") throw new Error("Batch zaten onaylanmış.");

    // Sprint B G3: Atomik CAS — yarışı kazan veya çık.
    // pending/review değilse (örn: zaten confirming/failed/processing) null döner.
    const claimed = await dbClaimBatchForConfirm(batchId);
    if (!claimed) {
        throw new Error("Bu içe aktarım zaten işleniyor veya uygun durumda değil.");
    }

    try {
        return await runConfirmFlow(batchId, options);
    } catch (err) {
        // Eğer confirm tamamlanmadan exception olursa batch 'confirming' durumda
        // kalır ve hiçbir zaman yeniden tetiklenemez. 'review'e geri çek.
        try { await dbUpdateBatchStatus(batchId, "review"); } catch { /* best-effort */ }
        throw err;
    }
}

async function runConfirmFlow(batchId: string, options: ConfirmBatchOptions = {}): Promise<ConfirmResult> {
    const actorUserId = options.actorUserId ?? null;
    const perms = options.permissions ?? DEFAULT_CONFIRM_PERMS;
    const drafts = await dbListDrafts(batchId);
    const toMerge = drafts
        .filter(d => d.status === "confirmed" || d.status === "pending")
        .sort((a, b) => (ENTITY_PRIORITY[a.entity_type] ?? 99) - (ENTITY_PRIORITY[b.entity_type] ?? 99));

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];
    const byEntity = makeEmptyByEntity();
    const bumpEntity = (et: string, kind: "added" | "updated" | "skipped"): void => {
        const key = et as ConfirmEntityType;
        if (key in byEntity) byEntity[key][kind]++;
    };

    // Cross-reference map — resolve entity references within this batch
    const refMap = {
        customerCodes: new Map<string, string>(),   // Musteri_Kodu → customer uuid
        quoteNumbers:  new Map<string, string>(),   // Teklif_No → quote uuid
        orderNumbers:  new Map<string, string>(),   // Siparis_No → order uuid
        invoiceNumbers: new Map<string, string>(),  // Fatura_No → invoice uuid
        productSkus:   new Map<string, string>(),   // Urun_Kodu → product uuid
    };

    let activeVendorsCache: VendorRow[] | null = null;
    const getActiveVendors = async (): Promise<VendorRow[]> => {
        if (!activeVendorsCache) activeVendorsCache = await dbListVendors({ isActive: true });
        return activeVendorsCache;
    };

    // Sprint B G4: Aynı order'a multiple line draft → her birinde DB'den okumak
    // güncel olmayan state veriyordu (mevcut INSERT henüz commit olmadıysa görünmez).
    // Per-order cache ile sıralı sort_order garanti.
    const nextSortByOrder = new Map<string, number>();

    let rowNum = 0;
    for (const draft of toMerge) {
        rowNum++;
        if (draft.status === "rejected") { skipped++; bumpEntity(draft.entity_type, "skipped"); continue; }

        const base = (draft.parsed_data ?? {}) as Record<string, unknown>;
        const corrections = (draft.user_corrections ?? {}) as Record<string, unknown>;
        const rawData = { ...base, ...corrections };
        const approvals = parseApprovals(draft.field_approvals, rawData);
        const data = buildApprovedData({ data: rawData, approvals, perms });
        const importOperation = typeof data[IMPORT_OPERATION_FIELD] === "string"
            ? data[IMPORT_OPERATION_FIELD]
            : null;

        try {
            if (draft.entity_type === "customer") {
                const customerName = String(data.name ?? "");
                const customerCode = data.customer_code ? String(data.customer_code) : undefined;
                const customerEmail = normalizeEmail(data.email);

                let customerId: string;
                const existingByCode = customerCode ? await dbFindCustomerByCode(customerCode) : null;
                const existingByEmail = !existingByCode && customerEmail ? await dbFindCustomerByEmail(customerEmail) : null;
                // Alias memory: geçmiş import'larda öğrenilen ham değer → entity eşlemesi
                const aliasMatch = !existingByCode && !existingByEmail && customerName
                    ? await dbLookupEntityAlias(customerName, "customer")
                    : null;
                const existing = existingByCode ?? existingByEmail;

                const customerUpdateFields = {
                    name: customerName || undefined,
                    email: customerEmail,
                    phone: data.phone ? String(data.phone) : undefined,
                    address: data.address ? String(data.address) : undefined,
                    tax_number: data.tax_number ? String(data.tax_number) : undefined,
                    tax_office: data.tax_office ? String(data.tax_office) : undefined,
                    country: data.country ? String(data.country) : undefined,
                    currency: data.currency ? String(data.currency) : undefined,
                    notes: data.notes ? String(data.notes) : undefined,
                    payment_terms_days: parseNumeric(data.payment_terms_days),
                    customer_code: data.customer_code ? String(data.customer_code) : undefined,
                    default_incoterm: data.default_incoterm ? String(data.default_incoterm) : undefined,
                };

                if (aliasMatch) {
                    // Alias hit — önceki import'tan öğrenilmiş, doğrudan çözümlendi
                    customerId = aliasMatch;
                    await dbUpdateCustomer(aliasMatch, customerUpdateFields);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: aliasMatch });
                    updated++; bumpEntity(draft.entity_type, "updated");
                } else if (existing) {
                    customerId = existing.id;
                    await dbUpdateCustomer(existing.id, customerUpdateFields);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: existing.id });
                    // Bu eşleşmeyi gelecek import'lar için kaydet
                    if (customerName) void dbSaveEntityAlias(customerName, "customer", existing.id, existing.name);
                    updated++; bumpEntity(draft.entity_type, "updated");
                } else {
                    const customer = await dbCreateCustomer({
                        name: customerName,
                        email: customerEmail,
                        phone: data.phone ? String(data.phone) : undefined,
                        address: data.address ? String(data.address) : undefined,
                        tax_number: data.tax_number ? String(data.tax_number) : undefined,
                        tax_office: data.tax_office ? String(data.tax_office) : undefined,
                        country: data.country ? String(data.country) : undefined,
                        currency: data.currency ? String(data.currency) : "USD",
                        notes: data.notes ? String(data.notes) : undefined,
                        payment_terms_days: parseNumeric(data.payment_terms_days),
                        default_incoterm: data.default_incoterm ? String(data.default_incoterm) : undefined,
                        customer_code: customerCode,
                    });
                    customerId = customer.id;
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: customer.id });
                    // Yeni müşteri — bu ismi gelecek import'lar için kaydet
                    if (customerName) void dbSaveEntityAlias(customerName, "customer", customer.id, customerName);
                    added++; bumpEntity(draft.entity_type, "added");
                }
                if (customerCode) refMap.customerCodes.set(customerCode, customerId);

            } else if (draft.entity_type === "product") {
                if (importOperation === "vendor_product_relation") {
                    const sku = maybeString(data.sku);
                    if (!sku) {
                        errors.push(`Satır ${rowNum}: Tedarikçi ürün ilişkisi için SKU eksik.`);
                        await dbUpdateDraft(draft.id, { status: "rejected" });
                        skipped++; bumpEntity(draft.entity_type, "skipped");
                        continue;
                    }
                    const existingProduct = await dbFindProductBySku(sku);
                    if (!existingProduct) {
                        errors.push(`Satır ${rowNum}: '${sku}' kodlu ürün bulunamadı.`);
                        await dbUpdateDraft(draft.id, { status: "rejected" });
                        skipped++; bumpEntity(draft.entity_type, "skipped");
                        continue;
                    }
                    const vendors = await getActiveVendors();
                    const vendorName = maybeString(data.vendor_name) ?? maybeString(data.preferred_vendor);
                    const vendorEmail = normalizeEmail(data.vendor_email);
                    const normEmail = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
                    const normText = (v: string | null | undefined) => (v ?? "").trim().toLocaleLowerCase("tr-TR");
                    const vendor = (vendorEmail ? vendors.find(v => normEmail(v.contact_email) === vendorEmail) : undefined)
                        ?? (vendorName ? vendors.find(v => normText(v.name) === normText(vendorName)) : undefined);
                    if (!vendor) {
                        errors.push(`Satır ${rowNum}: Tedarikçi-ürün ilişkisi için tedarikçi eşleşmedi.`);
                        await dbUpdateDraft(draft.id, { status: "rejected" });
                        skipped++; bumpEntity(draft.entity_type, "skipped");
                        continue;
                    }
                    const leadTimeDays = maybeFiniteNumber(data.lead_time_days);
                    const moq = maybeFiniteNumber(data.moq) ?? maybeFiniteNumber(data.reorder_qty);
                    const vendorSku = maybeString(data.vendor_sku);
                    const isPreferred = parseBooleanLike(data.is_preferred);
                    const notes = maybeString(data.notes);
                    if (!vendorSku && leadTimeDays === undefined && moq === undefined && isPreferred === undefined && !notes) {
                        errors.push(`Satır ${rowNum}: Tedarikçi ürün ilişkisi için uygulanacak alan bulunamadı.`);
                        await dbUpdateDraft(draft.id, { status: "rejected" });
                        skipped++; bumpEntity(draft.entity_type, "skipped");
                        continue;
                    }
                    await dbUpsertProductVendorLink({
                        product_id: existingProduct.id,
                        vendor_id: vendor.id,
                        vendor_sku: vendorSku,
                        lead_time_days: leadTimeDays,
                        moq,
                        is_preferred: isPreferred,
                        notes,
                        actor: actorUserId,
                    });
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: existingProduct.id });
                    updated++; bumpEntity(draft.entity_type, "updated");
                    refMap.productSkus.set(sku, existingProduct.id);
                    continue;
                }

                if (!data.sku || !data.name || !data.unit) {
                    const missing: string[] = [];
                    if (!data.name) missing.push("ürün adı");
                    if (!data.sku)  missing.push("ürün kodu (SKU)");
                    if (!data.unit) missing.push("ölçü birimi");
                    errors.push(`Satır ${rowNum}: ${missing.join(", ")} eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                const sku = String(data.sku);
                const existingProduct = await dbFindProductBySku(sku);
                let productId: string;
                if (existingProduct) {
                    // ── Master-data update ─────────────────────────────────────────
                    // Product import = identity/catalog data only.
                    // on_hand is NEVER updated here — stock changes require the
                    // dedicated "stock" entity_type sheet.  See stock branch below.
                    // ──────────────────────────────────────────────────────────────
                    const updatedProduct = await dbUpdateProduct(existingProduct.id, {
                        name: String(data.name),
                        category: data.category ? String(data.category) : undefined,
                        unit: String(data.unit),
                        price: parseNumeric(data.price),
                        currency: data.currency ? String(data.currency) : undefined,
                        min_stock_level: parseNumeric(data.min_stock_level),
                        reorder_qty: parseNumeric(data.reorder_qty),
                        preferred_vendor: data.preferred_vendor ? String(data.preferred_vendor) : undefined,
                        product_family: data.product_family ? String(data.product_family) : undefined,
                        sub_category: data.sub_category ? String(data.sub_category) : undefined,
                        sector_compatibility: data.sector_compatibility ? String(data.sector_compatibility) : undefined,
                        cost_price: parseNumeric(data.cost_price),
                        weight_kg: parseNumeric(data.weight_kg),
                        material_quality: data.material_quality ? String(data.material_quality) : undefined,
                        production_site: data.production_site ? String(data.production_site) : undefined,
                        use_cases: data.use_cases ? String(data.use_cases) : undefined,
                        industries: data.industries ? String(data.industries) : undefined,
                        standards: data.standards ? String(data.standards) : undefined,
                        certifications: data.certifications ? String(data.certifications) : undefined,
                        product_notes: data.product_notes ? String(data.product_notes) : undefined,
                        origin_country: data.origin_country ? String(data.origin_country) : undefined,
                        lead_time_days: parseNumeric(data.lead_time_days),
                    });
                    productId = updatedProduct.id;
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: updatedProduct.id });
                    updated++; bumpEntity(draft.entity_type, "updated");
                } else {
                    // ── New product creation ───────────────────────────────────────
                    // on_hand IS included here to set the initial inventory level
                    // for a brand-new product.  Subsequent stock adjustments must
                    // go through the "stock" entity_type sheet.
                    // ──────────────────────────────────────────────────────────────
                    const product = await dbCreateProduct({
                        name: String(data.name),
                        sku,
                        category: data.category ? String(data.category) : undefined,
                        unit: String(data.unit),
                        price: parseNumeric(data.price),
                        currency: data.currency ? String(data.currency) : "USD",
                        on_hand: parseNumeric(data.on_hand),
                        min_stock_level: parseNumeric(data.min_stock_level),
                        reorder_qty: parseNumeric(data.reorder_qty),
                        preferred_vendor: data.preferred_vendor ? String(data.preferred_vendor) : undefined,
                        product_family: data.product_family ? String(data.product_family) : undefined,
                        sub_category: data.sub_category ? String(data.sub_category) : undefined,
                        sector_compatibility: data.sector_compatibility ? String(data.sector_compatibility) : undefined,
                        cost_price: parseNumeric(data.cost_price),
                        weight_kg: parseNumeric(data.weight_kg),
                        material_quality: data.material_quality ? String(data.material_quality) : undefined,
                        production_site: data.production_site ? String(data.production_site) : undefined,
                        use_cases: data.use_cases ? String(data.use_cases) : undefined,
                        industries: data.industries ? String(data.industries) : undefined,
                        standards: data.standards ? String(data.standards) : undefined,
                        certifications: data.certifications ? String(data.certifications) : undefined,
                        product_notes: data.product_notes ? String(data.product_notes) : undefined,
                        origin_country: data.origin_country ? String(data.origin_country) : undefined,
                        lead_time_days: parseNumeric(data.lead_time_days),
                    });
                    productId = product.id;
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: product.id });
                    added++; bumpEntity(draft.entity_type, "added");
                }
                refMap.productSkus.set(sku, productId);

            } else if (draft.entity_type === "vendor") {
                const vendorName = String(data.name ?? "").trim();
                const email = maybeString(data.contact_email) ?? maybeString(data.email);
                const phone = maybeString(data.contact_phone) ?? maybeString(data.phone);
                const taxNumber = maybeString(data.tax_number);
                const vendors = await getActiveVendors();
                const normEmail = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();
                const normText = (v: string | null | undefined) => (v ?? "").trim().toLocaleLowerCase("tr-TR");
                const normPlain = (v: string | null | undefined) => (v ?? "").trim();
                const existing =
                    (email ? vendors.find(v => normEmail(v.contact_email) === normEmail(email)) : undefined)
                    ?? (taxNumber ? vendors.find(v => normPlain(v.tax_number) === normPlain(taxNumber)) : undefined)
                    ?? (phone ? vendors.find(v => normPlain(v.contact_phone) === normPlain(phone)) : undefined)
                    ?? (vendorName ? vendors.find(v => normText(v.name) === normText(vendorName)) : undefined);

                const vendorFields = {
                    name: vendorName || undefined,
                    contact_email: email,
                    contact_phone: phone,
                    contact_person: maybeString(data.contact_person),
                    tax_number: taxNumber,
                    address: maybeString(data.address),
                    currency: maybeString(data.currency),
                    payment_terms_days: maybeFiniteNumber(data.payment_terms_days),
                    lead_time_days: maybeFiniteNumber(data.lead_time_days),
                    notes: maybeString(data.notes),
                };

                if (existing) {
                    const updatedVendor = await dbUpdateVendor(existing.id, vendorFields);
                    activeVendorsCache = vendors.map(v => v.id === updatedVendor.id ? updatedVendor : v);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: existing.id });
                    updated++; bumpEntity(draft.entity_type, "updated");
                } else {
                    if (!vendorName) {
                        errors.push(`Satır ${rowNum}: Tedarikçi adı eksik.`);
                        await dbUpdateDraft(draft.id, { status: "rejected" });
                        skipped++; bumpEntity(draft.entity_type, "skipped");
                        continue;
                    }
                    const vendor = await dbCreateVendor({
                        name: vendorName,
                        contact_email: email,
                        contact_phone: phone,
                        contact_person: maybeString(data.contact_person),
                        tax_number: taxNumber,
                        address: maybeString(data.address),
                        currency: maybeString(data.currency) ?? "TRY",
                        payment_terms_days: maybeFiniteNumber(data.payment_terms_days),
                        lead_time_days: maybeFiniteNumber(data.lead_time_days),
                        notes: maybeString(data.notes),
                    });
                    activeVendorsCache = [...vendors, vendor];
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: vendor.id });
                    added++; bumpEntity(draft.entity_type, "added");
                }

            } else if (draft.entity_type === "quote") {
                const quoteNumber = String(data.quote_number ?? "");
                if (!quoteNumber) {
                    errors.push(`Satır ${rowNum}: Teklif numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }

                const customerCode = data.customer_code ? String(data.customer_code) : undefined;
                const customerId = customerCode
                    ? (refMap.customerCodes.get(customerCode) ?? (await dbFindCustomerByCode(customerCode))?.id)
                    : undefined;

                const existing = await dbFindQuoteByNumber(quoteNumber);
                if (existing) {
                    await dbUpdateQuote(existing.id, {
                        customer_id: customerId ?? null,
                        customer_name: customerCode ?? existing.customer_name,
                        currency: data.currency ? String(data.currency) : existing.currency,
                        quote_date: data.quote_date ? String(data.quote_date).split("T")[0] : existing.quote_date ?? undefined,
                        grand_total: parseNumeric(data.total_amount) ?? existing.grand_total,
                        vat_rate: existing.vat_rate, subtotal: existing.subtotal, vat_total: existing.vat_total,
                        // Faz 3 (V7): import iskontoyu işlemez → mevcut snapshot'ı koru (sıfırlama).
                        discount_amount: existing.discount_amount,
                        lines: [],
                    });
                    refMap.quoteNumbers.set(quoteNumber, existing.id);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: existing.id });
                    updated++; bumpEntity(draft.entity_type, "updated");
                } else {
                    const quote = await dbCreateQuote({
                        quote_number: quoteNumber,
                        customer_id: customerId ?? null,
                        customer_name: customerCode ?? "",
                        currency: data.currency ? String(data.currency) : "USD",
                        quote_date: data.quote_date ? String(data.quote_date).split("T")[0] : new Date().toISOString().split("T")[0],
                        grand_total: parseNumeric(data.total_amount) ?? 0,
                        vat_rate: 0, subtotal: 0, vat_total: 0,
                        // Faz 3 (V7): import iskontoyu işlemez → 0.
                        discount_amount: 0,
                        lines: [],
                    });
                    refMap.quoteNumbers.set(quoteNumber, quote.id);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: quote.id });
                    added++; bumpEntity(draft.entity_type, "added");
                }

            } else if (draft.entity_type === "order") {
                // §9.2: import creates DRAFT orders — never approved
                const customerCode = data.customer_code ? String(data.customer_code) : undefined;
                const customerName = String(data.customer_name ?? data.musteri ?? "");

                let customerId: string | undefined;
                if (customerCode) {
                    customerId = refMap.customerCodes.get(customerCode)
                        ?? (await dbFindCustomerByCode(customerCode))?.id;
                }
                if (!customerId && customerName) {
                    customerId = (await dbFindCustomerByName(customerName))?.id;
                }

                const quoteNumber = data.quote_number ? String(data.quote_number) : undefined;
                let quoteId: string | undefined;
                if (quoteNumber) {
                    quoteId = refMap.quoteNumbers.get(quoteNumber)
                        ?? (await dbFindQuoteByNumber(quoteNumber))?.id;
                }

                const grandTotal = Number(data.grand_total ?? data.tutar ?? 0);
                const subtotal = grandTotal / 1.20;
                const vatTotal = grandTotal - subtotal;

                const originalOrderNumber = data.original_order_number ? String(data.original_order_number) : undefined;

                // §9.2: always draft — never approved on import
                const order = await dbCreateOrder({
                    customer_id: customerId,
                    customer_name: customerName || "Bilinmeyen Müşteri",
                    currency: String(data.currency ?? "USD"),
                    notes: `İçe aktarım batch: ${batchId}`,
                    commercial_status: "draft",
                    fulfillment_status: "unallocated",
                    subtotal,
                    vat_total: vatTotal,
                    grand_total: grandTotal,
                    incoterm: data.incoterm ? String(data.incoterm) : undefined,
                    planned_shipment_date: data.planned_shipment_date ? String(data.planned_shipment_date).split("T")[0] : undefined,
                    quote_id: quoteId,
                    original_order_number: originalOrderNumber,
                    lines: [],
                    // lines intentionally empty — order_line entity_type drafts (priority 5)
                    // are processed after this header and appended via direct DB insert.
                });

                if (originalOrderNumber) refMap.orderNumbers.set(originalOrderNumber, order.id);
                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: order.id });
                added++; bumpEntity(draft.entity_type, "added");

            } else if (draft.entity_type === "order_line") {
                const orderNumber = data.order_number ? String(data.order_number) : undefined;
                const productSku = data.product_sku ? String(data.product_sku) : undefined;

                if (!orderNumber || !productSku) {
                    errors.push(`Satır ${rowNum}: Sipariş numarası ve ürün kodu (SKU) zorunludur.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }

                const orderId = refMap.orderNumbers.get(orderNumber)
                    ?? (await dbFindOrderByOriginalNumber(orderNumber))?.id;
                if (!orderId) {
                    errors.push(`Satır ${rowNum}: '${orderNumber}' numaralı sipariş bulunamadı.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }

                const productId = refMap.productSkus.get(productSku)
                    ?? (await dbFindProductBySku(productSku))?.id;

                const supabase = createServiceClient();
                const quantity = Number(data.quantity ?? 1);
                const unitPrice = Number(data.unit_price ?? 0);
                const discountPct = Number(data.discount_pct ?? 0);
                const lineTotal = parseNumeric(data.line_total) ?? quantity * unitPrice * (1 - discountPct / 100);

                // Sprint B G4: Cache'te varsa onu kullan (aynı batch'te çoklu line için collision önler);
                // ilk kez görüyorsak DB'den max + 1 oku.
                let sortOrder: number;
                const cached = nextSortByOrder.get(orderId);
                if (cached !== undefined) {
                    sortOrder = cached;
                } else {
                    const { data: existingLines } = await supabase
                        .from("order_lines")
                        .select("sort_order")
                        .eq("order_id", orderId)
                        .order("sort_order", { ascending: false })
                        .limit(1);
                    sortOrder = existingLines && existingLines.length > 0 ? existingLines[0].sort_order + 1 : 1;
                }
                nextSortByOrder.set(orderId, sortOrder + 1);

                const { error: lineInsertErr } = await supabase.from("order_lines").insert({
                    order_id: orderId,
                    product_id: productId ?? null,
                    product_name: data.product_name ? String(data.product_name) : productSku,
                    product_sku: productSku,
                    unit: data.unit ? String(data.unit) : "Adet",
                    quantity,
                    unit_price: unitPrice,
                    discount_pct: discountPct,
                    line_total: lineTotal,
                    sort_order: sortOrder,
                });
                if (lineInsertErr) {
                    errors.push(`Satır ${rowNum}: Sipariş satırı kaydedilemedi — ${lineInsertErr.message}`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }

                // Update order totals — best-effort, non-blocking
                const { data: allLines } = await supabase
                    .from("order_lines")
                    .select("line_total")
                    .eq("order_id", orderId);
                const subtotal = (allLines ?? []).reduce((s: number, l: { line_total?: number | null }) => s + (l.line_total ?? 0), 0);
                const vatTotal = subtotal * 0.20;
                const { error: updateErr } = await supabase.from("sales_orders").update({
                    subtotal,
                    vat_total: vatTotal,
                    grand_total: subtotal + vatTotal,
                    item_count: (allLines ?? []).length,
                }).eq("id", orderId);
                if (updateErr) console.warn("[import] order totals update failed:", updateErr.message);

                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: orderId });
                added++; bumpEntity(draft.entity_type, "added");

            } else if (draft.entity_type === "stock") {
                if (!hasStockPermission(perms)) {
                    errors.push(`Satır ${rowNum}: Stok içe aktarımı için yetkiniz yok.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                if (!data.sku) {
                    errors.push(`Satır ${rowNum}: Ürün kodu (SKU) eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                if (data.on_hand === undefined) {
                    errors.push(`Satır ${rowNum}: Stok miktarı (on_hand) eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                const prod = await dbFindProductBySku(String(data.sku));
                if (!prod) {
                    errors.push(`Satır ${rowNum}: '${data.sku}' kodlu ürün bulunamadı.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                const quantity = maybeFiniteNumber(data.on_hand);
                if (quantity === undefined) {
                    errors.push(`Satır ${rowNum}: Stok miktarı (on_hand) geçersiz.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                const stockOperation = importOperation === "stock_movement" ? "stock_movement" : "stock_count";
                if (stockOperation === "stock_count" && quantity < 0) {
                    errors.push(`Satır ${rowNum}: Stok sayımı negatif olamaz.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                let delta: number;
                let movementNote: string;
                if (stockOperation === "stock_count") {
                    delta = quantity - prod.on_hand;
                    movementNote = `Excel/CSV stok sayımı: mevcut ${prod.on_hand}, sayılan ${quantity}`;
                    if (delta === 0) {
                        await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: prod.id });
                        updated++; bumpEntity(draft.entity_type, "updated");
                        continue;
                    }
                } else {
                    const direction = normalizeStockDirection(data.direction);
                    if (!direction) {
                        errors.push(`Satır ${rowNum}: Stok hareketi için yön zorunludur (in/out/transfer).`);
                        await dbUpdateDraft(draft.id, { status: "rejected" });
                        skipped++; bumpEntity(draft.entity_type, "skipped");
                        continue;
                    }
                    if (quantity <= 0) {
                        errors.push(`Satır ${rowNum}: Stok hareketi miktarı pozitif olmalıdır.`);
                        await dbUpdateDraft(draft.id, { status: "rejected" });
                        skipped++; bumpEntity(draft.entity_type, "skipped");
                        continue;
                    }
                    if (direction === "transfer") {
                        const fromLocation = maybeString(data.from_location);
                        const toLocation = maybeString(data.to_location);
                        if (!fromLocation || !toLocation) {
                            errors.push(`Satır ${rowNum}: Transfer için çıkış ve giriş lokasyonu zorunludur.`);
                            await dbUpdateDraft(draft.id, { status: "rejected" });
                            skipped++; bumpEntity(draft.entity_type, "skipped");
                            continue;
                        }
                        await dbRecordStockTransfer({
                            product_id: prod.id,
                            quantity,
                            from_location: fromLocation,
                            to_location: toLocation,
                            notes: maybeString(data.notes) ?? "Excel/CSV stok transferi",
                            actor: actorUserId,
                        });
                        await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: prod.id });
                        updated++; bumpEntity(draft.entity_type, "updated");
                        continue;
                    }
                    delta = direction === "in" ? quantity : -quantity;
                    movementNote = `Excel/CSV stok hareketi (${direction}): ${quantity}`;
                }
                const movement = await dbRecordMovementAtomic({
                    product_id: prod.id,
                    movement_type: delta > 0 ? "receipt" : "adjustment",
                    quantity: delta,
                    reference_type: "import",
                    notes: maybeString(data.notes) ?? movementNote,
                    created_by: actorUserId ?? undefined,
                });
                if (!movement.success) {
                    errors.push(`Satır ${rowNum}: Stok hareketi kaydedilemedi — ${movement.error ?? "bilinmeyen hata"}`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }
                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: prod.id });
                updated++; bumpEntity(draft.entity_type, "updated");

            } else if (draft.entity_type === "shipment") {
                const shipmentNumber = String(data.shipment_number ?? "");
                if (!shipmentNumber) {
                    errors.push(`Satır ${rowNum}: Sevkiyat numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }

                const orderNumber = data.order_number ? String(data.order_number) : undefined;
                const orderId = orderNumber
                    ? (refMap.orderNumbers.get(orderNumber) ?? (await dbFindOrderByOriginalNumber(orderNumber))?.id)
                    : undefined;

                const shipment = await dbCreateShipment({
                    shipment_number: shipmentNumber,
                    order_id: orderId,
                    order_number: orderNumber,
                    shipment_date: data.shipment_date ? String(data.shipment_date).split("T")[0] : new Date().toISOString().split("T")[0],
                    transport_type: data.transport_type ? String(data.transport_type) : undefined,
                    net_weight_kg: parseNumeric(data.net_weight_kg),
                    gross_weight_kg: parseNumeric(data.gross_weight_kg),
                });
                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: shipment.id });
                added++; bumpEntity(draft.entity_type, "added");

            } else if (draft.entity_type === "invoice") {
                const invoiceNumber = String(data.invoice_number ?? "");
                if (!invoiceNumber) {
                    errors.push(`Satır ${rowNum}: Fatura numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }

                const orderNumber = data.order_number ? String(data.order_number) : undefined;
                const orderId = orderNumber
                    ? (refMap.orderNumbers.get(orderNumber) ?? (await dbFindOrderByOriginalNumber(orderNumber))?.id)
                    : undefined;

                const customerCode = data.customer_code ? String(data.customer_code) : undefined;
                const customerId = customerCode
                    ? (refMap.customerCodes.get(customerCode) ?? (await dbFindCustomerByCode(customerCode))?.id)
                    : undefined;

                const existing = await dbFindInvoiceByNumber(invoiceNumber);
                if (existing) {
                    await dbUpdateInvoice(existing.id, {
                        invoice_date: data.invoice_date ? String(data.invoice_date).split("T")[0] : undefined,
                        order_id: orderId,
                        order_number: orderNumber,
                        customer_id: customerId,
                        customer_code: customerCode,
                        currency: data.currency ? String(data.currency) : undefined,
                        amount: data.amount !== undefined ? Number(data.amount) : undefined,
                        due_date: data.due_date ? String(data.due_date).split("T")[0] : undefined,
                    });
                    refMap.invoiceNumbers.set(invoiceNumber, existing.id);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: existing.id });
                    updated++; bumpEntity(draft.entity_type, "updated");
                } else {
                    const invoice = await dbCreateInvoice({
                        invoice_number: invoiceNumber,
                        invoice_date: data.invoice_date ? String(data.invoice_date).split("T")[0] : new Date().toISOString().split("T")[0],
                        order_id: orderId,
                        order_number: orderNumber,
                        customer_id: customerId,
                        customer_code: customerCode,
                        currency: data.currency ? String(data.currency) : "USD",
                        amount: Number(data.amount ?? 0),
                        due_date: data.due_date ? String(data.due_date).split("T")[0] : undefined,
                    });
                    refMap.invoiceNumbers.set(invoiceNumber, invoice.id);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: invoice.id });
                    added++; bumpEntity(draft.entity_type, "added");
                }

            } else if (draft.entity_type === "payment") {
                const paymentNumber = String(data.payment_number ?? "");
                if (!paymentNumber) {
                    errors.push(`Satır ${rowNum}: Ödeme numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++; bumpEntity(draft.entity_type, "skipped");
                    continue;
                }

                const invoiceNumber = data.invoice_number ? String(data.invoice_number) : undefined;
                const invoiceId = invoiceNumber
                    ? (refMap.invoiceNumbers.get(invoiceNumber) ?? (await dbFindInvoiceByNumber(invoiceNumber))?.id)
                    : undefined;

                await dbCreatePayment({
                    payment_number: paymentNumber,
                    invoice_id: invoiceId,
                    invoice_number: invoiceNumber,
                    payment_date: data.payment_date ? String(data.payment_date).split("T")[0] : new Date().toISOString().split("T")[0],
                    amount: Number(data.amount ?? 0),
                    currency: data.currency ? String(data.currency) : "USD",
                    payment_method: data.payment_method ? String(data.payment_method) : undefined,
                });

                // Update invoice status based on total payments
                if (invoiceId) {
                    const invoice = await dbFindInvoiceByNumber(invoiceNumber!);
                    if (invoice) {
                        const totalPaid = await dbSumPaymentsForInvoice(invoiceId);
                        const newStatus = totalPaid >= invoice.amount ? "paid" : "partially_paid";
                        await dbUpdateInvoiceStatus(invoiceId, newStatus);
                    }
                }

                await dbUpdateDraft(draft.id, { status: "merged" });
                added++; bumpEntity(draft.entity_type, "added");
            } else {
                errors.push(`Satır ${rowNum}: Bilinmeyen varlık türü — '${draft.entity_type}'.`);
                await dbUpdateDraft(draft.id, { status: "rejected" });
                skipped++; bumpEntity(draft.entity_type, "skipped");
            }

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${draft.id} (Satır ${rowNum}): İşlem hatası — ${msg}`);
            try { await dbUpdateDraft(draft.id, { status: "rejected" }); } catch { /* best-effort */ }
            skipped++; bumpEntity(draft.entity_type, "skipped");
        }
    }

    const confirmedBatch = await dbUpdateBatchStatus(batchId, "confirmed");

    // Increment success_count only for entity types that had at least one merged draft.
    // If all drafts of a type were rejected, the mapping likely didn't work —
    // don't inflate its confidence.
    const meta = (confirmedBatch.parse_result as Record<string, unknown> | null)?.column_mapping_meta as
        Array<{ entity_type: string; normalized_columns: string[] }> | undefined;
    if (meta && (added + updated) > 0) {
        const finalDrafts = await dbListDrafts(batchId);
        for (const m of meta) {
            const hasMerged = finalDrafts.some(
                d => d.entity_type === m.entity_type && d.status === "merged"
            );
            if (hasMerged) {
                await dbIncrementMappingSuccess(m.normalized_columns, m.entity_type);
            }
        }
    }
    return { added, updated, skipped, errors, byEntity };
}
