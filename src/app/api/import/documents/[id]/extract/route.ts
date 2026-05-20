/**
 * Faz 3b — POST /api/import/documents/[id]/extract
 *
 * Classified bir import_documents satırı için AI ekstraksiyonu çalıştırır:
 *   - product_catalog / product_datasheet → aiExtractProductsFromDocument
 *   - material_certificate / compliance_doc / test_report → aiExtractCertificateTarget
 *   - migration_excel → 400 "Klasik Mod kullanın"
 *   - diğer (msds/vendor_profile/product_photo/unknown) → 400 "Bu tip için ekstraksiyon yok"
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
} from "@/lib/supabase/import-document-lines";
import {
    aiExtractProductsFromDocument,
    aiExtractCertificateTarget,
} from "@/lib/services/ai-service";
import { findProductMatchCandidates, decideMatchAction } from "@/lib/services/product-matcher";
import { dbGetProductTypeWithFields } from "@/lib/supabase/product-types";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";
import { createClient } from "@/lib/supabase/server";
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

        if (docType === "migration_excel") {
            return NextResponse.json({ error: "Migration Excel için Klasik Mod kullanın." }, { status: 400 });
        }

        const isProductFlow = PRODUCT_EXTRACT_TYPES.has(docType);
        const isCertFlow = CERT_EXTRACT_TYPES.has(docType);

        if (!isProductFlow && !isCertFlow) {
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

        const linesToCreate: CreateExtractedLineInput[] = [];

        if (isProductFlow) {
            // Product type context — body override → classification suggestion → null (free-form)
            const productTypeId = bodyProductTypeId ?? doc.classification?.suggested_product_type_id ?? null;
            const productTypeContext = productTypeId
                ? await dbGetProductTypeWithFields(productTypeId).catch(() => null)
                : null;

            let result;
            try {
                result = await aiExtractProductsFromDocument(
                    {
                        buffer,
                        mimeType: doc.mime_type,
                        fileName: doc.file_name,
                        excelTextSample,
                        productTypeContext: productTypeContext
                            ? {
                                id: productTypeContext.id,
                                name: productTypeContext.name,
                                fields: productTypeContext.fields.map(f => ({
                                    field_key: f.field_key,
                                    label_tr: f.label_tr,
                                    field_type: f.field_type,
                                    unit: f.unit,
                                    options: f.options,
                                })),
                            }
                            : null,
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

            // Her item için top-3 match
            for (const item of result.items) {
                const candidates = await findProductMatchCandidates({
                    name: item.name,
                    sku: item.sku,
                    attributes: item.attributes,
                }, 3);
                const top = candidates[0] ?? null;
                const initialAction: ImportDocumentLineMatchAction = top
                    ? decideMatchAction(top.score)
                    : "new_product";
                linesToCreate.push({
                    line_number: item.line,
                    extraction_type: "product",
                    extracted_name: item.name,
                    extracted_sku: item.sku,
                    extracted_attributes: item.attributes,
                    candidate_matches: candidates,
                    matched_product_id: initialAction === "matched" ? top!.id : null,
                    match_confidence: top?.score ?? null,
                    match_action: initialAction,
                });
            }
        } else if (isCertFlow) {
            let target;
            try {
                target = await aiExtractCertificateTarget(
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

            const candidates: ImportDocumentLineCandidate[] = await findProductMatchCandidates({
                name: target.target_name,
                sku: target.target_sku,
            }, 3);
            const top = candidates[0] ?? null;
            const initialAction: ImportDocumentLineMatchAction = top
                ? decideMatchAction(top.score)
                : "new_product";
            linesToCreate.push({
                line_number: 1,
                extraction_type: "certificate_target",
                extracted_name: target.target_name,
                extracted_sku: target.target_sku,
                extracted_attributes: {},
                candidate_matches: candidates,
                matched_product_id: initialAction === "matched" ? top!.id : null,
                match_confidence: top?.score ?? null,
                match_action: initialAction,
            });
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
