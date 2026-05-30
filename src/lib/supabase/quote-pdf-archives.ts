/**
 * Faz 4 (V7) — Teklif PDF arşivi helper'ları.
 * Dondurulmuş HTML snapshot'lar 'quote-pdfs' private bucket'ında saklanır;
 * meta `quote_pdf_archives` tablosunda (075). product-attachments paterni mirror.
 */
import { createServiceClient } from "./service";
import type { QuoteArchiveRow } from "@/lib/database.types";

const STORAGE_BUCKET = "quote-pdfs";

export interface CreateQuoteArchiveInput {
    quoteId: string;
    revisionNo: number;
    html: string;
    contentHash: string;
    byteSize: number;
    createdBy?: string | null;
}

/** Aynı (quote, revizyon) arşivi VARSA döner; yoksa null. */
export async function dbGetQuoteArchive(
    quoteId: string,
    revisionNo: number,
): Promise<QuoteArchiveRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("quote_pdf_archives")
        .select("*")
        .eq("quote_id", quoteId)
        .eq("revision_no", revisionNo)
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? null;
}

/**
 * Arşiv satırı + storage HTML'ini yazar. Orphan-safe: upload başarısızsa DB satırı
 * silinir. UNIQUE(quote_id, revision_no) → ikinci eşzamanlı/duplicate INSERT reddedilir
 * (V3-A5 immutability DB backstop'u; servis zaten existence pre-check yapar).
 */
export async function dbCreateQuoteArchive(input: CreateQuoteArchiveInput): Promise<QuoteArchiveRow> {
    if (!input.quoteId) throw new Error("Teklif id'si zorunludur.");
    if (!Number.isFinite(input.revisionNo) || input.revisionNo < 1) throw new Error("Geçersiz revizyon numarası.");
    if (!input.html || input.byteSize <= 0) throw new Error("Arşiv içeriği boş olamaz.");

    const supabase = createServiceClient();
    // path deterministik (quoteId + revisionNo her ikisi de baştan biliniyor).
    const path = `quotes/${input.quoteId}/r${input.revisionNo}.html`;

    // 1) DB insert (file_path final hâliyle)
    const { data: row, error: insertErr } = await supabase
        .from("quote_pdf_archives")
        .insert({
            quote_id: input.quoteId,
            revision_no: input.revisionNo,
            file_path: path,
            content_hash: input.contentHash,
            byte_size: input.byteSize,
            created_by: input.createdBy ?? null,
        })
        .select()
        .single();
    if (insertErr) throw new Error(insertErr.message);
    if (!row) throw new Error("Arşiv kaydı oluşturulamadı.");

    // 2) Storage upload — başarısızsa DB satırını sil (orphan cleanup)
    const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, Buffer.from(input.html, "utf-8"), {
            upsert: false,
            // Bucket allowlist (076) = ['text/html']; charset parametresi eklemek
            // Supabase exact-match'inde upload'ı reddedebilir. Encoding zaten
            // arşiv HTML'inin <meta charset="utf-8">'inde garanti.
            contentType: "text/html",
        });
    if (uploadErr) {
        await supabase.from("quote_pdf_archives").delete().eq("id", row.id);
        throw new Error(`Arşiv dosyası yüklenemedi: ${uploadErr.message}`);
    }

    return row;
}

/**
 * Faz 6 (P2 phantom recover): stale arşiv satırını siler (DB row + best-effort
 * storage remove). DB satırı var ama storage objesi yok ("phantom") durumunda
 * accept öncesi recover için: stale row silinir → serviceArchiveQuotePdf yeniden
 * üretir (UNIQUE(quote_id,revision_no) çakışması önlenir). Storage remove no-op
 * olabilir (obje zaten yok) — hata yutulur, asıl amaç DB satırını temizlemek.
 */
export async function dbDeleteQuoteArchive(id: string, filePath?: string): Promise<void> {
    const supabase = createServiceClient();
    if (filePath) {
        try {
            await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
        } catch { /* obje zaten yok olabilir — best-effort */ }
    }
    const { error } = await supabase.from("quote_pdf_archives").delete().eq("id", id);
    if (error) throw new Error(error.message);
}

/** İmzalı (signed) URL — donmuş HTML'in geçici erişim linki (default 1 saat). */
export async function dbGetArchiveSignedUrl(filePath: string, expiresIn = 3600): Promise<string | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(filePath, expiresIn);
    if (error || !data) return null;
    return data.signedUrl;
}

/**
 * Bulgu 4 / P3-2 (2026-05-30): storage'da dosya GERÇEKTEN var mı?
 * `createSignedUrl` obje yokluğunu kontrol etmez — yok olan path için bile
 * geçerli görünen URL üretir, 404 erişim anında (window.open sonrası) patlar.
 * dbCreateQuoteArchive insert-sonrası-upload (concurrency için bilinçli) →
 * nadir crash/timeout penceresinde DB satırı var ama dosya yok ("phantom") olabilir.
 * Bu kontrol GET route'un phantom'ı graceful 404'e (info toast) düşürmesini sağlar.
 */
export async function dbArchiveObjectExists(filePath: string): Promise<boolean> {
    const supabase = createServiceClient();
    const slash = filePath.lastIndexOf("/");
    const folder = slash >= 0 ? filePath.slice(0, slash) : "";
    const name = slash >= 0 ? filePath.slice(slash + 1) : filePath;
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(folder, { search: name });
    if (error || !data) return false;
    return data.some(obj => obj.name === name);
}

/**
 * Faz 6 (P2 recover — advisor): obje KESİN yok mu? `dbArchiveObjectExists`'ten
 * FARKI: list HATASI (geçici .list() blip) "yok" SAYILMAZ. Yıkıcı recover yolu
 * (stale row sil + storage remove) yalnız KESİN yokluk üzerine tetiklenmeli;
 * aksi halde geçici bir storage hatası SAĞLAM bir immutable arşivi yok eder.
 * Dönüş: true YALNIZCA list başarılı + obje listede yok ise. Hata/belirsizlik → false
 * (fail-safe: arşive dokunma, existing dön). GET route lenient versiyonu kullanmaya
 * devam eder (404-on-ambiguity zararsız).
 */
export async function dbArchiveObjectConfirmedMissing(filePath: string): Promise<boolean> {
    const supabase = createServiceClient();
    const slash = filePath.lastIndexOf("/");
    const folder = slash >= 0 ? filePath.slice(0, slash) : "";
    const name = slash >= 0 ? filePath.slice(slash + 1) : filePath;
    const { data, error } = await supabase.storage
        .from(STORAGE_BUCKET)
        .list(folder, { search: name });
    if (error || !data) return false;          // belirsiz → KESİN yok DEĞİL
    return !data.some(obj => obj.name === name); // yalnız list OK + obje yok
}
