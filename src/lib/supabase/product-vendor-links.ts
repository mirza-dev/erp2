import { createServiceClient } from "./service";
import type { ProductVendorLinkRow } from "@/lib/database.types";

export interface UpsertProductVendorLinkInput {
    product_id: string;
    vendor_id: string;
    vendor_sku?: string | null;
    lead_time_days?: number | null;
    moq?: number | null;
    is_preferred?: boolean;
    notes?: string | null;
    actor?: string | null;
}

export async function dbUpsertProductVendorLink(
    input: UpsertProductVendorLinkInput,
): Promise<ProductVendorLinkRow> {
    const supabase = createServiceClient();
    const payload: Record<string, unknown> = {
        product_id: input.product_id,
        vendor_id: input.vendor_id,
    };
    if (input.vendor_sku !== undefined) payload.vendor_sku = input.vendor_sku || null;
    if (input.lead_time_days !== undefined) payload.lead_time_days = input.lead_time_days;
    if (input.moq !== undefined) payload.moq = input.moq;
    if (input.is_preferred !== undefined) payload.is_preferred = input.is_preferred;
    if (input.notes !== undefined) payload.notes = input.notes || null;

    const { data, error } = await supabase
        .from("product_vendor_links")
        .upsert(payload, { onConflict: "product_id,vendor_id" })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Product vendor link upsert failed");

    if (input.is_preferred) {
        const { data: vendor, error: vendorErr } = await supabase
            .from("vendors")
            .select("id,name")
            .eq("id", input.vendor_id)
            .single();
        if (vendorErr || !vendor) throw new Error(vendorErr?.message ?? "Vendor not found");

        const { error: productErr } = await supabase
            .from("products")
            .update({
                preferred_vendor_id: input.vendor_id,
                preferred_vendor: vendor.name,
                ...(input.lead_time_days !== undefined ? { lead_time_days: input.lead_time_days } : {}),
                ...(input.moq !== undefined ? { reorder_qty: input.moq } : {}),
            })
            .eq("id", input.product_id);
        if (productErr) throw new Error(productErr.message);
    }

    const { error: auditErr } = await supabase.from("audit_log").insert({
        actor: input.actor ?? null,
        action: "product_vendor_link_imported",
        entity_type: "product",
        entity_id: input.product_id,
        after_state: {
            product_vendor_link_id: data.id,
            vendor_id: input.vendor_id,
            vendor_sku: input.vendor_sku ?? null,
            lead_time_days: input.lead_time_days ?? null,
            moq: input.moq ?? null,
            is_preferred: input.is_preferred ?? null,
        },
        source: "ui",
    });
    if (auditErr) console.warn("[product-vendor-links] audit insert failed:", auditErr.message);

    return data as ProductVendorLinkRow;
}
