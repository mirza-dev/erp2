import { NextRequest, NextResponse } from "next/server";
import {
    serviceRetrySyncLog,
    serviceRetryParasutStep,
    type RetryableParasutStep,
} from "@/lib/services/parasut-service";
import { handleApiError, safeParseJson } from "@/lib/api-error";

const VALID_STEPS = new Set<RetryableParasutStep | "all">([
    "contact", "product", "shipment", "invoice", "edoc", "all",
]);

// POST /api/parasut/retry
// Body (Faz 11.2 — step-granular):  { orderId: string, step?: 'contact'|'product'|'shipment'|'invoice'|'edoc'|'all' }
// Body (geriye dönük — sync_log):   { sync_log_id: string }
export async function POST(req: NextRequest) {
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        // ── Step-granular path (Faz 11.2) ─────────────────────────
        if (typeof body.orderId === "string" && body.orderId.length > 0) {
            const stepRaw = (body.step ?? "all") as string;
            if (!VALID_STEPS.has(stepRaw as RetryableParasutStep | "all")) {
                return NextResponse.json(
                    { error: `Geçersiz step: ${stepRaw}. Geçerli: contact|product|shipment|invoice|edoc|all` },
                    { status: 400 },
                );
            }
            const result = await serviceRetryParasutStep(
                body.orderId,
                stepRaw as RetryableParasutStep | "all",
            );
            if (!result.success && !result.skipped) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }
            return NextResponse.json(result);
        }

        // ── Geriye dönük: sync_log_id path ────────────────────────
        if (typeof body.sync_log_id === "string" && body.sync_log_id.length > 0) {
            const result = await serviceRetrySyncLog(body.sync_log_id);
            if (!result.success && !result.skipped) {
                return NextResponse.json({ error: result.error }, { status: 400 });
            }
            return NextResponse.json(result);
        }

        return NextResponse.json(
            { error: "'orderId' veya 'sync_log_id' alanlarından biri zorunludur." },
            { status: 400 },
        );
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/retry");
    }
}
