/**
 * Faz 3a — Import documents helper.
 *
 * Uploaded files for AI document classification. Reuses the product-files
 * bucket (no separate bucket). 3-step orphan-safe insert mirrors
 * dbCreateAttachment (insert pending → storage upload → patch file_path);
 * if storage fails the DB row is deleted (no orphans).
 *
 * Storage path: `import-staging/{document_id}.{ext}` inside `product-files`
 * bucket. Apply phase (3c) will either copy to a product-bound path or
 * leave the staging file alone (cron cleanup decision deferred).
 */
import { createServiceClient } from "./service";
import type {
    ImportDocumentRow,
    ImportDocumentStatus,
    DocumentClassification,
} from "@/lib/database.types";

const STORAGE_BUCKET = "product-files";
const STAGING_PREFIX = "import-staging";

// Faz 3a classifier accepts a broader MIME set than product_attachments.
// PDF/image are also valid attachment types (Faz 2d), but Excel/CSV are
// migration documents that never end up in product_attachments.
export const CLASSIFIER_ALLOWED_MIME = [
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
    "application/vnd.ms-excel", // xls
    "text/csv",
] as const;

export const CLASSIFIER_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function isClassifierAllowedMime(m: unknown): boolean {
    return typeof m === "string" && (CLASSIFIER_ALLOWED_MIME as readonly string[]).includes(m);
}

function sanitizeExt(fileName: string, mimeType: string): string {
    const raw = fileName.split(".").pop() ?? "";
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (cleaned) return cleaned;
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.startsWith("image/")) return mimeType.split("/")[1] ?? "bin";
    if (mimeType === "text/csv") return "csv";
    if (mimeType.includes("spreadsheet")) return "xlsx";
    if (mimeType === "application/vnd.ms-excel") return "xls";
    return "bin";
}

export interface CreateImportDocumentInput {
    batchId?: string | null;
    file: Buffer;
    fileName: string;
    fileSize: number;
    mimeType: string;
    classification?: DocumentClassification | null;
    status?: ImportDocumentStatus;
    createdBy?: string | null;
}

/**
 * 3-step orphan-safe create: INSERT pending → storage upload → UPDATE classified.
 *
 * **Commit point semantics (Faz 3a Review 3.d/3.e):** Route'un hard-cancel guard'ı
 * bu helper'ı çağırmadan ÖNCE iş görür (`req.signal.aborted` → 499). Helper
 * çağrıldıktan sonra abort sinyali helper'a yayılmaz; transaction kendi
 * try/catch'i içinde tamamlanır veya rollback olur (insert→upload fail → row sil).
 * Helper başladıktan sonra orphan ihtimali için 3c'deki 30-gün storage cron
 * cleanup'ı plan dahilindedir.
 */
export async function dbCreateImportDocument(
    input: CreateImportDocumentInput,
): Promise<ImportDocumentRow> {
    if (!input.fileName || input.fileName.trim().length === 0) {
        throw new Error("Dosya adı zorunludur.");
    }
    if (!Number.isFinite(input.fileSize) || input.fileSize <= 0) {
        throw new Error("Dosya boyutu geçersiz.");
    }
    if (input.fileSize > CLASSIFIER_MAX_FILE_SIZE) {
        throw new Error(
            `Dosya ${CLASSIFIER_MAX_FILE_SIZE / (1024 * 1024)} MB sınırını aşıyor.`,
        );
    }
    if (!isClassifierAllowedMime(input.mimeType)) {
        throw new Error("Geçersiz dosya türü.");
    }

    const supabase = createServiceClient();
    const status: ImportDocumentStatus = input.status ?? "pending";

    // 1) DB insert — id üret; file_path geçici boş
    const { data: row, error: insertErr } = await supabase
        .from("import_documents")
        .insert({
            batch_id: input.batchId ?? null,
            file_path: "",
            file_name: input.fileName,
            file_size: input.fileSize,
            mime_type: input.mimeType,
            classification: input.classification ?? null,
            status,
            classified_at: input.classification ? new Date().toISOString() : null,
            created_by: input.createdBy ?? null,
        })
        .select()
        .single();

    if (insertErr) throw new Error(insertErr.message);
    if (!row) throw new Error("Import document oluşturulamadı.");

    const ext = sanitizeExt(input.fileName, input.mimeType);
    const path = `${STAGING_PREFIX}/${row.id}.${ext}`;

    // 2) Storage upload — başarısızsa orphan'ı temizle
    const { error: uploadErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(path, input.file, {
            upsert: false,
            contentType: input.mimeType,
        });

    if (uploadErr) {
        await supabase.from("import_documents").delete().eq("id", row.id);
        throw new Error(`Dosya yüklenemedi: ${uploadErr.message}`);
    }

    // 3) file_path patch
    const { data: updated, error: updateErr } = await supabase
        .from("import_documents")
        .update({ file_path: path })
        .eq("id", row.id)
        .select()
        .single();

    if (updateErr || !updated) {
        await supabase.storage.from(STORAGE_BUCKET).remove([path]).catch(() => { });
        await supabase.from("import_documents").delete().eq("id", row.id);
        throw new Error(updateErr?.message ?? "Import document meta güncellenemedi.");
    }

    return updated as ImportDocumentRow;
}

export async function dbGetImportDocument(id: string): Promise<ImportDocumentRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_documents")
        .select("*")
        .eq("id", id)
        .single();
    if (error || !data) return null;
    return data as ImportDocumentRow;
}

export async function dbListImportDocumentsByBatch(
    batchId: string | null,
): Promise<ImportDocumentRow[]> {
    const supabase = createServiceClient();
    let query = supabase
        .from("import_documents")
        .select("*")
        .order("created_at", { ascending: false });
    query = batchId === null ? query.is("batch_id", null) : query.eq("batch_id", batchId);
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as ImportDocumentRow[];
}

export async function dbUpdateImportDocumentClassification(
    id: string,
    classification: DocumentClassification,
    status: ImportDocumentStatus = "classified",
): Promise<ImportDocumentRow> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_documents")
        .update({
            classification,
            status,
            classified_at: new Date().toISOString(),
            error_message: null,
        })
        .eq("id", id)
        .select()
        .single();
    if (error || !data) throw new Error(error?.message ?? "Classification güncellenemedi.");
    return data as ImportDocumentRow;
}

export async function dbMarkImportDocumentError(
    id: string,
    errorMessage: string,
): Promise<void> {
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("import_documents")
        .update({ status: "error", error_message: errorMessage })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

const VALID_STATUS_TRANSITIONS: ImportDocumentStatus[] = [
    "pending", "classifying", "classified", "applying", "error", "applied",
];

/**
 * Faz 3c: Apply pipeline sonunda doc'u terminal 'applied' state'ine alır.
 * Generic status update — diğer enum geçişleri için de kullanılır.
 */
export async function dbUpdateImportDocumentStatus(
    id: string,
    status: ImportDocumentStatus,
): Promise<void> {
    if (!VALID_STATUS_TRANSITIONS.includes(status)) {
        throw new Error(`Geçersiz status: ${status}`);
    }
    const supabase = createServiceClient();
    const { error } = await supabase
        .from("import_documents")
        .update({ status })
        .eq("id", id);
    if (error) throw new Error(error.message);
}

/**
 * Faz 3c Review 3.tur (P2 race): Atomik CAS — apply yetkisi al.
 *
 * `serviceApplyImportDocument` başında JS-side status check yapıyordu;
 * status okuma → AI/DB iş → status yazma arasında TOCTOU race penceresi
 * vardı. İki paralel apply (örn. iki sekme, retry, double-click) classified
 * status'unu aynı anda görüp ikisi de işleme girebiliyordu → duplicate
 * product/cert riski.
 *
 * Bu helper tek SQL'le classified durumundaki belgeyi 'applying'e geçirir.
 * Yarışı kazanan row'u döner; kaybeden null döner (zaten applying veya
 * applied veya başka bir terminal state'de).
 *
 * Kullanım: service başında çağrılır; null dönerse "zaten işleniyor / hazır
 * değil" hatası. Service sonunda dbUpdateImportDocumentStatus(id, 'applied')
 * (başarı) veya (id, 'classified') (rollback / all-fail / exception) ile
 * lock serbest bırakılır.
 *
 * Faz 8 import_batches `dbClaimBatchForConfirm` paterniyle aynı disiplin.
 */
export async function dbClaimImportDocumentForApply(
    id: string,
): Promise<ImportDocumentRow | null> {
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from("import_documents")
        .update({ status: "applying" })
        .eq("id", id)
        .eq("status", "classified")
        .select("*")
        .maybeSingle();
    if (error) throw new Error(error.message);
    return data as ImportDocumentRow | null;
}
