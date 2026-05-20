/**
 * Faz 3b — Import Document Lines helper.
 *
 * AI ekstraksiyonu sonucu çıkarılan ürün satırlarının CRUD'u.
 * Her satır bir aday ürün veya sertifika hedefi; matching algoritması
 * top-3 candidate üretip storage'a yazar.
 *
 * Re-extract: dbReplaceLinesForDocument DELETE + bulk INSERT yapar.
 * Tek istek değil ama küçük N için kabul edilebilir (catalog 100-200 satır).
 */
import { createServiceClient } from "./service";
import type {
    ImportDocumentLineRow,
    ImportDocumentLineExtractionType,
    ImportDocumentLineMatchAction,
    ImportDocumentLineCandidate,
} from "@/lib/database.types";

export interface CreateExtractedLineInput {
    line_number: number;
    extraction_type: ImportDocumentLineExtractionType;
    product_type_id?: string | null;
    extracted_name?: string | null;
    extracted_sku?: string | null;
    extracted_attributes?: Record<string, unknown>;
    candidate_matches?: ImportDocumentLineCandidate[];
    matched_product_id?: string | null;
    match_confidence?: number | null;
    match_action?: ImportDocumentLineMatchAction;
}

export interface UpdateLineMatchInput {
    matched_product_id?: string | null;
    match_action: ImportDocumentLineMatchAction;
    match_confidence?: number | null;
    reviewed_by?: string | null;
    /**
     * Review 3b 3.tur: kullanıcı UI'dan tip override edebilir
     * (AI yanlış tip seçti veya null bıraktıysa). undefined = patch'e
     * yazma (mevcut korunur), null = explicit clear.
     */
    product_type_id?: string | null;
}

const VALID_MATCH_ACTIONS: ImportDocumentLineMatchAction[] = [
    "pending", "matched", "new_product", "skipped", "reviewed",
];

export function isValidMatchAction(v: unknown): v is ImportDocumentLineMatchAction {
    return typeof v === "string" && (VALID_MATCH_ACTIONS as string[]).includes(v);
}

export async function dbCreateExtractedLines(
    documentId: string,
    lines: CreateExtractedLineInput[],
): Promise<ImportDocumentLineRow[]> {
    if (lines.length === 0) return [];

    const sb = createServiceClient();
    const rows = lines.map(l => ({
        document_id: documentId,
        line_number: l.line_number,
        extraction_type: l.extraction_type,
        product_type_id: l.product_type_id ?? null,
        extracted_name: l.extracted_name ?? null,
        extracted_sku: l.extracted_sku ?? null,
        extracted_attributes: l.extracted_attributes ?? {},
        candidate_matches: l.candidate_matches ?? [],
        matched_product_id: l.matched_product_id ?? null,
        match_confidence: l.match_confidence ?? null,
        match_action: l.match_action ?? "pending",
    }));

    const { data, error } = await sb
        .from("import_document_lines")
        .insert(rows)
        .select("*")
        .order("line_number", { ascending: true });

    if (error) throw new Error(`Çıkarılan satırlar yazılamadı: ${error.message}`);
    return (data ?? []) as unknown as ImportDocumentLineRow[];
}

export async function dbListLinesByDocument(documentId: string): Promise<ImportDocumentLineRow[]> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("import_document_lines")
        .select("*")
        .eq("document_id", documentId)
        .order("line_number", { ascending: true });

    if (error) throw new Error(`Satırlar listelenemedi: ${error.message}`);
    return (data ?? []) as unknown as ImportDocumentLineRow[];
}

export async function dbGetLine(id: string): Promise<ImportDocumentLineRow | null> {
    const sb = createServiceClient();
    const { data, error } = await sb
        .from("import_document_lines")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (error) throw new Error(`Satır okunamadı: ${error.message}`);
    return (data ?? null) as ImportDocumentLineRow | null;
}

export async function dbUpdateLineMatch(
    id: string,
    input: UpdateLineMatchInput,
): Promise<ImportDocumentLineRow> {
    if (!isValidMatchAction(input.match_action)) {
        throw new Error("Geçersiz eşleştirme aksiyonu.");
    }
    // reviewed_at: pending hariç tüm action'larda otomatik set
    const reviewedAt = input.match_action === "pending" ? null : new Date().toISOString();

    const patch: Record<string, unknown> = {
        matched_product_id: input.matched_product_id ?? null,
        match_action: input.match_action,
        match_confidence: input.match_confidence ?? null,
        reviewed_at: reviewedAt,
        reviewed_by: input.reviewed_by ?? null,
    };
    // product_type_id: undefined → patch'e yazma; null → explicit clear; string → set
    if (input.product_type_id !== undefined) {
        patch.product_type_id = input.product_type_id;
    }

    const sb = createServiceClient();
    const { data, error } = await sb
        .from("import_document_lines")
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

    if (error) throw new Error(`Satır güncellenemedi: ${error.message}`);
    return data as unknown as ImportDocumentLineRow;
}

/**
 * Re-extract için: önce mevcut satırları sil, sonra yenisini yaz.
 * Atomik değil (Supabase JS SDK'da TX yok), ama document_id CASCADE
 * sayesinde tutarsızlık penceresi minimum. Hata durumunda partial state olabilir.
 */
export async function dbReplaceLinesForDocument(
    documentId: string,
    lines: CreateExtractedLineInput[],
): Promise<ImportDocumentLineRow[]> {
    const sb = createServiceClient();
    const { error: delErr } = await sb
        .from("import_document_lines")
        .delete()
        .eq("document_id", documentId);
    if (delErr) throw new Error(`Eski satırlar silinemedi: ${delErr.message}`);

    return dbCreateExtractedLines(documentId, lines);
}
