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
    dbClaimImportDocumentForApply,
} from "@/lib/supabase/import-documents";
import { dbListLinesByDocument } from "@/lib/supabase/import-document-lines";
import { dbCreateProduct, dbUpdateProduct, dbGetProductById } from "@/lib/supabase/products";
import { dbCreateAttachment, dbSupersedeCertificatesByName } from "@/lib/supabase/product-attachments";
import type { ImportDocumentLineRow } from "@/lib/database.types";

const STORAGE_BUCKET = "product-files";

const APPLY_ELIGIBLE_ACTIONS = new Set(["matched", "reviewed", "new_product"]);

export interface ApplyResult {
    products_created: number;
    products_updated: number;
    attachments_created: number;
    attachments_superseded: number;
    skipped: number;
    errors: string[]; // "Satır N: <reason>"
    untyped_products: number;
    // Faz 3c Review 5.tur (P2/P3 follow-up): true → ürün/cert ZATEN yazıldı
    // ama terminal 'applied' status update fail oldu, doc DB'de 'applying'de
    // takılı. UI bu flag'i görürse setDocStatus('applied') YAPMAZ — admin
    // recovery gerektiğini kullanıcıya bildirir. Audit log forensic kayıt
    // (after_state.status_update_failed) bu flag ile hizalı.
    status_update_failed: boolean;
}

function emptyResult(): ApplyResult {
    return {
        products_created: 0,
        products_updated: 0,
        attachments_created: 0,
        attachments_superseded: 0,
        skipped: 0,
        errors: [],
        untyped_products: 0,
        status_update_failed: false,
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
    // Faz 3c Review 3.tur (P2 race): Atomik CAS — apply yetkisi al.
    // classified → applying tek SQL'de; yarışı kazanan iş yapar, kaybeden
    // null alır → "zaten işleniyor / hazır değil" throw. Lock sonunda
    // try/catch içinde 'applied' (başarı) veya 'classified' (rollback) ile
    // serbest bırakılır.
    const claimed = await dbClaimImportDocumentForApply(documentId);
    if (!claimed) {
        // CAS başarısız — doc'u oku ki kullanıcıya net hata mesajı verebilelim
        const current = await dbGetImportDocument(documentId);
        if (!current) throw new Error("Belge bulunamadı");
        throw new Error(`Belge uygulanmaya hazır değil (durum: ${current.status})`);
    }
    const doc = claimed;

    const result = emptyResult();
    let successPath = false;
    // Faz 3c Review 4.tur (P2): post-commit terminal status update fail flag.
    // True → ürün/cert yazıldı ama 'applied' yazılamadı; doc 'applying'de kalır.
    let postCommitStatusFailed = false;

    try {
        // 1. Lines
        const lines = await dbListLinesByDocument(documentId);

        // 2. Eligible filter + skipped count (pending + skipped)
        const eligible = lines.filter(l => APPLY_ELIGIBLE_ACTIONS.has(l.match_action));
        result.skipped = lines.length - eligible.length;
        if (eligible.length === 0) {
            // Hiçbir uygulanabilir satır yok — lock'u serbest bırak ('classified'),
            // result döner (UI bilgilendirir). Kullanıcı satırları onaylayıp
            // tekrar tetikleyebilir.
            await dbUpdateImportDocumentStatus(documentId, "classified");
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
                    const newCert = await dbCreateAttachment({
                        productId: line.matched_product_id,
                        file: docBuffer,
                        fileName: doc.file_name,
                        fileSize: doc.file_size,
                        mimeType: doc.mime_type,
                        kind: "certificate",
                        uploadedBy: actorUserId,
                    });
                    result.attachments_created += 1;

                    // Faz 3c Review P2-1: aynı (product_id, file_name) eski aktif
                    // sertifikaları yeni cert'e supersede et. Versiyonlama fail
                    // ederse yeni cert geri alınmaz (zaten aktif); warning logla.
                    try {
                        const superseded = await dbSupersedeCertificatesByName(
                            line.matched_product_id,
                            doc.file_name,
                            newCert.id,
                        );
                        if (superseded > 0) {
                            result.attachments_superseded += superseded;
                        }
                    } catch (vErr) {
                        const vMsg = vErr instanceof Error ? vErr.message : String(vErr);
                        result.errors.push(
                            `Satır ${line.line_number}: versiyonlama uyarısı — ${vMsg}`,
                        );
                    }
                }
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                result.errors.push(`Satır ${line.line_number}: ${msg}`);
                result.skipped += 1;
            }
        }

        // 5. Doc terminal state.
        // Faz 3c Review P2-2: All-fail policy — successCount=0 ise doc 'classified'
        // kalır (lock serbest); kullanıcı satırları düzeltip tekrar Uygula.
        // successCount>0 → 'applied' terminal.
        const successCount =
            result.products_created
            + result.products_updated
            + result.attachments_created;

        if (successCount > 0) {
            // Faz 3c Review 4.tur (P2): post-commit guard — ürün/cert ZATEN
            // yazıldı. Status update fail ederse 'classified'e rollback YAPMA
            // (outer catch'i tetikleme); aksi halde kullanıcı tekrar Apply →
            // duplicate product/cert riski. 'applying'de bırak: ikinci çağrı
            // claim null alır ("hazır değil"), duplicate engellenir.
            // Admin SQL ile manuel 'applied'a alır veya recovery cron temizler.
            // Audit log status_update_failed=true ile forensic kayıt yapılır.
            try {
                await dbUpdateImportDocumentStatus(documentId, "applied");
                successPath = true;
            } catch (statusErr) {
                postCommitStatusFailed = true;
                // Faz 3c Review 5.tur: result'a da flag yaz → API response'ta
                // UI'a taşınır, "Belge uygulandı" yerine "admin recovery gerek"
                // mesajı gösterilir (yanıltıcı applied state önlenir).
                result.status_update_failed = true;
                console.error(
                    "[import-apply] CRITICAL: applied status update failed AFTER commit; doc stays in 'applying' to prevent duplicate apply",
                    statusErr,
                );
                // throw YOK — outer catch'e düşmesin, audit yazılsın.
            }
        } else {
            // Faz 3c Review 3.tur: lock'u serbest bırak — 'applying' takılı kalmasın
            await dbUpdateImportDocumentStatus(documentId, "classified");
        }
    } catch (err) {
        // Faz 3c Review 3.tur: dış exception (storage download / claim sonrası
        // listLines fail vb.) → lock'u 'classified'e geri çek, hata propagate.
        // Per-row loop kendi try/catch'i ile bu dala düşmez (errors[]'e push'lar).
        // Faz 3c Review 4.tur: post-commit status fail bu dala DÜŞMEZ (içeride
        // yutulur) — ürün/cert yazıldıktan sonra 'classified'e dönmek tehlikeli.
        try { await dbUpdateImportDocumentStatus(documentId, "classified"); }
        catch (rollbackErr) {
            console.warn("[import-apply] rollback failed:", rollbackErr);
        }
        throw err;
    }

    // Faz 3c Review P3: Aggregate audit log — apply olayının forensic kaydı.
    // Mevcut DB helper'ların kendi per-row audit'leri korunur; bu agg-level.
    // All-fail dahil her apply denemesi loglanır (best-effort). Exception
    // path'inde buraya gelinmez (throw yukarıda); sadece tamamlanan apply'lar
    // burada loglanır.
    try {
        const sb = createServiceClient();
        const { error: auditErr } = await sb.from("audit_log").insert({
            action: "import_applied",
            entity_type: "import_document",
            entity_id: documentId,
            after_state: {
                products_created: result.products_created,
                products_updated: result.products_updated,
                attachments_created: result.attachments_created,
                attachments_superseded: result.attachments_superseded,
                skipped: result.skipped,
                errors_count: result.errors.length,
                untyped_products: result.untyped_products,
                success: successPath,
                // Faz 3c Review 4.tur (P2): true → ürün/cert yazıldı ama
                // 'applied' status update fail oldu, doc 'applying'de takılı.
                status_update_failed: postCommitStatusFailed,
            },
            source: "ui",
            actor: actorUserId,
        });
        if (auditErr) console.warn("[import-apply] audit insert failed:", auditErr);
    } catch (err) {
        // Audit insert fail apply başarısını geri almaz; sadece log
        console.warn("[import-apply] audit insert exception:", err);
    }

    return result;
}
