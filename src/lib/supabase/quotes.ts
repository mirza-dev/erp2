import { createServiceClient } from "./service";
import type { QuoteRow } from "@/lib/database.types";

export interface CreateQuoteInput {
    quote_number: string;
    quote_date: string;
    customer_id?: string;
    customer_code?: string;
    currency?: string;
    incoterm?: string;
    validity_days?: number;
    total_amount?: number;
    notes?: string;
}

export async function dbCreateQuote(input: CreateQuoteInput): Promise<QuoteRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("quotes")
        .insert({
            quote_number: input.quote_number,
            quote_date: input.quote_date,
            customer_id: input.customer_id ?? null,
            customer_code: input.customer_code ?? null,
            currency: input.currency ?? "USD",
            incoterm: input.incoterm ?? null,
            validity_days: input.validity_days ?? null,
            total_amount: input.total_amount ?? null,
            notes: input.notes ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Quote creation failed");
    return data;
}

export async function dbFindQuoteByNumber(quoteNumber: string): Promise<QuoteRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .eq("quote_number", quoteNumber)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

export interface UpdateQuoteInput {
    quote_date?: string;
    customer_id?: string;
    customer_code?: string;
    currency?: string;
    incoterm?: string;
    validity_days?: number;
    total_amount?: number;
    notes?: string;
}

export async function dbUpdateQuote(id: string, input: UpdateQuoteInput): Promise<QuoteRow> {
    const supabase = createServiceClient();
    const patch: Record<string, unknown> = {};
    if (input.quote_date !== undefined)    patch.quote_date = input.quote_date;
    if (input.customer_id !== undefined)   patch.customer_id = input.customer_id || null;
    if (input.customer_code !== undefined) patch.customer_code = input.customer_code || null;
    if (input.currency !== undefined)      patch.currency = input.currency;
    if (input.incoterm !== undefined)      patch.incoterm = input.incoterm || null;
    if (input.validity_days !== undefined) patch.validity_days = input.validity_days;
    if (input.total_amount !== undefined)  patch.total_amount = input.total_amount;
    if (input.notes !== undefined)         patch.notes = input.notes || null;
    const { data, error } = await supabase
        .from("quotes").update(patch).eq("id", id).select("*").single();
    if (error || !data) throw new Error(error?.message ?? "Quote update failed");
    return data;
}

export async function dbListQuotes(): Promise<QuoteRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("quotes")
        .select("*")
        .order("quote_date", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
}
