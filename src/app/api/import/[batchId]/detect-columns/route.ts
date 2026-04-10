import { NextRequest, NextResponse } from "next/server";
import { dbGetBatch } from "@/lib/supabase/import";
import { dbLookupColumnMappings, normalizeColumnName } from "@/lib/supabase/column-mappings";
import { aiDetectColumns, isAIAvailable, FALLBACK_FIELD_MAP } from "@/lib/services/ai-service";

/**
 * POST /api/import/[batchId]/detect-columns
 * Detects column → ERP field mappings for each sheet.
 * Lookup order: memory → FALLBACK_FIELD_MAP (inside aiDetectColumns) → AI
 *
 * Body: {
 *   sheets: [{
 *     sheet_name: string,
 *     entity_type: string,
 *     headers: string[],
 *     sample_rows: Record<string, string>[]  // first 5 rows
 *   }]
 * }
 * Response: {
 *   sheets: [{
 *     sheet_name: string,
 *     mappings: [{ source_column, target_field, confidence, source }]
 *   }]
 * }
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
                headers: string[];
                sample_rows: Array<Record<string, string>>;
            }>;
        };

        if (!body.sheets || body.sheets.length === 0) {
            return NextResponse.json({ error: "En az bir sheet gerekli." }, { status: 400 });
        }

        const resultSheets = [];

        for (const sheet of body.sheets) {
            const { sheet_name, entity_type, headers, sample_rows } = sheet;

            // 1. Look up memory for known mappings
            const memoryMap = await dbLookupColumnMappings(headers, entity_type);

            // Build per-column result, resolving from memory where possible
            const resolvedMappings: Array<{
                source_column: string;
                target_field: string | null;
                confidence: number;
                source: "memory" | "ai" | "fallback";
            }> = [];

            const fallbackMap = FALLBACK_FIELD_MAP[entity_type] ?? {};
            const trulyUnknownHeaders: string[] = [];

            for (const header of headers) {
                const norm = normalizeColumnName(header);
                const memRow = memoryMap.get(norm);

                if (memRow) {
                    // 1. Memory hit — confidence: confirmed ratio, floor 0.6 for unconfirmed
                    const confidence = memRow.success_count > 0
                        ? Math.min(1, memRow.success_count / memRow.usage_count)
                        : 0.6;
                    resolvedMappings.push({
                        source_column: header,
                        target_field: memRow.target_field,
                        confidence,
                        source: "memory",
                    });
                } else if (fallbackMap[norm]) {
                    // 2. FALLBACK_FIELD_MAP hit — no AI call needed
                    resolvedMappings.push({
                        source_column: header,
                        target_field: fallbackMap[norm],
                        confidence: 0.8,
                        source: "fallback",
                    });
                } else {
                    // 3. Truly unknown — needs AI
                    trulyUnknownHeaders.push(header);
                }
            }

            // 3. AI only for headers not resolved by memory or fallback
            if (trulyUnknownHeaders.length > 0) {
                const pastMappings = Array.from(memoryMap.values()).map(r => ({
                    source_column: r.source_column,
                    target_field: r.target_field,
                    success_count: r.success_count,
                }));

                const aiResult = await aiDetectColumns({
                    headers: trulyUnknownHeaders,
                    sampleRows: sample_rows,
                    entityType: entity_type,
                    pastMappings,
                });

                for (const m of aiResult.mappings) {
                    resolvedMappings.push({
                        source_column: m.source_column,
                        target_field: m.target_field,
                        confidence: m.confidence,
                        source: isAIAvailable() ? "ai" : "fallback",
                    });
                }
            }

            // Preserve original header order
            const orderedMappings = headers.map(h =>
                resolvedMappings.find(m => m.source_column === h) ?? {
                    source_column: h,
                    target_field: null,
                    confidence: 0,
                    source: "fallback" as const,
                }
            );

            resultSheets.push({ sheet_name, mappings: orderedMappings });
        }

        return NextResponse.json({ sheets: resultSheets });
    } catch (err) {
        console.error("[POST /api/import/[batchId]/detect-columns]", err);
        return NextResponse.json({ error: "Kolon algılama başarısız." }, { status: 500 });
    }
}
