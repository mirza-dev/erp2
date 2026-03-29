import { NextRequest, NextResponse } from "next/server";
import { dbGetBatch, dbUpdateBatchStatus, dbCreateDrafts } from "@/lib/supabase/import";
import { aiBatchParse, isAIAvailable } from "@/lib/services/ai-service";

/**
 * POST /api/import/[batchId]/parse
 * Body: { sheets: [{ sheet_name, entity_type, rows }] }
 * AI-powered (or fallback) parsing of Excel rows into import drafts.
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
                entity_type: "customer" | "product" | "order";
                rows: Array<Record<string, string>>;
            }>;
        };

        if (!body.sheets || body.sheets.length === 0) {
            return NextResponse.json({ error: "En az bir sheet gerekli." }, { status: 400 });
        }

        const VALID_ENTITY_TYPES = new Set<string>(["customer", "product", "order"]);
        const MAX_ROWS_PER_SHEET = 200;

        for (const sheet of body.sheets) {
            if (!VALID_ENTITY_TYPES.has(sheet.entity_type)) {
                return NextResponse.json(
                    { error: `Geçersiz entity tipi: ${sheet.entity_type}` },
                    { status: 400 }
                );
            }
            if (sheet.rows.length > MAX_ROWS_PER_SHEET) {
                return NextResponse.json(
                    { error: `Sheet başına en fazla ${MAX_ROWS_PER_SHEET} satır kabul edilir.` },
                    { status: 400 }
                );
            }
        }

        // 1. Batch status → processing
        await dbUpdateBatchStatus(batchId, "processing");

        const allDrafts = [];
        const aiAvailable = isAIAvailable();

        // 2. Parse each sheet
        for (const sheet of body.sheets) {
            if (!sheet.rows || sheet.rows.length === 0) continue;

            const result = await aiBatchParse({
                entity_type: sheet.entity_type,
                rows: sheet.rows,
            });

            // 3. Create drafts from parsed results
            const draftInputs = result.items.map((item, idx) => ({
                batch_id: batchId,
                entity_type: sheet.entity_type,
                raw_data: sheet.rows[idx] as Record<string, unknown>,
                parsed_data: item.parsed_data as Record<string, unknown>,
                confidence: item.confidence,
                ai_reason: item.ai_reason,
                unmatched_fields: item.unmatched_fields as unknown[],
            }));

            const created = await dbCreateDrafts(draftInputs);
            allDrafts.push(...created);
        }

        // 4. Batch status → review
        const avgConfidence = allDrafts.length > 0
            ? allDrafts.reduce((sum, d) => sum + (d.confidence ?? 0), 0) / allDrafts.length
            : 0;
        await dbUpdateBatchStatus(batchId, "review", null, avgConfidence);

        return NextResponse.json({
            drafts: allDrafts,
            ai_available: aiAvailable,
        }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/import/[batchId]/parse]", err);
        const msg = err instanceof Error ? err.message : "Parse işlemi başarısız.";
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
