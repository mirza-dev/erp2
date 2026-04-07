/**
 * Import Service — ImportBatch lifecycle + ImportDraft merge.
 * domain-rules §9: import = parse → preview → user confirmation → draft entity creation
 * §9.2: hiçbir zaman doğrudan approved entity oluşturmaz
 */

import {
    dbGetBatch, dbUpdateBatchStatus, dbListDrafts, dbUpdateDraft,
    type CreateDraftInput, dbCreateDrafts,
} from "@/lib/supabase/import";
import { dbCreateCustomer, dbFindCustomerByName, dbFindCustomerByCode, dbUpdateCustomer } from "@/lib/supabase/customers";
import { dbLookupEntityAlias, dbSaveEntityAlias } from "@/lib/supabase/entity-aliases";
import { dbCreateProduct, dbFindProductBySku, dbUpdateProduct } from "@/lib/supabase/products";
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

export interface ConfirmResult {
    added: number;    // gerçekten INSERT edilen yeni kayıtlar
    updated: number;  // mevcut kaydın UPDATE edildiği veya eşlendiği durumlar
    skipped: number;
    errors: string[];
}

// Entity processing order — respects dependency chain
const ENTITY_PRIORITY: Record<string, number> = {
    product: 1, customer: 2, quote: 3, order: 4,
    order_line: 5, stock: 5, shipment: 6, invoice: 7, payment: 8,
};

/**
 * Numeric field parser that preserves 0 as a valid value.
 * Treats null/undefined/"" as absent (returns undefined), but keeps 0 and "0".
 * Truthy checks like `data.price ? Number(data.price) : undefined` silently drop 0.
 */
function parseNumeric(value: unknown): number | undefined {
    if (value === null || value === undefined || value === "") return undefined;
    const n = Number(value);
    return Number.isNaN(n) ? undefined : n;
}

/**
 * Batch'teki tüm confirmed (veya pending) draftları merge et.
 * domain-rules §9.2: hiçbir zaman doğrudan approved order oluşturmaz
 */
export async function serviceConfirmBatch(batchId: string): Promise<ConfirmResult> {
    const batch = await dbGetBatch(batchId);
    if (!batch) throw new Error("Batch bulunamadı.");
    if (batch.status === "confirmed") throw new Error("Batch zaten onaylanmış.");

    const drafts = await dbListDrafts(batchId);
    const toMerge = drafts
        .filter(d => d.status === "confirmed" || d.status === "pending")
        .sort((a, b) => (ENTITY_PRIORITY[a.entity_type] ?? 99) - (ENTITY_PRIORITY[b.entity_type] ?? 99));

    let added = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Cross-reference map — resolve entity references within this batch
    const refMap = {
        customerCodes: new Map<string, string>(),   // Musteri_Kodu → customer uuid
        quoteNumbers:  new Map<string, string>(),   // Teklif_No → quote uuid
        orderNumbers:  new Map<string, string>(),   // Siparis_No → order uuid
        invoiceNumbers: new Map<string, string>(),  // Fatura_No → invoice uuid
        productSkus:   new Map<string, string>(),   // Urun_Kodu → product uuid
    };

    let rowNum = 0;
    for (const draft of toMerge) {
        rowNum++;
        if (draft.status === "rejected") { skipped++; continue; }

        const base = (draft.parsed_data ?? {}) as Record<string, unknown>;
        const corrections = (draft.user_corrections ?? {}) as Record<string, unknown>;
        const data = { ...base, ...corrections };

        try {
            if (draft.entity_type === "customer") {
                const customerName = String(data.name ?? "");
                const customerCode = data.customer_code ? String(data.customer_code) : undefined;

                let customerId: string;
                const existingByCode = customerCode ? await dbFindCustomerByCode(customerCode) : null;
                // Alias memory: geçmiş import'larda öğrenilen ham değer → entity eşlemesi
                const aliasMatch = !existingByCode && customerName
                    ? await dbLookupEntityAlias(customerName, "customer")
                    : null;
                const existingByName = !existingByCode && !aliasMatch && customerName
                    ? await dbFindCustomerByName(customerName)
                    : null;
                const existing = existingByCode ?? existingByName;

                const customerUpdateFields = {
                    name: customerName || undefined,
                    email: data.email ? String(data.email) : undefined,
                    phone: data.phone ? String(data.phone) : undefined,
                    address: data.address ? String(data.address) : undefined,
                    tax_number: data.tax_number ? String(data.tax_number) : undefined,
                    tax_office: data.tax_office ? String(data.tax_office) : undefined,
                    country: data.country ? String(data.country) : undefined,
                    currency: data.currency ? String(data.currency) : undefined,
                    notes: data.notes ? String(data.notes) : undefined,
                };

                if (aliasMatch) {
                    // Alias hit — önceki import'tan öğrenilmiş, doğrudan çözümlendi
                    customerId = aliasMatch;
                    await dbUpdateCustomer(aliasMatch, customerUpdateFields);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: aliasMatch });
                    updated++;
                } else if (existing) {
                    customerId = existing.id;
                    await dbUpdateCustomer(existing.id, customerUpdateFields);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: existing.id });
                    // Bu eşleşmeyi gelecek import'lar için kaydet
                    if (customerName) void dbSaveEntityAlias(customerName, "customer", existing.id, existing.name);
                    updated++;
                } else {
                    const customer = await dbCreateCustomer({
                        name: customerName,
                        email: data.email ? String(data.email) : undefined,
                        phone: data.phone ? String(data.phone) : undefined,
                        address: data.address ? String(data.address) : undefined,
                        tax_number: data.tax_number ? String(data.tax_number) : undefined,
                        tax_office: data.tax_office ? String(data.tax_office) : undefined,
                        country: data.country ? String(data.country) : undefined,
                        currency: data.currency ? String(data.currency) : "USD",
                        notes: data.notes ? String(data.notes) : undefined,
                        payment_terms_days: data.payment_terms_days ? Number(data.payment_terms_days) : undefined,
                        default_incoterm: data.default_incoterm ? String(data.default_incoterm) : undefined,
                        customer_code: customerCode,
                    });
                    customerId = customer.id;
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: customer.id });
                    // Yeni müşteri — bu ismi gelecek import'lar için kaydet
                    if (customerName) void dbSaveEntityAlias(customerName, "customer", customer.id, customerName);
                    added++;
                }
                if (customerCode) refMap.customerCodes.set(customerCode, customerId);

            } else if (draft.entity_type === "product") {
                if (!data.sku || !data.name || !data.unit) {
                    const missing: string[] = [];
                    if (!data.name) missing.push("ürün adı");
                    if (!data.sku)  missing.push("ürün kodu (SKU)");
                    if (!data.unit) missing.push("ölçü birimi");
                    errors.push(`Satır ${rowNum}: ${missing.join(", ")} eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
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
                    });
                    productId = updatedProduct.id;
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: updatedProduct.id });
                    updated++;
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
                    });
                    productId = product.id;
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: product.id });
                    added++;
                }
                refMap.productSkus.set(sku, productId);

            } else if (draft.entity_type === "quote") {
                const quoteNumber = String(data.quote_number ?? "");
                if (!quoteNumber) {
                    errors.push(`Satır ${rowNum}: Teklif numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
                    continue;
                }

                const customerCode = data.customer_code ? String(data.customer_code) : undefined;
                const customerId = customerCode
                    ? (refMap.customerCodes.get(customerCode) ?? (await dbFindCustomerByCode(customerCode))?.id)
                    : undefined;

                const existing = await dbFindQuoteByNumber(quoteNumber);
                if (existing) {
                    await dbUpdateQuote(existing.id, {
                        quote_date: data.quote_date ? String(data.quote_date).split("T")[0] : undefined,
                        customer_id: customerId,
                        customer_code: customerCode,
                        currency: data.currency ? String(data.currency) : undefined,
                        incoterm: data.incoterm ? String(data.incoterm) : undefined,
                        validity_days: data.validity_days ? Number(data.validity_days) : undefined,
                        total_amount: data.total_amount ? Number(data.total_amount) : undefined,
                    });
                    refMap.quoteNumbers.set(quoteNumber, existing.id);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: existing.id });
                    updated++;
                } else {
                    const quote = await dbCreateQuote({
                        quote_number: quoteNumber,
                        quote_date: data.quote_date ? String(data.quote_date).split("T")[0] : new Date().toISOString().split("T")[0],
                        customer_id: customerId,
                        customer_code: customerCode,
                        currency: data.currency ? String(data.currency) : "USD",
                        incoterm: data.incoterm ? String(data.incoterm) : undefined,
                        validity_days: data.validity_days ? Number(data.validity_days) : undefined,
                        total_amount: data.total_amount ? Number(data.total_amount) : undefined,
                    });
                    refMap.quoteNumbers.set(quoteNumber, quote.id);
                    await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: quote.id });
                    added++;
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
                added++;

            } else if (draft.entity_type === "order_line") {
                const orderNumber = data.order_number ? String(data.order_number) : undefined;
                const productSku = data.product_sku ? String(data.product_sku) : undefined;

                if (!orderNumber || !productSku) {
                    errors.push(`Satır ${rowNum}: Sipariş numarası ve ürün kodu (SKU) zorunludur.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
                    continue;
                }

                const orderId = refMap.orderNumbers.get(orderNumber)
                    ?? (await dbFindOrderByOriginalNumber(orderNumber))?.id;
                if (!orderId) {
                    errors.push(`Satır ${rowNum}: '${orderNumber}' numaralı sipariş bulunamadı.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
                    continue;
                }

                const productId = refMap.productSkus.get(productSku)
                    ?? (await dbFindProductBySku(productSku))?.id;

                const supabase = createServiceClient();
                const quantity = Number(data.quantity ?? 1);
                const unitPrice = Number(data.unit_price ?? 0);
                const discountPct = Number(data.discount_pct ?? 0);
                const lineTotal = data.line_total ? Number(data.line_total) : quantity * unitPrice * (1 - discountPct / 100);

                // Get current max sort_order for this order
                const { data: existingLines } = await supabase
                    .from("order_lines")
                    .select("sort_order")
                    .eq("order_id", orderId)
                    .order("sort_order", { ascending: false })
                    .limit(1);
                const sortOrder = existingLines && existingLines.length > 0 ? existingLines[0].sort_order + 1 : 1;

                await supabase.from("order_lines").insert({
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

                // Update order totals
                const { data: allLines } = await supabase
                    .from("order_lines")
                    .select("line_total")
                    .eq("order_id", orderId);
                const subtotal = (allLines ?? []).reduce((s, l) => s + (l.line_total ?? 0), 0);
                const vatTotal = subtotal * 0.20;
                await supabase.from("sales_orders").update({
                    subtotal,
                    vat_total: vatTotal,
                    grand_total: subtotal + vatTotal,
                    item_count: (allLines ?? []).length,
                }).eq("id", orderId);

                await dbUpdateDraft(draft.id, { status: "merged" });
                added++;

            } else if (draft.entity_type === "stock") {
                if (!data.sku) {
                    errors.push(`Satır ${rowNum}: Ürün kodu (SKU) eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
                    continue;
                }
                if (data.on_hand === undefined) {
                    errors.push(`Satır ${rowNum}: Stok miktarı (on_hand) eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
                    continue;
                }
                const prod = await dbFindProductBySku(String(data.sku));
                if (!prod) {
                    errors.push(`Satır ${rowNum}: '${data.sku}' kodlu ürün bulunamadı.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
                    continue;
                }
                // Additive: imported qty is added to existing stock (not overwrite)
                const newOnHand = prod.on_hand + Number(data.on_hand);
                await dbUpdateProduct(prod.id, { on_hand: newOnHand });
                await dbUpdateDraft(draft.id, { status: "merged" });
                updated++;

            } else if (draft.entity_type === "shipment") {
                const shipmentNumber = String(data.shipment_number ?? "");
                if (!shipmentNumber) {
                    errors.push(`Satır ${rowNum}: Sevkiyat numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
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
                    net_weight_kg: data.net_weight_kg ? Number(data.net_weight_kg) : undefined,
                    gross_weight_kg: data.gross_weight_kg ? Number(data.gross_weight_kg) : undefined,
                });
                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: shipment.id });
                added++;

            } else if (draft.entity_type === "invoice") {
                const invoiceNumber = String(data.invoice_number ?? "");
                if (!invoiceNumber) {
                    errors.push(`Satır ${rowNum}: Fatura numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
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
                    updated++;
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
                    added++;
                }

            } else if (draft.entity_type === "payment") {
                const paymentNumber = String(data.payment_number ?? "");
                if (!paymentNumber) {
                    errors.push(`Satır ${rowNum}: Ödeme numarası eksik.`);
                    await dbUpdateDraft(draft.id, { status: "rejected" });
                    skipped++;
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
                added++;
            } else {
                errors.push(`Satır ${rowNum}: Bilinmeyen varlık türü — '${draft.entity_type}'.`);
                await dbUpdateDraft(draft.id, { status: "rejected" });
                skipped++;
            }

        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`${draft.id} (Satır ${rowNum}): İşlem hatası — ${msg}`);
            try { await dbUpdateDraft(draft.id, { status: "rejected" }); } catch { /* best-effort */ }
            skipped++;
        }
    }

    await dbUpdateBatchStatus(batchId, "confirmed");
    return { added, updated, skipped, errors };
}
