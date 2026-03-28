import { createServiceClient } from "./service";
import type { PaymentRow } from "@/lib/database.types";

export interface CreatePaymentInput {
    payment_number: string;
    invoice_id?: string;
    invoice_number?: string;
    payment_date: string;
    amount: number;
    currency?: string;
    payment_method?: string;
    notes?: string;
}

export async function dbCreatePayment(input: CreatePaymentInput): Promise<PaymentRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("payments")
        .insert({
            payment_number: input.payment_number,
            invoice_id: input.invoice_id ?? null,
            invoice_number: input.invoice_number ?? null,
            payment_date: input.payment_date,
            amount: input.amount,
            currency: input.currency ?? "USD",
            payment_method: input.payment_method ?? null,
            notes: input.notes ?? null,
        })
        .select("*")
        .single();
    if (error || !data) throw new Error(error?.message ?? "Payment creation failed");
    return data;
}

export async function dbListPayments(invoiceId?: string): Promise<PaymentRow[]> {
    const supabase = createServiceClient();
    let query = supabase.from("payments").select("*").order("payment_date", { ascending: false });
    if (invoiceId) query = query.eq("invoice_id", invoiceId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}
