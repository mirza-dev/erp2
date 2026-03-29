/**
 * AI Run audit trail — fire-and-forget insert.
 * Never throws, never blocks the main AI flow.
 */
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type AiFeature = "order_score" | "stock_risk" | "import_parse" | "ops_summary" | "purchase_enrich";

export interface LogAiRunParams {
    feature: AiFeature;
    entity_id?: string | null;
    input_hash?: string | null;
    confidence?: number | null;
    latency_ms?: number | null;
    model?: string | null;
}

export function hashInput(input: string): string {
    return createHash("sha256").update(input).digest("hex");
}

export function logAiRun(params: LogAiRunParams): void {
    (async () => {
        try {
            const supabase = createServiceClient();
            await supabase.from("ai_runs").insert({
                feature: params.feature,
                entity_id: params.entity_id ?? null,
                input_hash: params.input_hash ?? null,
                confidence: params.confidence ?? null,
                latency_ms: params.latency_ms ?? null,
                model: params.model ?? null,
            });
        } catch {
            // Fire-and-forget — audit failures must never break core flows
        }
    })();
}
