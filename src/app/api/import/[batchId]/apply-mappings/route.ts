import { NextRequest, NextResponse } from "next/server";
import { dbGetBatch, dbUpdateBatchStatus, dbCreateDrafts, dbDeletePendingDrafts } from "@/lib/supabase/import";
import { dbSaveColumnMappings, dbIncrementMappingSuccess } from "@/lib/supabase/column-mappings";

const NUMERIC_FIELDS = new Set([
    "price", "grand_total", "min_stock_level", "on_hand", "cost_price", "weight_kg",
    "payment_terms_days", "total_amount", "net_weight_kg", "gross_weight_kg", "amount",
    "validity_days", "quantity", "unit_price", "line_total", "lead_time_days", "reorder_qty",
]);

function coerceValue(field: string, raw: string): unknown {
    if (raw === undefined || raw === null || raw === "") return undefined;
    if (NUMERIC_FIELDS.has(field)) {
        const num = Number(raw.toString().replace(",", "."));
        if (!isNaN(num)) return num;
    }
    return raw;
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
        const batch = await dbGetBatch(batchId);
        if (!batch) {
            return NextResponse.json({ error: "Batch bulunamadı." }, { status: 404 });
        }

        const body = await req.json() as {
            sheets: Array<{
                sheet_name: string;
                entity_type: string;
                mappings: Array<{ source_column: string; target_field: string }>;
                rows: Array<Record<string, string>>;
                remember: boolean;
            }>;
        };

        if (!body.sheets || body.sheets.length === 0) {
            return NextResponse.json({ error: "En az bir sheet gerekli." }, { status: 400 });
        }

        // Fix: delete existing pending drafts before re-creating — prevents duplication on back navigation
        await dbDeletePendingDrafts(batchId);
        await dbUpdateBatchStatus(batchId, "processing");

        const allDrafts = [];

        for (const sheet of body.sheets) {
            const { entity_type, mappings, rows, remember } = sheet;

            // Active (non-skip) mappings
            const activeMappings = mappings.filter(m => m.target_field && m.target_field !== "skip");
            const activeNormalized = activeMappings.map(m =>
                m.source_column.trim().toLowerCase().replace(/[^a-z0-9]/g, "_")
            );

            // Save mappings to memory if user opted in
            if (remember) {
                const toSave = activeMappings.map(m => ({
                    source_column: m.source_column,
                    entity_type,
                    target_field: m.target_field,
                }));
                await dbSaveColumnMappings(toSave);
            }

            // Fix: increment success_count only for actually-mapped columns (not all raw headers)
            if (activeNormalized.length > 0) {
                await dbIncrementMappingSuccess(activeNormalized, entity_type);
            }

            const draftInputs = rows.map(row => {
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
                return {
                    batch_id: batchId,
                    entity_type: entity_type as "customer" | "product" | "order" | "order_line" | "stock" | "quote" | "shipment" | "invoice" | "payment",
                    raw_data: row as Record<string, unknown>,
                    parsed_data,
                    confidence: 1.0,   // user confirmed the mapping
                    ai_reason: "Kullanıcı kolon eşleştirmesini onayladı",
                    unmatched_fields: [] as unknown[],
                };
            });

            const created = await dbCreateDrafts(draftInputs);
            allDrafts.push(...created);
        }

        const avgConfidence = allDrafts.length > 0
            ? allDrafts.reduce((sum, d) => sum + (d.confidence ?? 0), 0) / allDrafts.length
            : 1.0;
        await dbUpdateBatchStatus(batchId, "review", null, avgConfidence);

        return NextResponse.json({ drafts: allDrafts }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/import/[batchId]/apply-mappings]", err);
        return NextResponse.json({ error: "Eşleştirme uygulaması başarısız." }, { status: 500 });
    }
}
