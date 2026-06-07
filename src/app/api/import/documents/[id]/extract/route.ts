/**
 * Faz 3b — POST /api/import/documents/[id]/extract
 *
 * Classified bir import_documents satırı için AI ekstraksiyonu çalıştırır:
 *   - product_catalog / product_datasheet → aiExtractProductsFromDocument
 *   - material_certificate / compliance_doc / test_report → aiExtractCertificateTarget
 *   - product_photo veya operation=product_documents + katalog/datasheet → aiExtractProductDocumentTarget
 *   - migration_excel → 400 "Excel/CSV ile Toplu Aktarım bölümünü kullanın"
 *   - diğer (msds/vendor_profile/unknown) → 400 "Bu tip için ekstraksiyon yok"
 *
 * Her item için product-matcher top-3 candidate üretir; auto-link skoru ≥85
 * varsa matched_product_id + match_action='matched', 60-84 'pending', <60
 * 'new_product'. Storage'dan dosya yeniden download edilir.
 *
 * Re-extract: mevcut satırlar varsa dbReplaceLinesForDocument ile temizlenir.
 * Auth: requireRole(["admin","purchaser"]) — AI maliyeti var.
 * Hard cancel: req.signal.aborted → 499 (Faz 3a 3.c/3.d/3.e paterni).
 */
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceClient } from "@/lib/supabase/service";
import { dbGetImportDocument } from "@/lib/supabase/import-documents";
import {
    dbReplaceLinesForDocument,
    type CreateExtractedLineInput,
    dbListLinesByDocument,
} from "@/lib/supabase/import-document-lines";
import {
    aiExtractProductsFromDocument,
    aiExtractCertificateTarget,
    aiExtractProductDocumentTarget,
} from "@/lib/services/ai-service";
import {
    findProductMatchCandidates,
    decideMatchAction,
    loadActiveMatchables,
    type MatchableProduct,
} from "@/lib/services/product-matcher";
import { dbGetProductTypeWithFields, dbListProductTypes } from "@/lib/supabase/product-types";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";
import {
    DEFAULT_AI_IMPORT_OPERATION,
    isAiImportOperationType,
    type AiImportOperationType,
} from "@/lib/ai-import-operations";
import type {
    DocumentType,
    ImportDocumentLineCandidate,
    ImportDocumentLineMatchAction,
} from "@/lib/database.types";

export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "product-files";

const EXCEL_MIMES = new Set([
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel",
]);

const PRODUCT_EXTRACT_TYPES = new Set<DocumentType>([
    "product_catalog",
    "product_datasheet",
]);

const CERT_EXTRACT_TYPES = new Set<DocumentType>([
    "material_certificate",
    "compliance_doc",
    "test_report",
]);

const PRODUCT_DOCUMENT_TARGET_TYPES = new Set<DocumentType>([
    "product_photo",
]);

function extractExcelTextSample(buffer: Buffer, maxChars = 4000): string {
    try {
        const wb = XLSX.read(buffer, { type: "buffer" });
        const out: string[] = [];
        for (const sheetName of wb.SheetNames.slice(0, 3)) {
            const sheet = wb.Sheets[sheetName];
            if (!sheet) continue;
            const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false }).slice(0, 1500);
            out.push(`[Sheet: ${sheetName}]\n${csv}`);
            if (out.join("\n\n").length > maxChars) break;
        }
        return out.join("\n\n").slice(0, maxChars);
    } catch {
        return "";
    }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id } = await ctx.params;
        if (!id) return NextResponse.json({ error: "Belge ID zorunludur." }, { status: 400 });

        const doc = await dbGetImportDocument(id);
        if (!doc) return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });

        if (doc.status !== "classified") {
            return NextResponse.json({ error: "Belge önce sınıflandırılmalı." }, { status: 400 });
        }

        const docType: DocumentType = doc.classification?.document_type ?? "unknown";
        const operationType: AiImportOperationType = isAiImportOperationType(doc.classification?.operation_type)
            ? doc.classification.operation_type
            : DEFAULT_AI_IMPORT_OPERATION;

        if (docType === "migration_excel") {
            return NextResponse.json({ error: "Migration Excel için Excel/CSV ile Toplu Aktarım bölümünü kullanın." }, { status: 400 });
        }

        const isProductDocumentTargetFlow =
            PRODUCT_DOCUMENT_TARGET_TYPES.has(docType)
            || (
                operationType === "product_documents"
                && PRODUCT_EXTRACT_TYPES.has(docType)
            );
        const isProductFlow = PRODUCT_EXTRACT_TYPES.has(docType) && !isProductDocumentTargetFlow;
        const isCertFlow = CERT_EXTRACT_TYPES.has(docType);
        const isAttachmentTargetFlow = isCertFlow || isProductDocumentTargetFlow;

        if (!isProductFlow && !isAttachmentTargetFlow) {
            return NextResponse.json({ error: "Bu belge tipi için ekstraksiyon desteklenmiyor." }, { status: 400 });
        }

        // Body — opsiyonel productTypeId override (datasheet için kullanıcı seçebilir)
        let bodyProductTypeId: string | null = null;
        try {
            const body = await req.json().catch(() => ({}));
            if (typeof body?.productTypeId === "string" && body.productTypeId.length > 0) {
                bodyProductTypeId = body.productTypeId;
            }
        } catch { /* boş body OK */ }

        // Review 3b 4.tur P3: Body productTypeId early validation — kullanıcının
        // bilinçli girdisi storage download + matcher cache yüklemeden ÖNCE
        // doğrulanır. Stale/tampered id için gereksiz I/O atlanır.
        //
        // Review 3b 5.tur P2: Validation SADECE product-flow için anlamlı —
        // sertifika/uygunluk/test_report flow'u product_type_id kullanmıyor
        // (hedef ürün matched üzerinden 3c'de belirlenir). UI bug'ı veya stale
        // classification suggestion cert-flow'u kırmasın → cert-flow'da
        // bodyProductTypeId silently ignored.
        let resolvedBodyType: Awaited<ReturnType<typeof dbGetProductTypeWithFields>> | null = null;
        if (bodyProductTypeId && isProductFlow) {
            resolvedBodyType = await dbGetProductTypeWithFields(bodyProductTypeId).catch(() => null);
            if (!resolvedBodyType) {
                return NextResponse.json(
                    { error: "Belirtilen ürün tipi bulunamadı." },
                    { status: 400 },
                );
            }
        }

        // Pre-AI hard cancel
        if (req.signal.aborted) return new NextResponse(null, { status: 499 });

        // Storage'dan dosyayı yeniden download et
        const sb = createServiceClient();
        const { data: blob, error: dlErr } = await sb.storage.from(STORAGE_BUCKET).download(doc.file_path);
        if (dlErr || !blob) {
            return NextResponse.json({ error: "Belge dosyası okunamadı." }, { status: 500 });
        }
        const buffer = Buffer.from(await blob.arrayBuffer());
        const excelTextSample = EXCEL_MIMES.has(doc.mime_type) ? extractExcelTextSample(buffer) : undefined;

        if (req.signal.aborted) return new NextResponse(null, { status: 499 });

        // Review 3b P2/P3-D: matching loop ÖNCESİ tek seferlik fetch.
        // N satır × N fetch → N satır × 1 fetch.
        const productsCache: MatchableProduct[] = await loadActiveMatchables();

        const linesToCreate: CreateExtractedLineInput[] = [];

        if (isProductFlow) {
            // Review 3b 3.tur: Multi-type extraction — PMT multi-product-type firma.
            // Tüm aktif tipleri AI context'ine ver; AI item başına en uygun
            // product_type_id'yi seçer (whitelisted). Body productTypeId
            // verildiyse availableProductTypes tek tipe filtrelenir
            // ("sadece bu tip katalogu" semantiği — resolvedBodyType erken
            // doğrulamada zaten yüklendi, tekrar fetch yok).
            let availableProductTypes: Array<{
                id: string; name: string;
                fields: Array<{ field_key: string; label_tr: string; field_type: string; unit: string | null; options: string[] | null }>;
            }> = [];

            if (resolvedBodyType) {
                availableProductTypes = [{
                    id: resolvedBodyType.id, name: resolvedBodyType.name,
                    fields: resolvedBodyType.fields.map(f => ({
                        field_key: f.field_key, label_tr: f.label_tr,
                        field_type: f.field_type, unit: f.unit, options: f.options,
                    })),
                }];
            } else {
                const types = await dbListProductTypes();
                const withFields = await Promise.all(
                    types.map(t => dbGetProductTypeWithFields(t.id).catch(() => null)),
                );
                availableProductTypes = withFields
                    .filter((t): t is NonNullable<typeof t> => t !== null)
                    .map(t => ({
                        id: t.id, name: t.name,
                        fields: t.fields.map(f => ({
                            field_key: f.field_key, label_tr: f.label_tr,
                            field_type: f.field_type, unit: f.unit, options: f.options,
                        })),
                    }));
            }

            let result;
            try {
                result = await aiExtractProductsFromDocument(
                    {
                        buffer,
                        mimeType: doc.mime_type,
                        fileName: doc.file_name,
                        excelTextSample,
                        availableProductTypes,
                        operationType,
                        multiRow: docType === "product_catalog",
                    },
                    req.signal,
                );
            } catch (err) {
                if (req.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
                    return new NextResponse(null, { status: 499 });
                }
                throw err;
            }

            // Her item için top-3 match (productsCache reuse).
            // product_type_id: AI'dan (uniform inject KALDIRILDI — multi-type
            // karışık katalog desteği için her satır kendi tipinde olur).
            for (const item of result.items) {
                const candidates = await findProductMatchCandidates({
                    name: item.name,
                    sku: item.sku,
                    product_type_id: item.product_type_id,
                    attributes: item.attributes,
                }, 3, productsCache);
                const top = candidates[0] ?? null;
                const initialAction: ImportDocumentLineMatchAction = top
                    ? decideMatchAction(top.score)
                    : "new_product";
                linesToCreate.push({
                    line_number: item.line,
                    extraction_type: "product",
                    product_type_id: item.product_type_id,
                    extracted_name: item.name,
                    extracted_sku: item.sku,
                    extracted_attributes: item.attributes,
                    extracted_core_fields: item.core_fields,
                    extraction_evidence: item.extraction_evidence,
                    candidate_matches: candidates,
                    matched_product_id: initialAction === "matched" ? top!.id : null,
                    match_confidence: top?.score ?? null,
                    match_action: initialAction,
                });
            }
        } else if (isAttachmentTargetFlow) {
            let target;
            try {
                const targetExtractor = isCertFlow ? aiExtractCertificateTarget : aiExtractProductDocumentTarget;
                target = await targetExtractor(
                    {
                        buffer,
                        mimeType: doc.mime_type,
                        fileName: doc.file_name,
                        excelTextSample,
                    },
                    req.signal,
                );
            } catch (err) {
                if (req.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
                    return new NextResponse(null, { status: 499 });
                }
                throw err;
            }

            // Review 3b P2-C: target AI hiçbir ipucu çıkaramadıysa (name+sku null
            // ve confidence 0) satır yaratma — re-extract sessizce silme
            // tehlikesini önlemek için 422 guard'a düşer.
            const hasTargetSignal = target.target_name !== null || target.target_sku !== null || target.confidence > 0;
            if (hasTargetSignal) {
                const candidates: ImportDocumentLineCandidate[] = await findProductMatchCandidates({
                    name: target.target_name,
                    sku: target.target_sku,
                }, 3, productsCache);
                const top = candidates[0] ?? null;
                const initialAction: ImportDocumentLineMatchAction = top
                    ? decideMatchAction(top.score)
                    : "new_product";
                linesToCreate.push({
                    line_number: 1,
                    extraction_type: "certificate_target",
                    product_type_id: null, // dosya eki hedef ürün üzerinden 3c'de belirlenir
                    extracted_name: target.target_name,
                    extracted_sku: target.target_sku,
                    extracted_attributes: {},
                    extraction_evidence: {},
                    candidate_matches: candidates,
                    matched_product_id: initialAction === "matched" ? top!.id : null,
                    match_confidence: top?.score ?? null,
                    match_action: initialAction,
                });
            }
        }

        // Review 3b P2-C: AI boş döndüyse ve mevcut satırlar varsa
        // re-extract eski satırları silmesin → 422.
        if (linesToCreate.length === 0) {
            const existing = await dbListLinesByDocument(id);
            if (existing.length > 0) {
                return NextResponse.json(
                    { error: "AI hiçbir satır çıkaramadı. Mevcut satırlar korundu." },
                    { status: 422 },
                );
            }
            // İlk extraction + boş — normal akış (boş array yazılır)
        }

        // Pre-write hard cancel
        if (req.signal.aborted) return new NextResponse(null, { status: 499 });

        // Auth user (audit için)
        const sbClient = await createClient();
        const { data: { user } } = await sbClient.auth.getUser();
        void user; // reviewed_by extract'ta set edilmez; PATCH'te set edilir

        if (req.signal.aborted) return new NextResponse(null, { status: 499 });

        const lines = await dbReplaceLinesForDocument(id, linesToCreate);

        return NextResponse.json({ ok: true, lines }, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/import/documents/[id]/extract");
    }
}
