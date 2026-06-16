import { createServiceClient } from "./service";
import type {
    SupplierRfqRow,
    SupplierRfqLineRow,
    SupplierRfqVendorRow,
    SupplierRfqPriceRow,
    SupplierPriceHistoryRow,
    SupplierRfqStatus,
} from "@/lib/database.types";

export type { SupplierRfqStatus };

/** Liste satırı: başlık + davet/yanıt sayaçları (UI ilerleme rozeti). */
export interface RfqListRow extends SupplierRfqRow {
    vendor_count: number;
    responded_count: number;
    line_count: number;
}

/** Detay: başlık + kalemler + (vendor + fiyat hücreleri) + fiyat geçmişi. */
export interface RfqVendorWithPrices extends SupplierRfqVendorRow {
    vendor_name: string;
    vendor_email: string | null;
    prices: SupplierRfqPriceRow[];
}
export interface RfqDetail extends SupplierRfqRow {
    lines: SupplierRfqLineRow[];
    vendors: RfqVendorWithPrices[];
    price_history: (SupplierPriceHistoryRow & { vendor_name: string })[];
}

export interface CreateRfqInput {
    title?: string | null;
    dueDate?: string | null;
    currency: string;
    notes?: string | null;
    lines: CreateRfqLine[];
    vendorIds: string[];
    createdBy?: string | null;
}
export interface CreateRfqLine {
    product_id: string;
    product_code?: string | null;
    description?: string | null;
    quantity: number;
    unit?: string | null;
    target_date?: string | null;
    notes?: string | null;
}

export interface ListRfqFilter {
    status?: SupplierRfqStatus;
    search?: string;
}

export async function dbListRfqs(filter: ListRfqFilter = {}): Promise<RfqListRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("supplier_rfqs")
        .select("*")
        .order("created_at", { ascending: false });

    if (filter.status) query = query.eq("status", filter.status);
    if (filter.search?.trim()) {
        const s = `%${filter.search.trim()}%`;
        query = query.or(`rfq_number.ilike.${s},title.ilike.${s}`);
    }

    const { data: rfqs, error } = await query;
    if (error) throw new Error(error.message);
    const rows = rfqs ?? [];
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id);
    const [{ data: vendors }, { data: lines }] = await Promise.all([
        supabase.from("supplier_rfq_vendors").select("rfq_id, status").in("rfq_id", ids),
        supabase.from("supplier_rfq_lines").select("rfq_id").in("rfq_id", ids),
    ]);

    const vCount = new Map<string, number>();
    const rCount = new Map<string, number>();
    for (const v of vendors ?? []) {
        vCount.set(v.rfq_id, (vCount.get(v.rfq_id) ?? 0) + 1);
        if (v.status === "responded") rCount.set(v.rfq_id, (rCount.get(v.rfq_id) ?? 0) + 1);
    }
    const lCount = new Map<string, number>();
    for (const l of lines ?? []) lCount.set(l.rfq_id, (lCount.get(l.rfq_id) ?? 0) + 1);

    return rows.map((r) => ({
        ...r,
        vendor_count: vCount.get(r.id) ?? 0,
        responded_count: rCount.get(r.id) ?? 0,
        line_count: lCount.get(r.id) ?? 0,
    }));
}

export async function dbGetRfqById(id: string): Promise<RfqDetail | null> {
    const supabase = createServiceClient();

    const { data: rfq, error } = await supabase
        .from("supplier_rfqs")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !rfq) return null;

    const { data: lines } = await supabase
        .from("supplier_rfq_lines")
        .select("*")
        .eq("rfq_id", id)
        .order("position");

    const { data: vendorRows } = await supabase
        .from("supplier_rfq_vendors")
        .select("*, vendor:vendors(name, contact_email)")
        .eq("rfq_id", id)
        .order("id");

    const vendorIds = (vendorRows ?? []).map((v) => v.id);
    const { data: priceRows } = vendorIds.length
        ? await supabase.from("supplier_rfq_prices").select("*").in("rfq_vendor_id", vendorIds)
        : { data: [] as SupplierRfqPriceRow[] };

    const pricesByVendor = new Map<string, SupplierRfqPriceRow[]>();
    for (const p of priceRows ?? []) {
        const list = pricesByVendor.get(p.rfq_vendor_id) ?? [];
        list.push(p);
        pricesByVendor.set(p.rfq_vendor_id, list);
    }

    const vendors: RfqVendorWithPrices[] = (vendorRows ?? []).map((v) => {
        const vendorObj = (v as unknown as { vendor: { name: string; contact_email: string | null } | null }).vendor;
        const { vendor: _omit, ...rest } = v as unknown as SupplierRfqVendorRow & { vendor: unknown };
        void _omit;
        return {
            ...(rest as SupplierRfqVendorRow),
            vendor_name: vendorObj?.name ?? "—",
            vendor_email: vendorObj?.contact_email ?? null,
            prices: pricesByVendor.get(v.id) ?? [],
        };
    });

    const productIds = Array.from(new Set((lines ?? []).map((l) => l.product_id)));
    const { data: history } = productIds.length
        ? await supabase
              .from("supplier_price_history")
              .select("*, vendor:vendors(name)")
              .in("product_id", productIds)
              .order("recorded_at", { ascending: false })
              .limit(200)
        : { data: [] };

    const price_history = (history ?? []).map((h) => {
        const vendorObj = (h as unknown as { vendor: { name: string } | null }).vendor;
        const { vendor: _o, ...rest } = h as unknown as SupplierPriceHistoryRow & { vendor: unknown };
        void _o;
        return { ...(rest as SupplierPriceHistoryRow), vendor_name: vendorObj?.name ?? "—" };
    });

    return {
        ...rfq,
        lines: lines ?? [],
        vendors,
        price_history,
    };
}

export async function dbCreateRfq(input: CreateRfqInput): Promise<{ id: string; rfq_number: string }> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("create_rfq_with_lines", {
        p_header: {
            title: input.title ?? null,
            due_date: input.dueDate ?? null,
            currency: input.currency,
            notes: input.notes ?? null,
        },
        p_lines: input.lines,
        p_vendor_ids: input.vendorIds,
        p_actor: input.createdBy ?? "system",
    });
    if (error || !data?.[0]) throw new Error(error?.message ?? "RFQ oluşturulamadı.");
    return { id: data[0].rfq_id, rfq_number: data[0].rfq_number };
}

export async function dbUpdateRfq(
    id: string,
    input: Omit<CreateRfqInput, "createdBy">,
    actor: string,
): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("update_rfq_with_lines", {
        p_id: id,
        p_header: {
            title: input.title ?? null,
            due_date: input.dueDate ?? null,
            currency: input.currency,
            notes: input.notes ?? null,
        },
        p_lines: input.lines,
        p_vendor_ids: input.vendorIds,
        p_actor: actor,
    });
    if (error) throw new Error(error.message);
}

export async function dbMarkRfqSent(id: string, actor: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("mark_rfq_sent", { p_rfq_id: id, p_actor: actor });
    if (error) throw new Error(error.message);
}

export interface VendorQuoteHeader {
    currency?: string;
    valid_until?: string | null;
    lead_time_days?: number | null;
    notes?: string | null;
    status?: string;
}
export interface VendorQuotePriceInput {
    rfq_line_id: string;
    unit_price?: number | null;
    lead_time_days?: number | null;
    moq?: number | null;
    notes?: string | null;
}

export async function dbUpsertVendorQuote(
    rfqVendorId: string,
    header: VendorQuoteHeader,
    prices: VendorQuotePriceInput[],
    actor: string,
): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("upsert_rfq_vendor_quote", {
        p_rfq_vendor_id: rfqVendorId,
        p_header: header,
        p_prices: prices,
        p_actor: actor,
    });
    if (error) throw new Error(error.message);
}

export interface RfqAward {
    rfq_line_id: string;
    vendor_id: string;
    quantity: number;
    unit_price: number;
    discount_pct?: number;
}
export interface AwardedPO {
    vendor_id: string;
    po_id: string;
    po_number: string;
}

export async function dbAwardRfq(id: string, awards: RfqAward[], actor: string): Promise<AwardedPO[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("award_rfq_create_pos", {
        p_rfq_id: id,
        p_awards: awards,
        p_actor: actor,
    });
    if (error) throw new Error(error.message);
    return (data ?? []) as AwardedPO[];
}

export async function dbCancelRfq(id: string, reason: string, actor: string): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase.rpc("cancel_rfq", { p_rfq_id: id, p_reason: reason, p_actor: actor });
    if (error) throw new Error(error.message);
}

/** Yalnız draft RFQ silinebilir (CASCADE satır/vendor/fiyat). */
export async function dbDeleteRfq(id: string): Promise<void> {
    const supabase = createServiceClient();
    const { data: rfq } = await supabase.from("supplier_rfqs").select("status").eq("id", id).single();
    if (!rfq) throw new Error("RFQ bulunamadı.");
    if (rfq.status !== "draft") throw new Error("Yalnız taslak RFQ silinebilir.");
    const { error } = await supabase.from("supplier_rfqs").delete().eq("id", id).eq("status", "draft");
    if (error) throw new Error(error.message);
}
