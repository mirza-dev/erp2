import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/role-guard";
import { dbGetBatch, dbUpdateBatchStatus, dbCreateDrafts, dbDeletePendingDrafts } from "@/lib/supabase/import";
import { dbSaveColumnMappings, normalizeColumnName } from "@/lib/supabase/column-mappings";
import { NUMERIC_FIELDS, IMPORT_FIELD_SET } from "@/lib/import-fields";
import { safeParseJson } from "@/lib/api-error";
import {
    DEFAULT_AI_IMPORT_OPERATION,
    getAiImportOperation,
    isAiImportOperationType,
    type AiImportOperationType,
} from "@/lib/ai-import-operations";
import {
    defaultFieldApprovals,
    riskFlagsForFields,
    suggestSkuFromName,
    PRODUCT_TYPE_TEMPLATE_COLUMN,
    type ImportMatchStatus,
} from "@/lib/import-center";
import { dbListProductTypes, dbGetProductTypeWithFields } from "@/lib/supabase/product-types";

function parseTRNumber(raw: string): number | null {
    const s = raw.toString().trim();
    // TR format: 1.234,56 → strip thousands dots, replace decimal comma
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
        const n = Number(s.replace(/\./g, "").replace(",", "."));
        return isNaN(n) ? null : n;
    }
    // EN format or simple comma-decimal: 1234.56 or 1234,56
    const n = Number(s.replace(",", "."));
    return isNaN(n) ? null : n;
}

function coerceValue(field: string, raw: string): unknown {
    if (raw === undefined || raw === null || raw === "") return undefined;
    if (NUMERIC_FIELDS.has(field)) {
        const num = parseTRNumber(raw);
        if (num !== null) return num;
    }
    return raw;
}

function inferOperationForSheet(input: {
    sheetName: string;
    entityType: string;
    fallback: AiImportOperationType;
}): AiImportOperationType {
    const normalized = input.sheetName
        .toLocaleLowerCase("tr-TR")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ı/g, "i");
    if (input.entityType === "stock") {
        if (/(sayim|sayimi|count)/.test(normalized)) return "stock_count";
        if (/(hareket|movement|giris|cikis|transfer)/.test(normalized)) return "stock_movement";
    }
    if (input.entityType === "product" && /(tedarikci|vendor|supplier)/.test(normalized)) {
        return "vendor_product_relation";
    }
    return input.fallback;
}

/**
 * POST /api/import/[batchId]/apply-mappings
 * Deterministically transforms rows using confirmed column mappings.
 * No AI involved — user has already confirmed the mapping.
 *
 * Body: {
 *   sheets: [{
 *     sheet_name: string,
 *     entity_type: string,
 *     mappings: [{ source_column: string, target_field: string }],
 *     rows: Record<string, string>[],
 *     remember: boolean
 *   }]
 * }
 * Response: { drafts: DraftRow[] }
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ batchId: string }> }
) {
    try {
        const { batchId } = await params;

        const guard = await requirePermission(req, "manage_import");
        if (guard) return guard;
        const batch = await dbGetBatch(batchId);
        if (!batch) {
            return NextResponse.json({ error: "Batch bulunamadı." }, { status: 404 });
        }

        const safeParsed = await safeParseJson(req);
        if (!safeParsed.ok) return safeParsed.response;
        const body = safeParsed.data as {
            sheets: Array<{
                sheet_name: string;
                entity_type: string;
                mappings: Array<{ source_column: string; target_field: string }>;
                rows: Array<Record<string, string>>;
                remember: boolean;
            }>;
            operation_type?: unknown;
        };

        if (!body.sheets || body.sheets.length === 0) {
            return NextResponse.json({ error: "En az bir sheet gerekli." }, { status: 400 });
        }
        const operationType: AiImportOperationType = isAiImportOperationType(body.operation_type)
            ? body.operation_type
            : DEFAULT_AI_IMPORT_OPERATION;
        const operation = getAiImportOperation(operationType);
        if (isAiImportOperationType(body.operation_type) && operation.status !== "active") {
            return NextResponse.json({ error: "Bu AI Import işlem türü henüz aktif değil." }, { status: 400 });
        }

        // Fix: delete existing pending drafts before re-creating — prevents duplication on back navigation
        await dbDeletePendingDrafts(batchId);
        await dbUpdateBatchStatus(batchId, "processing");

        const allDrafts = [];
        // Accumulate mapping metadata across sheets — used by serviceConfirmBatch to
        // increment success_count only after a successful import, not here.
        const columnMappingMeta: Array<{ entity_type: string; normalized_columns: string[] }> = [];

        // Faz B — tip-özel şablon teknik kolonları (field_key) IMPORT_FIELD_SET'te
        // yok → normal mapping'de düşerdi. Aktif tüm ürün tiplerinin field_key
        // union'ı + tip kolonu (urun_tipi/product_type) product satırlarında
        // HAM passthrough edilir; confirm tipi çözüp collectTypeAttributesFromRow
        // ile ayıklar (yabancı/boş değerler zaten orada drop edilir).
        const productPassthroughKeys = new Set<string>([PRODUCT_TYPE_TEMPLATE_COLUMN, "product_type"]);
        if (body.sheets.some(s => s.entity_type === "product")) {
            try {
                const types = await dbListProductTypes();
                for (const t of types) {
                    const wf = await dbGetProductTypeWithFields(t.id);
                    for (const f of wf?.fields ?? []) productPassthroughKeys.add(f.field_key);
                }
            } catch (err) {
                console.warn("[apply-mappings] ürün tipi alanları yüklenemedi (teknik passthrough atlanır):", err);
            }
        }

        for (const sheet of body.sheets) {
            const { entity_type, mappings, rows, remember } = sheet;
            const sheetOperationType = inferOperationForSheet({
                sheetName: sheet.sheet_name,
                entityType: entity_type,
                fallback: operationType,
            });
            const allowedFields = IMPORT_FIELD_SET[entity_type];
            if (!allowedFields) {
                return NextResponse.json(
                    { error: `Geçersiz entity tipi: ${entity_type}` },
                    { status: 400 },
                );
            }

            // Active (non-skip) mappings — filtered against known fields for this entity type
            const activeMappings = mappings
                .filter(m => m.target_field && m.target_field !== "skip")
                .filter(m => {
                    return allowedFields.has(m.target_field);
                });
            const activeNormalized = activeMappings.map(m => normalizeColumnName(m.source_column));

            // Save mappings to memory if user opted in
            if (remember) {
                const toSave = activeMappings.map(m => ({
                    source_column: m.source_column,
                    entity_type,
                    target_field: m.target_field,
                }));
                await dbSaveColumnMappings(toSave);
            }

            if (activeNormalized.length > 0) {
                columnMappingMeta.push({ entity_type, normalized_columns: activeNormalized });
            }

            const draftInputs = rows.map((row, rowIndex) => {
                const parsed_data: Record<string, unknown> = {};
                for (const { source_column, target_field } of activeMappings) {
                    const rawVal = row[source_column];
                    if (rawVal !== undefined && rawVal !== "") {
                        const coerced = coerceValue(target_field, rawVal);
                        if (coerced !== undefined) {
                            parsed_data[target_field] = coerced;
                        }
                    }
                }
                // Faz B — tip-özel teknik kolon passthrough (yalnız product).
                // Şablon başlığı = field_key olduğundan ham satırdan doğrudan
                // taşınır; mapping gerektirmez. confirm tipe göre ayıklar.
                if (entity_type === "product") {
                    for (const key of productPassthroughKeys) {
                        if (key in parsed_data) continue; // mapped alan önceliklidir
                        const rawVal = row[key];
                        if (rawVal !== undefined && rawVal !== null && rawVal !== "") {
                            parsed_data[key] = rawVal; // ham; confirm normalize eder
                        }
                    }
                }
                const rowErrors: string[] = [];
                let matchStatus: ImportMatchStatus = "new";
                if (entity_type === "product" && !parsed_data.sku && typeof parsed_data.name === "string") {
                    parsed_data.sku = suggestSkuFromName(parsed_data.name, rowIndex + 1);
                    rowErrors.push("SKU dosyada yoktu; sistem önerisi oluşturuldu, lütfen önizlemede doğrulayın.");
                }
                if (entity_type === "product" && (!parsed_data.sku || !parsed_data.name || !parsed_data.unit)) {
                    matchStatus = "blocked";
                    if (!parsed_data.sku) rowErrors.push("SKU zorunludur.");
                    if (!parsed_data.name) rowErrors.push("Ürün adı zorunludur.");
                    if (!parsed_data.unit) rowErrors.push("Birim zorunludur.");
                }
                if (entity_type === "customer" && !parsed_data.email && !parsed_data.customer_code) {
                    rowErrors.push("E-posta veya müşteri kodu yok; isim benzerliği otomatik güncelleme sayılmaz.");
                }
                if (entity_type === "vendor" && !parsed_data.contact_email && !parsed_data.tax_number) {
                    rowErrors.push("E-posta veya vergi no yok; isim benzerliği otomatik güncelleme sayılmaz.");
                }
                if (entity_type === "stock" && !parsed_data.sku) {
                    matchStatus = "blocked";
                    rowErrors.push("Stok işlemi için SKU zorunludur.");
                }
                const riskFlags = [
                    ...riskFlagsForFields(parsed_data),
                    ...(rowErrors.length > 0 ? ["review:required"] : []),
                ];
                const fieldApprovals = defaultFieldApprovals(parsed_data);
                return {
                    batch_id: batchId,
                    entity_type: entity_type as "customer" | "product" | "vendor" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment",
                    raw_data: row as Record<string, unknown>,
                    parsed_data: {
                        ...parsed_data,
                        __ai_import_operation: sheetOperationType,
                    },
                    confidence: 1.0,   // user confirmed the mapping
                    ai_reason: "Kullanıcı kolon eşleştirmesini onayladı",
                    unmatched_fields: [] as unknown[],
                    sheet_name: sheet.sheet_name,
                    row_number: rowIndex + 2,
                    match_status: matchStatus,
                    match_confidence: 1.0,
                    risk_flags: riskFlags,
                    field_approvals: fieldApprovals,
                    row_errors: rowErrors,
                };
            });

            const created = await dbCreateDrafts(draftInputs);
            allDrafts.push(...created);
        }

        const avgConfidence = allDrafts.length > 0
            ? allDrafts.reduce((sum, d) => sum + (d.confidence ?? 0), 0) / allDrafts.length
            : 1.0;
        // Store mapping metadata so serviceConfirmBatch can increment success_count
        // only after a successful import, not at draft-creation time.
        await dbUpdateBatchStatus(batchId, "review", { column_mapping_meta: columnMappingMeta }, avgConfidence);

        return NextResponse.json({ drafts: allDrafts }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/import/[batchId]/apply-mappings]", err);
        const detail = err instanceof Error ? err.message : "Bilinmeyen hata";
        return NextResponse.json(
            { error: `Eşleştirme uygulanamadı: ${detail}` },
            { status: 500 }
        );
    }
}
