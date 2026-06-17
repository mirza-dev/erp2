import { createServiceClient } from "./service";
import { orIlikeFilter } from "@/lib/list-query";
import type { VendorRow } from "@/lib/database.types";
import { isValidEmail, isValidTaxNumber } from "@/lib/validation";

const CURRENCY_WHITELIST = ["TRY", "USD", "EUR"] as const;

export interface CreateVendorInput {
    name: string;
    contact_email?: string | null;
    contact_phone?: string | null;
    contact_person?: string | null;
    tax_number?: string | null;
    address?: string | null;
    currency?: string;
    payment_terms_days?: number | null;
    lead_time_days?: number | null;
    notes?: string | null;
}

export interface UpdateVendorInput {
    name?: string;
    contact_email?: string | null;
    contact_phone?: string | null;
    contact_person?: string | null;
    tax_number?: string | null;
    address?: string | null;
    currency?: string;
    payment_terms_days?: number | null;
    lead_time_days?: number | null;
    notes?: string | null;
    is_active?: boolean;
}

export interface ListVendorsFilter {
    isActive?: boolean;
    search?: string;
}

function isValidNonNegativeInt(v: number): boolean {
    return Number.isFinite(v) && Number.isInteger(v) && v >= 0;
}

function validateVendorInput(input: CreateVendorInput | UpdateVendorInput): string | null {
    if ("name" in input && input.name !== undefined) {
        if (!input.name || input.name.trim().length === 0) return "Tedarikçi adı zorunludur.";
    }
    if (input.contact_email) {
        if (!isValidEmail(input.contact_email)) return "Geçersiz e-posta adresi.";
    }
    if (input.tax_number) {
        if (!isValidTaxNumber(input.tax_number)) return "Vergi/TC kimlik numarası 10 veya 11 haneli olmalıdır.";
    }
    if (input.currency && !CURRENCY_WHITELIST.includes(input.currency as typeof CURRENCY_WHITELIST[number])) {
        return `Geçersiz para birimi. Kabul edilenler: ${CURRENCY_WHITELIST.join(", ")}.`;
    }
    if (input.lead_time_days !== undefined && input.lead_time_days !== null) {
        if (!isValidNonNegativeInt(input.lead_time_days))
            return "Tedarik süresi geçersiz: sıfır veya pozitif tam sayı olmalıdır.";
    }
    if (input.payment_terms_days !== undefined && input.payment_terms_days !== null) {
        if (!isValidNonNegativeInt(input.payment_terms_days))
            return "Ödeme vadesi geçersiz: sıfır veya pozitif tam sayı olmalıdır.";
    }
    return null;
}

export async function dbListVendors(filter: ListVendorsFilter = {}): Promise<VendorRow[]> {
    const supabase = createServiceClient();
    let query = supabase.from("vendors").select("*").order("name");

    if (filter.isActive !== undefined) query = query.eq("is_active", filter.isActive);
    if (filter.search && filter.search.trim()) {
        query = query.ilike("name", `%${filter.search.trim()}%`);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

// ── Server-side pagination (A1) ──────────────────────────────
export interface VendorsPageQuery {
    search?: string;                // name / contact_person / contact_email (ilike)
    isActive?: boolean;             // undefined → tümü (aktif+pasif)
    page?: number;
    pageSize?: number;
}

export interface VendorsPageResult {
    rows: VendorRow[];
    total: number;
}

export const VENDORS_DEFAULT_PAGE_SIZE = 50;

/** Sunucu tarafı filtre + sayfalama. count:"exact" total. */
export async function dbListVendorsPaged(q: VendorsPageQuery = {}): Promise<VendorsPageResult> {
    const supabase = createServiceClient();
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.max(1, q.pageSize ?? VENDORS_DEFAULT_PAGE_SIZE);

    let query = supabase.from("vendors").select("*", { count: "exact" });
    if (q.isActive !== undefined) query = query.eq("is_active", q.isActive);
    if (q.search && q.search.trim()) {
        query = query.or(orIlikeFilter(["name", "contact_person", "contact_email"], q.search));
    }

    const { data, error, count } = await query
        .order("name")
        .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data ?? [], total: count ?? 0 };
}

export async function dbGetVendorById(id: string): Promise<VendorRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("vendors").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

export async function dbCreateVendor(input: CreateVendorInput): Promise<VendorRow> {
    const validationError = validateVendorInput(input);
    if (validationError) throw new Error(validationError);
    if (!input.name || input.name.trim().length === 0) throw new Error("Tedarikçi adı zorunludur.");

    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("vendors")
        .insert({
            name: input.name.trim(),
            contact_email: input.contact_email ?? null,
            contact_phone: input.contact_phone ?? null,
            contact_person: input.contact_person ?? null,
            tax_number: input.tax_number ?? null,
            address: input.address ?? null,
            currency: input.currency ?? "TRY",
            payment_terms_days: input.payment_terms_days ?? null,
            lead_time_days: input.lead_time_days ?? null,
            notes: input.notes ?? null,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Tedarikçi oluşturulamadı.");

    await supabase.from("audit_log").insert({
        action: "vendor_created",
        entity_type: "vendor",
        entity_id: data.id,
        after_state: { name: data.name, currency: data.currency },
        source: "ui",
    });

    return data;
}

export async function dbUpdateVendor(id: string, patch: UpdateVendorInput): Promise<VendorRow> {
    const validationError = validateVendorInput(patch);
    if (validationError) throw new Error(validationError);

    const supabase = createServiceClient();

    const { data: existing } = await supabase
        .from("vendors").select("*").eq("id", id).single();

    const updatePayload: Record<string, unknown> = {};
    if (patch.name !== undefined)              updatePayload.name = patch.name.trim();
    if (patch.contact_email !== undefined)     updatePayload.contact_email = patch.contact_email;
    if (patch.contact_phone !== undefined)     updatePayload.contact_phone = patch.contact_phone;
    if (patch.contact_person !== undefined)    updatePayload.contact_person = patch.contact_person;
    if (patch.tax_number !== undefined)        updatePayload.tax_number = patch.tax_number;
    if (patch.address !== undefined)           updatePayload.address = patch.address;
    if (patch.currency !== undefined)          updatePayload.currency = patch.currency;
    if (patch.payment_terms_days !== undefined) updatePayload.payment_terms_days = patch.payment_terms_days;
    if (patch.lead_time_days !== undefined)    updatePayload.lead_time_days = patch.lead_time_days;
    if (patch.notes !== undefined)             updatePayload.notes = patch.notes;
    if (patch.is_active !== undefined)         updatePayload.is_active = patch.is_active;

    const { data, error } = await supabase
        .from("vendors")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

    if (error) throw new Error(error.message);
    if (!data) throw new Error("Tedarikçi bulunamadı.");

    await supabase.from("audit_log").insert({
        action: "vendor_updated",
        entity_type: "vendor",
        entity_id: id,
        before_state: existing ? { name: existing.name, is_active: existing.is_active, currency: existing.currency } : null,
        after_state: updatePayload,
        source: "ui",
    });

    return data;
}

const ACTIVE_PO_STATUSES = ["draft", "sent", "confirmed", "partially_received"];

export async function dbDeactivateVendor(id: string, actor: string | null = null): Promise<void> {
    const supabase = createServiceClient();

    // Aktif PO guard: vendor'a bağlı draft/sent/confirmed/partially_received PO varsa pasife alınamaz.
    const { count, error: countErr } = await supabase
        .from("purchase_orders")
        .select("id", { count: "exact", head: true })
        .eq("vendor_id", id)
        .in("status", ACTIVE_PO_STATUSES);

    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) {
        throw new Error(`Tedarikçinin aktif PO'su var (${count}); pasife alınamaz.`);
    }

    const { error } = await supabase
        .from("vendors")
        .update({ is_active: false })
        .eq("id", id);

    if (error) throw new Error(error.message);

    await supabase.from("audit_log").insert({
        action: "vendor_deactivated",
        entity_type: "vendor",
        entity_id: id,
        after_state: { is_active: false },
        actor,
        source: "ui",
    });
}
