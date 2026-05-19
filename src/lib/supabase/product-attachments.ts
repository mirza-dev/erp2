import { createServiceClient } from "./service";
import type { ProductAttachmentRow, ProductAttachmentKind } from "@/lib/database.types";

const STORAGE_BUCKET = "product-files";

export const ALLOWED_MIME = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
] as const;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const VALID_KINDS: ProductAttachmentKind[] = [
    "image", "datasheet", "certificate", "manual", "drawing", "other",
];

export function isValidAttachmentKind(k: unknown): k is ProductAttachmentKind {
    return typeof k === "string" && (VALID_KINDS as string[]).includes(k);
}

export function isAllowedMime(m: unknown): boolean {
    return typeof m === "string" && (ALLOWED_MIME as readonly string[]).includes(m);
}

function sanitizeExt(fileName: string, fallback: string): string {
    const raw = fileName.split(".").pop() ?? fallback;
    return raw.toLowerCase().replace(/[^a-z0-9]/g, "") || fallback;
}

export interface CreateAttachmentInput {
    productId: string;
    file: Buffer;
    fileName: string;
    fileSize: number;
    mimeType: string;
    kind: ProductAttachmentKind;
    metadata?: Record<string, unknown> | null;
    uploadedBy?: string | null;
}

export async function dbListAttachmentsByProduct(
    productId: string,
    kind?: ProductAttachmentKind,
): Promise<ProductAttachmentRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("product_attachments")
        .select("*")
        .eq("product_id", productId)
        .is("superseded_by", null)
        .order("uploaded_at", { ascending: false });

    if (kind) query = query.eq("kind", kind);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetAttachment(id: string): Promise<ProductAttachmentRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("product_attachments").select("*").eq("id", id).single();
    if (error || !data) return null;
    return data;
}

export async function dbCreateAttachment(input: CreateAttachmentInput): Promise<ProductAttachmentRow> {
    if (!input.productId) throw new Error("Ürün id'si zorunludur.");
    if (!input.fileName || input.fileName.trim().length === 0) throw new Error("Dosya adı zorunludur.");
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) throw new Error("Dosya boyutu geçersiz.");
    if (input.fileSize > MAX_FILE_SIZE) throw new Error(`Dosya ${MAX_FILE_SIZE / (1024 * 1024)} MB sınırını aşıyor.`);
    if (!isAllowedMime(input.mimeType)) throw new Error("Geçersiz dosya türü. PNG, JPEG, WebP veya PDF yükleyin.");
    if (!isValidAttachmentKind(input.kind)) throw new Error("Geçersiz dosya kategorisi.");

    const supabase = createServiceClient();

    const ext = sanitizeExt(input.fileName, input.mimeType === "application/pdf" ? "pdf" : "bin");

    // 1) DB insert (id üret); file_path geçici, upload sonrası aynı kalır.
    const { data: row, error: insertErr } = await supabase
        .from("product_attachments")
        .insert({
            product_id: input.productId,
            file_path: "", // upload sonrası set edilecek
            file_name: input.fileName,
            file_size: input.fileSize,
            mime_type: input.mimeType,
            kind: input.kind,
            metadata: input.metadata ?? null,
            uploaded_by: input.uploadedBy ?? null,
        })
        .select()
        .single();

    if (insertErr) throw new Error(insertErr.message);
    if (!row) throw new Error("Ek oluşturulamadı.");

    const path = `${input.productId}/${row.id}.${ext}`;

    // 2) Storage upload — başarısızsa DB satırını sil (orphan cleanup, avatar paterni)
    const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, input.file, { upsert: false, contentType: input.mimeType });

    if (uploadErr) {
        await supabase.from("product_attachments").delete().eq("id", row.id);
        throw new Error(`Dosya yüklenemedi: ${uploadErr.message}`);
    }

    // 3) file_path patch
    const { data: updated, error: updateErr } = await supabase
        .from("product_attachments")
        .update({ file_path: path })
        .eq("id", row.id)
        .select()
        .single();

    if (updateErr || !updated) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => { });
        await supabase.from("product_attachments").delete().eq("id", row.id);
        throw new Error(updateErr?.message ?? "Ek meta güncellenemedi.");
    }

    return updated;
}

export async function dbDeleteAttachment(id: string): Promise<void> {
    const supabase = createServiceClient();

    const { data: existing } = await supabase
        .from("product_attachments").select("file_path").eq("id", id).single();

    const { error: deleteErr } = await supabase
        .from("product_attachments").delete().eq("id", id);

    if (deleteErr) throw new Error(deleteErr.message);

    if (existing?.file_path) {
        await supabase.storage.from(STORAGE_BUCKET).remove([existing.file_path]).catch(() => {
            // best-effort: storage cleanup başarısız olsa bile DB row silindi
        });
    }
}

export async function dbSetPrimaryImage(productId: string, attachmentId: string): Promise<void> {
    const supabase = createServiceClient();

    // Önce mevcut primary'leri düşür (race: unique partial index sayesinde concurrent edge case'de bir UPDATE 1 hata verir)
    const { error: clearErr } = await supabase
        .from("product_attachments")
        .update({ is_primary_image: false })
        .eq("product_id", productId)
        .eq("is_primary_image", true);

    if (clearErr) throw new Error(clearErr.message);

    const { error: setErr } = await supabase
        .from("product_attachments")
        .update({ is_primary_image: true })
        .eq("id", attachmentId)
        .eq("product_id", productId)
        .eq("kind", "image");

    if (setErr) throw new Error(setErr.message);
}
