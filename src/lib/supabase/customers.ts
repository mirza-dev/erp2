import { createServiceClient } from "./service";
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

export async function dbDeleteCustomer(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.from("customers").delete().eq("id", id);
    if (error) throw new Error(error.message);
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
