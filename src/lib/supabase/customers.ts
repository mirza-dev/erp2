import { createServiceClient } from "./service";
import { orIlikeFilter } from "@/lib/list-query";
import type { CustomerRow } from "@/lib/database.types";

export interface CreateCustomerInput {
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_number?: string;
    tax_office?: string;
    country?: string;
    currency?: string;
    notes?: string;
    payment_terms_days?: number;
    default_incoterm?: string;
    customer_code?: string;
}

export async function dbListCustomers(): Promise<CustomerRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("is_active", true)
        .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
}

// ── Server-side pagination (A1) ──────────────────────────────
export type CustomerTab = "all" | "active" | "passive";

export interface CustomersPageQuery {
    search?: string;                // name / email / country (ilike)
    is_active?: boolean;            // undefined → tümü
    page?: number;
    pageSize?: number;
}

export interface CustomersPageResult {
    rows: CustomerRow[];
    total: number;
}

export const CUSTOMERS_DEFAULT_PAGE_SIZE = 50;

/**
 * Sunucu tarafı filtre + sayfalama. `is_active` ile aktif/pasif ayrımı —
 * eski dbListCustomers yalnız aktifleri döndürdüğü için "Pasif" sekmesi
 * fiilen boştu; bu yol pasifleri de getirir. count:"exact" total.
 */
export async function dbListCustomersPaged(q: CustomersPageQuery = {}): Promise<CustomersPageResult> {
    const supabase = createServiceClient();
    const page = Math.max(1, q.page ?? 1);
    const pageSize = Math.max(1, q.pageSize ?? CUSTOMERS_DEFAULT_PAGE_SIZE);

    let query = supabase.from("customers").select("*", { count: "exact" });
    if (q.is_active !== undefined) query = query.eq("is_active", q.is_active);
    if (q.search && q.search.trim()) query = query.or(orIlikeFilter(["name", "email", "country"], q.search));

    const { data, error, count } = await query
        .order("name")
        .range((page - 1) * pageSize, page * pageSize - 1);
    if (error) throw new Error(error.message);
    return { rows: data ?? [], total: count ?? 0 };
}

/** Rozet sayaçları — global (tümü / aktif / pasif). */
export async function dbCountCustomers(): Promise<Record<CustomerTab, number>> {
    const supabase = createServiceClient();
    const head = () => supabase.from("customers").select("id", { count: "exact", head: true });
    const [all, active, passive] = await Promise.all([
        head(),
        head().eq("is_active", true),
        head().eq("is_active", false),
    ]);
    const errored = [all, active, passive].find((r) => r.error);
    if (errored?.error) throw new Error(errored.error.message);
    return { all: all.count ?? 0, active: active.count ?? 0, passive: passive.count ?? 0 };
}

export async function dbDeleteCustomer(id: string, actor?: string | null): Promise<void> {
    const supabase = createServiceClient();
    // Faz 6: before-snapshot silmeden ÖNCE çekilir (silinince satır yok olur);
    // audit yalnız silme BAŞARILI olunca yazılır (FK restrict ile delete throw
    // ederse "customer_deleted" yalan audit kalmasın). dbDeactivateVendor paterni.
    const { data: existing } = await supabase
        .from("customers").select("*").eq("id", id).maybeSingle();
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw new Error(error.message);
    if (existing) {
        await supabase.from("audit_log").insert({
            actor: actor ?? null,
            action: "customer_deleted",
            entity_type: "customer",
            entity_id: id,
            before_state: existing,
            source: "ui",
        });
    }
}

export async function dbGetCustomerById(id: string): Promise<CustomerRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("customers").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

export async function dbFindCustomerByCode(code: string): Promise<CustomerRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("customer_code", code)
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

export async function dbFindCustomerByName(name: string): Promise<CustomerRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .ilike("name", name)
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

export async function dbFindCustomerByEmail(email: string): Promise<CustomerRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("customers")
        .select("*")
        .ilike("email", email)
        .limit(1)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

export interface UpdateCustomerInput {
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
    tax_number?: string;
    tax_office?: string;
    country?: string;
    currency?: string;
    notes?: string;
    payment_terms_days?: number;
    customer_code?: string;
    default_incoterm?: string;
}

export async function dbUpdateCustomer(id: string, input: UpdateCustomerInput): Promise<CustomerRow> {
    const supabase = createServiceClient();
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined)       patch.name = input.name;
    if (input.email !== undefined)      patch.email = input.email || null;
    if (input.phone !== undefined)      patch.phone = input.phone || null;
    if (input.address !== undefined)    patch.address = input.address || null;
    if (input.tax_number !== undefined) patch.tax_number = input.tax_number || null;
    if (input.tax_office !== undefined) patch.tax_office = input.tax_office || null;
    if (input.country !== undefined)    patch.country = input.country || null;
    if (input.currency !== undefined)   patch.currency = input.currency;
    if (input.notes !== undefined)            patch.notes = input.notes || null;
    if (input.payment_terms_days !== undefined) patch.payment_terms_days = input.payment_terms_days ?? null;
    if (input.customer_code !== undefined)    patch.customer_code = input.customer_code || null;
    if (input.default_incoterm !== undefined) patch.default_incoterm = input.default_incoterm || null;
    const { data, error } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Customer update failed");
    return data;
}

export async function dbCreateCustomer(input: CreateCustomerInput): Promise<CustomerRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("customers")
        .insert({
            name: input.name,
            email: input.email ?? null,
            phone: input.phone ?? null,
            address: input.address ?? null,
            tax_number: input.tax_number ?? null,
            tax_office: input.tax_office ?? null,
            country: input.country ?? null,
            currency: input.currency ?? "USD",
            notes: input.notes ?? null,
            is_active: true,
            total_orders: 0,
            total_revenue: 0,
            last_order_date: null,
            payment_terms_days: input.payment_terms_days ?? null,
            default_incoterm: input.default_incoterm ?? null,
            customer_code: input.customer_code ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Customer creation failed");
    return data;
}
