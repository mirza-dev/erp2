import { createServiceClient } from "./service";
import type { QuoteRow, QuoteWithLines } from "@/lib/database.types";

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateQuoteLineInput {
    position: number;
    product_id?: string | null;
    product_code: string;
    lead_time?: string;
    description: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    hs_code?: string;
    weight_kg?: number;
}

export interface CreateQuoteInput {
    quote_number?: string;          // import flow'da belirtilirse DB default'u override eder
    customer_id?: string | null;
    customer_name: string;
    customer_contact?: string;
    customer_phone?: string;
    customer_email?: string;
    sales_rep?: string;
    sales_phone?: string;
    sales_email?: string;
    currency: string;
    vat_rate: number;
    subtotal: number;
    vat_total: number;
    grand_total: number;
    notes?: string;
    sig_prepared?: string;
    sig_approved?: string;
    sig_manager?: string;
    quote_date?: string;
    valid_until?: string;
    lines: CreateQuoteLineInput[];
}

// ── DB functions ──────────────────────────────────────────────────────────────

export async function dbCreateQuote(input: CreateQuoteInput): Promise<QuoteWithLines> {
    const sb = createServiceClient();
    const { lines, ...header } = input;

    const { data: quote, error: qErr } = await sb
        .from("quotes")
        .insert({ ...header, updated_at: new Date().toISOString() })
        .select()
        .single();
    if (qErr) throw qErr;

    if (lines.length > 0) {
        const { error: lErr } = await sb
            .from("quote_line_items")
            .insert(lines.map(l => ({ ...l, quote_id: quote.id })));
        if (lErr) throw lErr;
    }

    return (await dbGetQuote(quote.id))!;
}

export async function dbGetQuote(id: string): Promise<QuoteWithLines | null> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("quotes")
        .select("*, quote_line_items(*)")
        .eq("id", id)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const lines = ((data.quote_line_items ?? []) as QuoteWithLines["lines"])
        .slice()
        .sort((a, b) => a.position - b.position);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { quote_line_items: _, ...rest } = data;
    return { ...rest, lines } as QuoteWithLines;
}

export async function dbListQuotes(filter: { status?: string; page?: number } = {}): Promise<QuoteRow[]> {
    const sb = createServiceClient();
    const PAGE_SIZE = 20;
    const from = ((filter.page ?? 1) - 1) * PAGE_SIZE;

    let q = sb
        .from("quotes")
        .select("id, quote_number, status, customer_name, currency, grand_total, quote_date, valid_until, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    if (filter.status) q = q.eq("status", filter.status);

    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as unknown as QuoteRow[];
}

export async function dbUpdateQuote(
    id: string,
    input: Omit<CreateQuoteInput, "lines"> & { lines: CreateQuoteLineInput[] }
): Promise<QuoteWithLines> {
    const sb = createServiceClient();
    const { lines, ...header } = input;

    const { error: qErr } = await sb
        .from("quotes")
        .update({ ...header, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (qErr) throw qErr;

    const { error: delErr } = await sb
        .from("quote_line_items")
        .delete()
        .eq("quote_id", id);
    if (delErr) throw delErr;

    if (lines.length > 0) {
        const { error: insErr } = await sb
            .from("quote_line_items")
            .insert(lines.map(l => ({ ...l, quote_id: id })));
        if (insErr) throw insErr;
    }

    return (await dbGetQuote(id))!;
}

export async function dbDeleteQuote(id: string): Promise<void> {
    const sb = createServiceClient();
    const { error } = await sb.from("quotes").delete().eq("id", id);
    if (error) throw error;
}

export async function dbFindQuoteByNumber(quoteNumber: string): Promise<QuoteRow | null> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("quotes")
        .select("*")
        .eq("quote_number", quoteNumber)
        .maybeSingle();
    if (error) throw error;
    return data as QuoteRow | null;
}
