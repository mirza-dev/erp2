import { createServiceClient } from "./service";
import type { QuoteRow, QuoteStatus, QuoteWithLines } from "@/lib/database.types";

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
    const { data: quoteId, error } = await sb.rpc("create_quote_with_lines", {
        p_header: { ...header, updated_at: new Date().toISOString() },
        p_lines: lines,
    });
    if (error) throw error;
    return (await dbGetQuote(quoteId as string))!;
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
    const { error } = await sb.rpc("update_quote_with_lines", {
        p_id: id,
        p_header: { ...header, updated_at: new Date().toISOString() },
        p_lines: lines,
    });
    if (error) throw error;
    return (await dbGetQuote(id))!;
}

export async function dbDeleteQuote(id: string): Promise<void> {
    const sb = createServiceClient();
    const { error } = await sb.from("quotes").delete().eq("id", id);
    if (error) throw error;
}

export async function dbUpdateQuoteStatus(id: string, status: QuoteStatus): Promise<void> {
    const sb = createServiceClient();
    const { error } = await sb
        .from("quotes")
        .update({ status, updated_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw error;
}

export async function dbListExpiredQuotes(): Promise<QuoteRow[]> {
    const sb = createServiceClient();
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { data, error } = await sb
        .from("quotes")
        .select("id, quote_number, status, customer_name, valid_until, created_at, updated_at")
        .in("status", ["draft", "sent"])
        .not("valid_until", "is", null)
        .lt("valid_until", todayStr);
    if (error) throw error;
    return (data ?? []) as unknown as QuoteRow[];
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
