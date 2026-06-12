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
import { dbCreateProduct, dbUpdateProduct, dbGetProductById, type CreateProductInput } from "@/lib/supabase/products";
import {
    dbCreateAttachment,
    dbListAttachmentsByProduct,
    dbSetPrimaryImage,
    dbSupersedeCertificatesByName,
} from "@/lib/supabase/product-attachments";
import { dbGetProductTypeWithFields } from "@/lib/supabase/product-types";
import { normalizeCoreProductFields, IMPORT_CORE_PRODUCT_FIELD_KEYS } from "@/lib/import-center";
import { renderPdfPageToPng, pickRenderClip } from "@/lib/services/pdf-render";
import type {
    DocumentType,
    ImportDocumentLineRow,
    ProductAttachmentKind,
} from "@/lib/database.types";

const STORAGE_BUCKET = "product-files";

const APPLY_ELIGIBLE_ACTIONS = new Set(["matched", "reviewed", "new_product"]);

export interface ApplyResult {
    products_created: number;
    products_updated: number;
    attachments_created: number;
    attachments_superseded: number;
    technical_fields_applied: number;
    // Faz D — katalog PDF'inden render edilip ürüne eklenen görsel sayısı.
    images_extracted: number;
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

export interface ApplyFieldApproval {
    productFields?: string[];
    technicalAttributeKeys: string[];
    /**
     * Faz A — onaylanan core master-data alan anahtarları (category,
     * material_quality vb.). undefined/approval yok → tüm core_fields
     * uygulanır (attributes paterniyle simetrik). Belirtilirse yalnız
     * listedekiler uygulanır.
     */
    coreFields?: string[];
}

export interface ApplyOptions {
    fieldApprovals?: Record<string, ApplyFieldApproval>;
}

function emptyResult(): ApplyResult {
    return {
        products_created: 0,
        products_updated: 0,
        attachments_created: 0,
        attachments_superseded: 0,
        technical_fields_applied: 0,
        images_extracted: 0,
        skipped: 0,
        errors: [],
        untyped_products: 0,
        status_update_failed: false,
    };
}

/**
 * Per-row apply hatasını kullanıcı-dostu mesaja çevirir. products tablosunda
 * tek UNIQUE kısıt `sku` → create veya SKU-değiştiren update unique ihlali
 * verirse ham Postgres mesajı (`duplicate key value violates unique
 * constraint ...`) yerine net Türkçe rehber gösterilir. Diğer hatalar
 * olduğu gibi geçer. POST /api/products `msg.includes("unique")` paterniyle
 * tutarlı (kök helper'a dokunmadan, downstream map).
 */
export function friendlyApplyRowError(raw: string, sku: string | null): string {
    if (/unique/i.test(raw) || /duplicate key/i.test(raw)) {
        const skuPart = sku && sku.trim().length > 0 ? `: ${sku.trim()}` : "";
        return `Bu SKU zaten kullanımda${skuPart} — farklı bir SKU girin veya eşleşen ürünü seçin.`;
    }
    return raw;
}

/**
 * Yeni ürün adayı satırından minimal `CreateProductInput` üretir. Mevcut
 * `extracted_name`/`extracted_sku` yoksa hata fırlatır (DB NOT NULL).
 * AI attributes Faz 1 dinamik şema slot'una geçer; product_type tekstüel
 * 'manufactured' alanı için Faz 1 default 'manufactured' kullanılır
 * (commercial seçimi UI'dan sonra yapılır).
 */
function buildCreateProductInput(
    line: ImportDocumentLineRow,
    attributes: Record<string, unknown>,
    productTypeId: string | null,
    coreFields: Record<string, string | number>,
): CreateProductInput & { attributes: Record<string, unknown>; product_type_id: string | null } {
    const name = (line.extracted_name ?? "").trim();
    const sku = (line.extracted_sku ?? "").trim();
    if (!name) throw new Error("ad eksik");
    if (!sku) throw new Error("SKU eksik");
    // core_fields.unit varsa onu kullan; yoksa PMT varsayılanı "adet".
    const unit = typeof coreFields.unit === "string" && coreFields.unit.trim().length > 0
        ? String(coreFields.unit).trim()
        : "adet";
    // core_fields'tan unit dışındakileri CreateProductInput'a serp (whitelist
    // + finansal drop + tip normalizeCoreProductFields'te garanti edildi; tüm
    // anahtarlar IMPORT_CORE_PRODUCT_FIELDS = CreateProductInput alt kümesi).
    const { unit: _unit, ...restCore } = coreFields;
    void _unit;
    return {
        ...(restCore as Partial<CreateProductInput>),
        name,
        sku,
        unit,
        product_type_id: productTypeId,
        attributes,
    };
}

/**
 * Faz A — satır için onaylanan core master-data alanlarını döndürür.
 * approval yok → tüm core_fields uygulanır (attributes paterniyle simetrik);
 * approval.coreFields belirtilmişse yalnız listedekiler. Her durumda
 * normalize (whitelist + finansal drop + tip) tekrar uygulanır (defansif).
 */
function pickApprovedCoreFields(
    line: ImportDocumentLineRow,
    options?: ApplyOptions,
): Record<string, string | number> {
    const normalized = normalizeCoreProductFields(line.extracted_core_fields);
    const approval = options?.fieldApprovals?.[line.id];
    if (!approval || approval.coreFields === undefined) {
        return normalized;
    }
    const allowed = new Set(approval.coreFields.filter(f => IMPORT_CORE_PRODUCT_FIELD_KEYS.has(f)));
    return Object.fromEntries(
        Object.entries(normalized).filter(([k]) => allowed.has(k)),
    );
}

const PRODUCT_CORE_FIELDS = new Set(["name", "sku", "product_type_id"]);

function resolveAttachmentKindFromDocument(input: {
    documentType: DocumentType | null | undefined;
    mimeType: string | null | undefined;
}): ProductAttachmentKind {
    if (input.documentType === "product_photo" || input.mimeType?.startsWith("image/")) {
        return "image";
    }
    if (input.documentType === "product_datasheet" || input.documentType === "product_catalog") {
        return "datasheet";
    }
    if (
        input.documentType === "material_certificate"
        || input.documentType === "compliance_doc"
        || input.documentType === "test_report"
    ) {
        return "certificate";
    }
    return "other";
}

async function ensurePrimaryImageIfMissing(input: {
    productId: string;
    attachmentId: string;
    result: ApplyResult;
    lineNumber: number;
}) {
    try {
        const images = await dbListAttachmentsByProduct(input.productId, "image");
        const hasPrimary = images.some(image => image.is_primary_image);
        if (!hasPrimary) {
            await dbSetPrimaryImage(input.productId, input.attachmentId);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        input.result.errors.push(
            `Satır ${input.lineNumber}: ana görsel uyarısı — ${msg}`,
        );
    }
}

/**
 * Faz D — katalog PDF satırından ürün görseli render edip ekler (NON-FATAL).
 * `source_page` olan product satırlarında çağrılır; mupdf ile sayfa (hibrit:
 * güvenli bbox varsa kırpılmış, yoksa tam sayfa) PNG render → kind=image
 * attachment → ilk görselse kapak (primary). Render/attach hatası ürünün
 * master-data yazımını GERİ ALMAZ; yalnız `errors[]`'e uyarı eklenir.
 */
async function attachCatalogImageIfPresent(input: {
    productId: string;
    line: ImportDocumentLineRow;
    docBuffer: Buffer | null;
    mimeType: string;
    actorUserId: string | null;
    result: ApplyResult;
}): Promise<void> {
    const { line, docBuffer, mimeType } = input;
    if (line.source_page == null) return;
    if (mimeType !== "application/pdf") return; // yalnız PDF render edilebilir
    if (!docBuffer) return;

    try {
        const clip = pickRenderClip(line.image_region);
        const png = await renderPdfPageToPng(docBuffer, line.source_page - 1, { clip });
        const attachment = await dbCreateAttachment({
            productId: input.productId,
            file: png,
            fileName: `${line.extracted_sku ?? "urun"}-sayfa${line.source_page}.png`,
            fileSize: png.length,
            mimeType: "image/png",
            kind: "image",
            metadata: {
                source: "catalog_extract",
                page: line.source_page,
                cropped: clip !== null,
            },
            uploadedBy: input.actorUserId,
        });
        input.result.images_extracted += 1;
        await ensurePrimaryImageIfMissing({
            productId: input.productId,
            attachmentId: attachment.id,
            result: input.result,
            lineNumber: line.line_number,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        input.result.errors.push(
            `Satır ${line.line_number}: katalog görseli eklenemedi — ${msg}`,
        );
    }
}

async function validateTechnicalAttributesForApply(
    attributes: Record<string, unknown>,
    productTypeId: string | null,
): Promise<Record<string, unknown>> {
    const keys = Object.keys(attributes);
    if (keys.length === 0) return {};

    if (!productTypeId) {
        throw new Error("teknik özellik var ama teknik şablon seçilmemiş");
    }

    const typeWithFields = await dbGetProductTypeWithFields(productTypeId);
    if (!typeWithFields || typeWithFields.is_active === false) {
        throw new Error("teknik şablon aktif değil veya bulunamadı");
    }

    const allowedKeys = new Set(typeWithFields.fields.map(field => field.field_key));
    const unknownKeys = keys.filter(key => !allowedKeys.has(key));
    if (unknownKeys.length > 0) {
        throw new Error(`teknik şablonda olmayan alanlar: ${unknownKeys.join(", ")}`);
    }

    return attributes;
}

async function auditTechnicalTemplateApply(input: {
    documentId: string;
    line: ImportDocumentLineRow;
    productId: string;
    productTypeId: string | null;
    appliedAttributes: Record<string, unknown>;
    appliedEvidence: Record<string, unknown>;
    actorUserId: string | null;
}) {
    const attributeKeys = Object.keys(input.appliedAttributes);
    if (attributeKeys.length === 0) return;
    try {
        const sb = createServiceClient();
        const { error } = await sb.from("audit_log").insert({
            action: "technical_template_ai_applied",
            entity_type: "product",
            entity_id: input.productId,
            after_state: {
                import_document_id: input.documentId,
                import_document_line_id: input.line.id,
                product_type_id: input.productTypeId,
                attribute_keys: attributeKeys,
                evidence: input.appliedEvidence,
            },
            source: "ui",
            actor: input.actorUserId,
        });
        if (error) console.warn("[import-apply] technical audit insert failed:", error);
    } catch (err) {
        console.warn("[import-apply] technical audit exception:", err);
    }
}

function pickApprovedTechnicalAttributes(
    line: ImportDocumentLineRow,
    options?: ApplyOptions,
): {
    attributes: Record<string, unknown>;
    evidence: Record<string, unknown>;
} {
    const attrs = line.extracted_attributes ?? {};
    const evidence = line.extraction_evidence ?? {};
    const approval = options?.fieldApprovals?.[line.id];
    if (!approval) {
        return { attributes: attrs, evidence };
    }

    const allowed = new Set(approval.technicalAttributeKeys);
    const approvedAttributes = Object.fromEntries(
        Object.entries(attrs).filter(([key]) => allowed.has(key)),
    );
    const approvedEvidence = Object.fromEntries(
        Object.entries(evidence).filter(([key]) => allowed.has(key)),
    );
    return { attributes: approvedAttributes, evidence: approvedEvidence };
}

function approvedProductFieldsForLine(
    line: ImportDocumentLineRow,
    options?: ApplyOptions,
): Set<string> | null {
    const approval = options?.fieldApprovals?.[line.id];
    if (!approval) return null;
    return new Set((approval.productFields ?? []).filter(field => PRODUCT_CORE_FIELDS.has(field)));
}

export async function serviceApplyImportDocument(
    documentId: string,
    actorUserId: string | null,
    options?: ApplyOptions,
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

        // 3. Storage download (dosya ekleme + Faz D katalog görseli için; bir kere yükle)
        let docBuffer: Buffer | null = null;
        const hasAttachmentTarget = eligible.some(l => l.extraction_type === "certificate_target");
        // Faz D — PDF katalog satırlarında source_page varsa görsel render için buffer gerekir.
        const hasCatalogImage = doc.mime_type === "application/pdf"
            && eligible.some(l => l.extraction_type === "product" && l.source_page != null);
        if (hasAttachmentTarget || hasCatalogImage) {
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
                    const approved = pickApprovedTechnicalAttributes(line, options);
                    const approvedProductFields = approvedProductFieldsForLine(line, options);
                    const approvedCoreFields = pickApprovedCoreFields(line, options);
                    if (line.match_action === "new_product") {
                        const productTypeApproved = approvedProductFields === null
                            ? true
                            : approvedProductFields.has("product_type_id");
                        const createProductTypeId = productTypeApproved ? line.product_type_id : null;
                        const createAttributes = productTypeApproved ? approved.attributes : {};
                        const input = buildCreateProductInput(line, createAttributes, createProductTypeId, approvedCoreFields);
                        input.attributes = await validateTechnicalAttributesForApply(input.attributes, input.product_type_id);
                        const created = await dbCreateProduct(input);
                        await auditTechnicalTemplateApply({
                            documentId,
                            line,
                            productId: created.id,
                            productTypeId: input.product_type_id,
                            appliedAttributes: input.attributes,
                            appliedEvidence: approved.evidence,
                            actorUserId,
                        });
                        result.products_created += 1;
                        result.technical_fields_applied += Object.keys(input.attributes).length;
                        if (!input.product_type_id) result.untyped_products += 1;
                        // Faz D — katalog PDF'inden ürün görseli render edip ekle (non-fatal).
                        await attachCatalogImageIfPresent({
                            productId: created.id,
                            line,
                            docBuffer,
                            mimeType: doc.mime_type,
                            actorUserId,
                            result,
                        });
                    } else {
                        // matched | reviewed
                        if (!line.matched_product_id) {
                            throw new Error("eşleşen ürün ID'si yok");
                        }
                        const current = await dbGetProductById(line.matched_product_id);
                        if (!current) {
                            throw new Error("eşleşen ürün bulunamadı");
                        }
                        // Faz D — katalog görselini eşleşen ürüne ekle (master-data
                        // no-op olsa bile; non-fatal). source_page yoksa erken döner.
                        const imagesBefore = result.images_extracted;
                        await attachCatalogImageIfPresent({
                            productId: line.matched_product_id,
                            line,
                            docBuffer,
                            mimeType: doc.mime_type,
                            actorUserId,
                            result,
                        });
                        const imageAdded = result.images_extracted > imagesBefore;
                        const productTypeApproved = approvedProductFields === null
                            ? true
                            : approvedProductFields.has("product_type_id");
                        const effectiveProductTypeId = current.product_type_id
                            ?? (productTypeApproved ? line.product_type_id : null);
                        const safeLineAttributes = await validateTechnicalAttributesForApply(
                            effectiveProductTypeId ? approved.attributes : {},
                            effectiveProductTypeId,
                        );
                        // Faz C — attributes FILL-EMPTY (kullanıcı kararıyla
                        // tutarlı, advisor): null/undefined/"" gelen değerler
                        // mevcut veriyi silmez VE mevcut DOLU attribute üzerine
                        // YAZILMAZ (önceki davranış {...current,...new} eziyordu;
                        // review mevcut değeri göstermediğinden curated dn=99'u
                        // dn=50 ile sessiz ezmeyi engeller). Yalnız mevcutta boş
                        // olan teknik alanlar doldurulur.
                        const currentAttrsForMerge = (current.attributes ?? {}) as Record<string, unknown>;
                        const nonEmptyLineAttributes = Object.fromEntries(
                            Object.entries(safeLineAttributes).filter(([k, v]) => {
                                if (v === null || v === undefined || v === "") return false;
                                const cur = currentAttrsForMerge[k];
                                return cur === null || cur === undefined || cur === "";
                            }),
                        );
                        const productPatch: Record<string, unknown> = {};
                        if (
                            approvedProductFields?.has("name")
                            && typeof line.extracted_name === "string"
                            && line.extracted_name.trim().length > 0
                            && line.extracted_name.trim() !== current.name
                        ) {
                            productPatch.name = line.extracted_name.trim();
                        }
                        if (
                            approvedProductFields?.has("sku")
                            && typeof line.extracted_sku === "string"
                            && line.extracted_sku.trim().length > 0
                            && line.extracted_sku.trim() !== current.sku
                        ) {
                            productPatch.sku = line.extracted_sku.trim();
                        }
                        const shouldSetProductType = productTypeApproved
                            && !current.product_type_id
                            && Boolean(effectiveProductTypeId);
                        if (shouldSetProductType) {
                            productPatch.product_type_id = effectiveProductTypeId;
                        }
                        // Faz A — core master-data alanları (kategori, malzeme,
                        // standart, birim, para birimi vb.). Kullanıcı kararı:
                        // eşleşen üründe YALNIZ BOŞ alanları doldur (mevcut/elle
                        // düzeltilmiş değerleri EZME). normalizeCoreProductFields
                        // zaten boş/null/finansal değerleri drop etti; burada da
                        // mevcut ürün değeri doluysa atla → birim/para birimi gibi
                        // kritik alanlar yanlış katalogdan sessizce bozulmaz.
                        const currentRecord = current as unknown as Record<string, unknown>;
                        for (const [k, v] of Object.entries(approvedCoreFields)) {
                            const existing = currentRecord[k];
                            const isEmpty = existing === null || existing === undefined || existing === "";
                            if (isEmpty) productPatch[k] = v;
                        }
                        // Uygulanacak gerçek bir şey yoksa (boş/null attr + boş patch)
                        // satırı atla — gereksiz no-op update + yanıltıcı sayaç önlenir.
                        if (Object.keys(nonEmptyLineAttributes).length === 0 && Object.keys(productPatch).length === 0) {
                            // Görsel eklendiyse satır "atlandı" sayılmaz (Faz D).
                            if (!imageAdded) result.skipped += 1;
                            continue;
                        }
                        const mergedAttributes = {
                            ...currentAttrsForMerge,
                            ...nonEmptyLineAttributes,
                        };
                        await dbUpdateProduct(line.matched_product_id, {
                            ...productPatch,
                            ...(Object.keys(nonEmptyLineAttributes).length > 0 ? { attributes: mergedAttributes } : {}),
                        });
                        await auditTechnicalTemplateApply({
                            documentId,
                            line,
                            productId: line.matched_product_id,
                            productTypeId: effectiveProductTypeId,
                            appliedAttributes: nonEmptyLineAttributes,
                            appliedEvidence: approved.evidence,
                            actorUserId,
                        });
                        result.products_updated += 1;
                        result.technical_fields_applied += Object.keys(nonEmptyLineAttributes).length;
                    }
                } else if (line.extraction_type === "certificate_target") {
                    if (line.match_action === "new_product") {
                        throw new Error(
                            "Dosya eki için 'yeni ürün' apply edilemez; önce ürünü yarat veya eki atla",
                        );
                    }
                    if (!line.matched_product_id) {
                        throw new Error("dosya eki için hedef ürün seçilmemiş");
                    }
                    if (!docBuffer) {
                        throw new Error("belge buffer'ı yüklenemedi");
                    }
                    const attachmentKind = resolveAttachmentKindFromDocument({
                        documentType: doc.classification?.document_type,
                        mimeType: doc.mime_type,
                    });
                    const newAttachment = await dbCreateAttachment({
                        productId: line.matched_product_id,
                        file: docBuffer,
                        fileName: doc.file_name,
                        fileSize: doc.file_size,
                        mimeType: doc.mime_type,
                        kind: attachmentKind,
                        uploadedBy: actorUserId,
                    });
                    result.attachments_created += 1;

                    if (attachmentKind === "image") {
                        await ensurePrimaryImageIfMissing({
                            productId: line.matched_product_id,
                            attachmentId: newAttachment.id,
                            result,
                            lineNumber: line.line_number,
                        });
                    }

                    if (attachmentKind === "certificate") {
                        // Faz 3c Review P2-1: aynı (product_id, file_name) eski aktif
                        // sertifikaları yeni cert'e supersede et. Versiyonlama fail
                        // ederse yeni cert geri alınmaz (zaten aktif); warning logla.
                        try {
                            const superseded = await dbSupersedeCertificatesByName(
                                line.matched_product_id,
                                doc.file_name,
                                newAttachment.id,
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
                }
            } catch (err) {
                const raw = err instanceof Error ? err.message : String(err);
                const msg = friendlyApplyRowError(raw, line.extracted_sku);
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
            } catch (firstErr) {
                // O2 (2026-06): tek retry — geçici ağ/timeout hatasında doc
                // 'applying'de kilitli kalıp admin SQL'i gerektirmesin.
                console.warn("[import-apply] status update 1. deneme başarısız, yeniden deneniyor:", firstErr);
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
                technical_fields_applied: result.technical_fields_applied,
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
