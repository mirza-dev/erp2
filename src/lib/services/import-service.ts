/**
 * Import Service — ImportBatch lifecycle + ImportDraft merge.
 * domain-rules §9: import = parse → preview → user confirmation → draft entity creation
 * §9.2: hiçbir zaman doğrudan approved entity oluşturmaz
 * §2.3: final entity oluşturma kullanıcı onaylıdır
 */

import {
    dbGetBatch, dbUpdateBatchStatus, dbListDrafts, dbUpdateDraft,
    type CreateDraftInput, dbCreateDrafts,
} from "@/lib/supabase/import";
import { dbCreateCustomer, dbFindCustomerByName } from "@/lib/supabase/customers";
import { dbCreateProduct } from "@/lib/supabase/products";
import { serviceCreateOrder } from "@/lib/services/order-service";

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
    merged: number;
    skipped: number;
    errors: string[];
}

/**
 * Batch'teki tüm confirmed (veya pending) draftları merge et.
 * - customer → customers tablosuna INSERT
 * - product  → products tablosuna INSERT (upsert değil, yeni kayıt)
 * - order    → Faz 10'a bırakılır, sadece "merged" işaretlenir
 *
 * domain-rules §9.2: hiçbir zaman doğrudan approved order oluşturmaz
 */
export async function serviceConfirmBatch(batchId: string): Promise<ConfirmResult> {
    const batch = await dbGetBatch(batchId);
    if (!batch) throw new Error("Batch bulunamadı.");
    if (batch.status === "confirmed") throw new Error("Batch zaten onaylanmış.");

    const drafts = await dbListDrafts(batchId);
    const toMerge = drafts.filter(d => d.status === "confirmed" || d.status === "pending");

    let merged = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const draft of toMerge) {
        if (draft.status === "rejected") { skipped++; continue; }

        // parsed_data + user_corrections birleştirilir
        const base = (draft.parsed_data ?? {}) as Record<string, unknown>;
        const corrections = (draft.user_corrections ?? {}) as Record<string, unknown>;
        const data = { ...base, ...corrections };

        try {
            if (draft.entity_type === "customer") {
                const customer = await dbCreateCustomer({
                    name: String(data.name ?? ""),
                    email: data.email ? String(data.email) : undefined,
                    phone: data.phone ? String(data.phone) : undefined,
                    address: data.address ? String(data.address) : undefined,
                    tax_number: data.tax_number ? String(data.tax_number) : undefined,
                    tax_office: data.tax_office ? String(data.tax_office) : undefined,
                    country: data.country ? String(data.country) : undefined,
                    currency: data.currency ? String(data.currency) : "USD",
                    notes: data.notes ? String(data.notes) : undefined,
                });
                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: customer.id });

            } else if (draft.entity_type === "product") {
                if (!data.sku || !data.name || !data.unit) {
                    errors.push(`Draft ${draft.id}: sku, name, unit zorunlu.`);
                    skipped++;
                    continue;
                }
                const product = await dbCreateProduct({
                    name: String(data.name),
                    sku: String(data.sku),
                    category: data.category ? String(data.category) : undefined,
                    unit: String(data.unit),
                    price: data.price ? Number(data.price) : undefined,
                    currency: data.currency ? String(data.currency) : "USD",
                    min_stock_level: data.min_stock_level ? Number(data.min_stock_level) : undefined,
                    reorder_qty: data.reorder_qty ? Number(data.reorder_qty) : undefined,
                    preferred_vendor: data.preferred_vendor ? String(data.preferred_vendor) : undefined,
                });
                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: product.id });

            } else if (draft.entity_type === "order") {
                // §9.2: import creates DRAFT orders — never approved
                const customerName = String(data.customer_name ?? data.musteri ?? "");
                const customer = customerName
                    ? await dbFindCustomerByName(customerName)
                    : null;

                const grandTotal = Number(data.grand_total ?? data.tutar ?? 0);
                const subtotal = grandTotal / 1.20;
                const vatTotal = grandTotal - subtotal;

                const order = await serviceCreateOrder({
                    customer_id: customer?.id,
                    customer_name: customerName || "Bilinmeyen Müşteri",
                    currency: String(data.currency ?? "USD"),
                    notes: `İçe aktarım batch: ${batchId}`,
                    commercial_status: "draft",
                    fulfillment_status: "unallocated",
                    subtotal,
                    vat_total: vatTotal,
                    grand_total: grandTotal,
                    lines: [],
                });
                await dbUpdateDraft(draft.id, { status: "merged", matched_entity_id: order.id });

            } else if (draft.entity_type === "order_line" || draft.entity_type === "stock") {
                // Order lines and stock updates are informational — mark merged
                await dbUpdateDraft(draft.id, { status: "merged" });
            }

            merged++;
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            errors.push(`Draft ${draft.id}: ${msg}`);
            skipped++;
        }
    }

    // Batch'i confirmed yap
    await dbUpdateBatchStatus(batchId, "confirmed");

    return { merged, skipped, errors };
}
