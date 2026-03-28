import { createServiceClient } from "./service";
import type { InvoiceRow, InvoiceStatus } from "@/lib/database.types";

export interface CreateInvoiceInput {
    invoice_number: string;
    invoice_date: string;
    order_id?: string;
    order_number?: string;
    customer_id?: string;
    customer_code?: string;
    currency?: string;
    amount: number;
    due_date?: string;
    notes?: string;
}

export async function dbCreateInvoice(input: CreateInvoiceInput): Promise<InvoiceRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("invoices")
        .insert({
            invoice_number: input.invoice_number,
            invoice_date: input.invoice_date,
            order_id: input.order_id ?? null,
            order_number: input.order_number ?? null,
            customer_id: input.customer_id ?? null,
            customer_code: input.customer_code ?? null,
            currency: input.currency ?? "USD",
            amount: input.amount,
            due_date: input.due_date ?? null,
            status: "open",
            notes: input.notes ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Invoice creation failed");
    return data;
}

export async function dbFindInvoiceByNumber(invoiceNumber: string): Promise<InvoiceRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .eq("invoice_number", invoiceNumber)
        .maybeSingle();
    if (error || !data) return null;
    return data;
}

export async function dbUpdateInvoiceStatus(id: string, status: InvoiceStatus): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("invoices")
        .update({ status })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

export async function dbSumPaymentsForInvoice(invoiceId: string): Promise<number> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("payments")
        .select("amount")
        .eq("invoice_id", invoiceId);
    if (error) return 0;
    return (data ?? []).reduce((sum, p) => sum + (p.amount ?? 0), 0);
}
