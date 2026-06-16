/**
 * RFQ belgesi arşivi: gönderilen HTML snapshot'ları 'rfq-pdfs' private bucket'ında,
 * meta `supplier_rfq_archives` tablosunda (mig.100). quote-pdf-archives deseni; bir
 * RFQ için tedarikçi başına en çok bir arşiv (UNIQUE rfq_id, vendor_id).
 */
import { createServiceClient } from "./service";
import type { SupplierRfqArchiveRow } from "@/lib/database.types";

const STORAGE_BUCKET = "rfq-pdfs";

export interface CreateRfqArchiveInput {
    rfqId: string;
    vendorId: string;
    html: string;
    contentHash: string;
    byteSize: number;
    createdBy?: string | null;
}

export async function dbGetRfqArchive(rfqId: string, vendorId: string): Promise<SupplierRfqArchiveRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("supplier_rfq_archives")
        .select("*")
        .eq("rfq_id", rfqId)
        .eq("vendor_id", vendorId)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
}

/** Arşiv satırı + storage HTML. Orphan-safe: upload başarısızsa DB satırı silinir. */
export async function dbCreateRfqArchive(input: CreateRfqArchiveInput): Promise<SupplierRfqArchiveRow> {
    if (!input.rfqId || !input.vendorId) throw new Error("RFQ/tedarikçi id zorunludur.");
    if (!input.html || input.byteSize <= 0) throw new Error("Arşiv içeriği boş olamaz.");

    const supabase = createServiceClient();
    const path = `rfqs/${input.rfqId}/${input.vendorId}.html`;

    const { data: row, error: insertErr } = await supabase
        .from("supplier_rfq_archives")
        .insert({
            rfq_id: input.rfqId,
            vendor_id: input.vendorId,
            file_path: path,
            content_hash: input.contentHash,
            byte_size: input.byteSize,
            created_by: input.createdBy ?? null,
        })
        .select()
        .single();
    if (insertErr) throw new Error(insertErr.message);
    if (!row) throw new Error("Arşiv kaydı oluşturulamadı.");

    const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, Buffer.from(input.html, "utf-8"), { upsert: true, contentType: "text/html" });
    if (uploadErr) {
        await supabase.from("supplier_rfq_archives").delete().eq("id", row.id);
        throw new Error(`Arşiv dosyası yüklenemedi: ${uploadErr.message}`);
    }
    return row;
}

export async function dbDownloadRfqArchiveHtml(filePath: string): Promise<string | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(filePath);
    if (error || !data) return null;
    return await data.text();
}
