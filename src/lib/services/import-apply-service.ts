/**
 * Faz 3c — Import document apply pipeline.
 *
 * `ExtractionReview` ekranında kullanıcı satırları durumlandırdıktan sonra
 * (matched / reviewed / new_product / skipped) bu service apply'ı tetikler.
 * Per-row try/catch loose paterni (serviceConfirmBatch modeli) — bir satırın
 * başarısızlığı diğerlerini etkilemez; `ApplyResult.errors` per-row mesaj
 * taşır.
 *
 * Idempotency: apply tamamlandığında doc.status='applied' olur; ikinci çağrı
 * pre-check'te throw eder.
 */
import { createServiceClient } from "@/lib/supabase/service";
import {
    dbGetImportDocument,
    dbUpdateImportDocumentStatus,
} from "@/lib/supabase/import-documents";
import { dbListLinesByDocument } from "@/lib/supabase/import-document-lines";
import { dbCreateProduct, dbUpdateProduct, dbGetProductById } from "@/lib/supabase/products";
import { dbCreateAttachment } from "@/lib/supabase/product-attachments";
import type { ImportDocumentLineRow } from "@/lib/database.types";

const STORAGE_BUCKET = "product-files";

const APPLY_ELIGIBLE_ACTIONS = new Set(["matched", "reviewed", "new_product"]);

export interface ApplyResult {
    products_created: number;
    products_updated: number;
    attachments_created: number;
    skipped: number;
    errors: string[]; // "Satır N: <reason>"
    untyped_products: number;
}

function emptyResult(): ApplyResult {
    return {
        products_created: 0,
        products_updated: 0,
        attachments_created: 0,
        skipped: 0,
        errors: [],
        untyped_products: 0,
    };
}

/**
 * Yeni ürün adayı satırından minimal `CreateProductInput` üretir. Mevcut
 * `extracted_name`/`extracted_sku` yoksa hata fırlatır (DB NOT NULL).
 * AI attributes Faz 1 dinamik şema slot'una geçer; product_type tekstüel
 * 'manufactured' alanı için Faz 1 default 'manufactured' kullanılır
 * (commercial seçimi UI'dan sonra yapılır).
 */
function buildCreateProductInput(line: ImportDocumentLineRow): {
    name: string; sku: string; unit: string;
    product_type_id: string | null;
    attributes: Record<string, unknown>;
} {
    const name = (line.extracted_name ?? "").trim();
    const sku = (line.extracted_sku ?? "").trim();
    if (!name) throw new Error("ad eksik");
    if (!sku) throw new Error("SKU eksik");
    return {
        name,
        sku,
        unit: "adet", // PMT için varsayılan; UI sonra düzeltebilir
        product_type_id: line.product_type_id,
        attributes: line.extracted_attributes ?? {},
    };
}

export async function serviceApplyImportDocument(
    documentId: string,
    actorUserId: string | null,
): Promise<ApplyResult> {
    // 1. Doc + lines
    const doc = await dbGetImportDocument(documentId);
    if (!doc) throw new Error("Belge bulunamadı");
    if (doc.status !== "classified") {
        throw new Error(`Belge uygulanmaya hazır değil (durum: ${doc.status})`);
    }

    const lines = await dbListLinesByDocument(documentId);
    const result = emptyResult();

    // 2. Eligible filter + skipped count (pending + skipped)
    const eligible = lines.filter(l => APPLY_ELIGIBLE_ACTIONS.has(l.match_action));
    result.skipped = lines.length - eligible.length;
    if (eligible.length === 0) {
        // Hiçbir uygulanabilir satır yok — doc status 'applied' yapma; kullanıcı
        // önce satırları onaylasın. Result döner (UI bilgilendirir).
        return result;
    }

    // 3. Storage download (yalnız cert flow'larında kullanılır; bir kere yükle)
    let docBuffer: Buffer | null = null;
    const hasCert = eligible.some(l => l.extraction_type === "certificate_target");
    if (hasCert) {
        const sb = createServiceClient();
        const { data: blob, error: dlErr } = await sb.storage
            .from(STORAGE_BUCKET)
            .download(doc.file_path);
        if (dlErr || !blob) {
            throw new Error(`Belge dosyası okunamadı: ${dlErr?.message ?? "boş yanıt"}`);
        }
        docBuffer = Buffer.from(await blob.arrayBuffer());
    }

    // 4. Per-row apply (loose try/catch)
    for (const line of eligible) {
        try {
            if (line.extraction_type === "product") {
                if (line.match_action === "new_product") {
                    const input = buildCreateProductInput(line);
                    await dbCreateProduct(input);
                    result.products_created += 1;
                    if (!input.product_type_id) result.untyped_products += 1;
                } else {
                    // matched | reviewed
                    if (!line.matched_product_id) {
                        throw new Error("eşleşen ürün ID'si yok");
                    }
                    const current = await dbGetProductById(line.matched_product_id);
                    if (!current) {
                        throw new Error("eşleşen ürün bulunamadı");
                    }
                    // attributes merge: { ...current, ...new } — yeni ezerler
                    const mergedAttributes = {
                        ...(current.attributes ?? {}),
                        ...(line.extracted_attributes ?? {}),
                    };
                    await dbUpdateProduct(line.matched_product_id, {
                        attributes: mergedAttributes,
                    });
                    result.products_updated += 1;
                }
            } else if (line.extraction_type === "certificate_target") {
                if (line.match_action === "new_product") {
                    throw new Error(
                        "Sertifika için 'yeni ürün' apply edilemez; önce ürün yarat veya sertifikayı atla",
                    );
                }
                if (!line.matched_product_id) {
                    throw new Error("sertifika için hedef ürün seçilmemiş");
                }
                if (!docBuffer) {
                    throw new Error("belge buffer'ı yüklenemedi");
                }
                await dbCreateAttachment({
                    productId: line.matched_product_id,
                    file: docBuffer,
                    fileName: doc.file_name,
                    fileSize: doc.file_size,
                    mimeType: doc.mime_type,
                    kind: "certificate",
                    uploadedBy: actorUserId,
                });
                result.attachments_created += 1;
            }
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result.errors.push(`Satır ${line.line_number}: ${msg}`);
            result.skipped += 1;
        }
    }

    // 5. Doc terminal state (best-effort; başarı olmasa bile applied — kullanıcı
    // re-extract veya new doc ile yeniden başlayabilir; errors[] log'da kalır).
    await dbUpdateImportDocumentStatus(documentId, "applied");

    return result;
}
