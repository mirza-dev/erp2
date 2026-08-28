/**
 * AI Run audit trail — fire-and-forget insert.
 * Never throws, never blocks the main AI flow.
 */
import { createHash } from "crypto";
import { createServiceClient } from "@/lib/supabase/service";

export type AiFeature = "order_score" | "stock_risk" | "import_parse" | "import_classify" | "import_extract_products" | "import_extract_certificate" | "ops_summary" | "alert_findings" | "purchase_enrich" | "production_voice";

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
        } catch (err) {
            // Fire-and-forget — audit failures must never break core flows
            console.warn("[ai_runs] audit write failed:", err instanceof Error ? err.message : err);
        }
    })();
}

/**
 * Bir AI özelliğinin SON BAŞARILI koşu zamanı (ISO) — yoksa null.
 *
 * 2026-08-24: AI yüzeyleri iki aydır boştu ve kullanıcı bunu hiçbir yerden
 * göremiyordu ("tutarsız" hissinin bir kaynağı). Uyarılar sayfası bu değeri
 * gösterir; "son analiz 2 ay önce" tek bakışta durumu anlatır. Aynı değer
 * günlük otomatik koşunun da kapısıdır (24 saatten eskiyse tetikle).
 */
export async function dbGetLastAiRunAt(feature: AiFeature): Promise<string | null> {
    try {
        const supabase = createServiceClient();
        const { data } = await supabase
            .from("ai_runs")
            .select("created_at")
            .eq("feature", feature)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
        return (data?.created_at as string | undefined) ?? null;
    } catch {
        // Okuma hatası akışı kırmamalı — bilinmiyor = null (UI "—" gösterir).
        return null;
    }
}
