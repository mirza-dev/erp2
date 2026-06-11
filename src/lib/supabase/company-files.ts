/**
 * Şirket dosya arşivi (Ayarlar → Dosyalar, mig. 091) — DB + storage helper'ları.
 * product-attachments.ts kalıbı: insert → upload → path patch, orphan cleanup.
 *
 * Silme SOFT'tur (deleted_at) — storage objesi bilinçli olarak SİLİNMEZ
 * ("30 gün çöp kutusu" sözleşmesi; otomatik purge bu kapsamda yok).
 */
import { createServiceClient } from "./service";
import type { CompanyFileRow, CompanyFileCategory } from "@/lib/database.types";
import {
    MAX_COMPANY_FILE_SIZE,
    isAllowedCompanyFileExt,
    isCompanyFileCategory,
    contentTypeForExt,
    ALLOWED_COMPANY_FILE_EXT_LABEL,
} from "@/lib/company-files";

const STORAGE_BUCKET = "company-files";

export interface CreateCompanyFileInput {
    /** Uzantısız taban ad (modal'da kullanıcı düzenler); uzantı sunucuda eklenir. */
    baseName: string;
    /** Orijinal dosya adından gelen küçük-harf uzantı ("pdf"). */
    ext: string;
    category: CompanyFileCategory;
    file: Buffer;
    fileSize: number;
    uploadedBy?: string | null;
}

export async function dbListCompanyFiles(): Promise<CompanyFileRow[]> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("company_files")
        .select("*")
        .is("deleted_at", null)
        .order("uploaded_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
}

export async function dbGetCompanyFile(id: string): Promise<CompanyFileRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("company_files")
        .select("*")
        .eq("id", id)
        .is("deleted_at", null)
        .single();
    if (error || !data) return null;
    return data;
}

export async function dbCreateCompanyFile(input: CreateCompanyFileInput): Promise<CompanyFileRow> {
    const base = input.baseName.trim();
    const ext = input.ext.trim().toLowerCase();
    if (!base) throw new Error("Dosya adı zorunludur.");
    if (base.length > 200) throw new Error("Dosya adı en fazla 200 karakter olabilir.");
    if (!isAllowedCompanyFileExt(ext)) {
        throw new Error(`Desteklenmeyen dosya türü. Kabul edilenler: ${ALLOWED_COMPANY_FILE_EXT_LABEL}.`);
    }
    if (!isCompanyFileCategory(input.category)) throw new Error("Geçersiz kategori.");
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) throw new Error("Dosya boyutu geçersiz.");
    if (input.fileSize > MAX_COMPANY_FILE_SIZE) {
        throw new Error(`Dosya ${MAX_COMPANY_FILE_SIZE / (1024 * 1024)} MB sınırını aşıyor.`);
    }

    const mimeType = contentTypeForExt(ext)!;
    const displayName = `${base}.${ext}`;
    const supabase = createServiceClient();

    // 1) DB insert (id üret); file_path upload sonrası set edilir.
    const { data: row, error: insertErr } = await supabase
        .from("company_files")
        .insert({
            display_name: displayName,
            description: null,
            category: input.category,
            ext: ext.toUpperCase(),
            file_path: "",
            file_size: input.fileSize,
            mime_type: mimeType,
            uploaded_by: input.uploadedBy ?? null,
        })
        .select()
        .single();

    if (insertErr) throw new Error(insertErr.message);
    if (!row) throw new Error("Dosya kaydı oluşturulamadı.");

    const path = `company/${row.id}.${ext}`;

    // 2) Storage upload — başarısızsa DB satırını sil (orphan cleanup)
    const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, input.file, { upsert: false, contentType: mimeType });

    if (uploadErr) {
        await supabase.from("company_files").delete().eq("id", row.id);
        throw new Error(`Dosya yüklenemedi: ${uploadErr.message}`);
    }

    // 3) file_path patch — başarısızsa storage + satır geri alınır
    const { data: updated, error: updateErr } = await supabase
        .from("company_files")
        .update({ file_path: path })
        .eq("id", row.id)
        .select()
        .single();

    if (updateErr || !updated) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => { });
        await supabase.from("company_files").delete().eq("id", row.id);
        throw new Error(updateErr?.message ?? "Dosya meta güncellenemedi.");
    }

    return updated;
}

/**
 * Ad/kategori güncelleme (allow-list). Şu an UI tüketicisi yok — rename
 * aksiyonu eklenirse PATCH route'u bununla birlikte gelir.
 */
export async function dbUpdateCompanyFileMeta(
    id: string,
    patch: { display_name?: string; category?: CompanyFileCategory },
): Promise<CompanyFileRow> {
    const allowed: Record<string, unknown> = {};
    if (patch.display_name !== undefined) allowed.display_name = patch.display_name;
    if (patch.category !== undefined) allowed.category = patch.category;
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("company_files")
        .update(allowed)
        .eq("id", id)
        .is("deleted_at", null)
        .select()
        .single();
    if (error || !data) throw new Error(error?.message ?? "Dosya bulunamadı.");
    return data;
}

/** Soft-delete: deleted_at damgalanır; storage objesi 30 gün sözleşmesiyle KALIR. */
export async function dbSoftDeleteCompanyFile(id: string): Promise<boolean> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("company_files")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id)
        .is("deleted_at", null)
        .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
}

export async function dbGetCompanyFileSignedUrl(
    filePath: string,
    options?: { download?: boolean | string },
): Promise<string | null> {
    if (!filePath) return null;
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(filePath, 3600, options?.download ? { download: options.download } : undefined);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
}
