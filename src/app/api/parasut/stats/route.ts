import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleApiError } from "@/lib/api-error";

// GET /api/parasut/stats
// Faz 11.4 — token durumu + step + error_kind dağılımları + aggregate counts
export async function GET() {
    try {
        const supabase = createServiceClient();

        const [customersRes, syncedRes, pendingRes, inProgressRes, failedRes, blockedRes, distRes, tokenRes] = await Promise.all([
            supabase.from("customers").select("id", { count: "exact", head: true }),

            // synced = has a Paraşüt invoice
            supabase.from("sales_orders").select("id", { count: "exact", head: true })
                .not("parasut_invoice_id", "is", null),

            // pending = step started but not done
            supabase.from("sales_orders").select("id", { count: "exact", head: true })
                .not("parasut_step", "is", null)
                .neq("parasut_step", "done"),

            // in_progress = actively in a sync step (not done, not blocked)
            supabase.from("sales_orders").select("id", { count: "exact", head: true })
                .in("parasut_step", ["contact", "product", "shipment", "invoice", "edoc"]),

            // failed = non-blocking error, still retryable (retry_count < 5)
            supabase.from("sales_orders").select("id", { count: "exact", head: true })
                .not("parasut_error_kind", "is", null)
                .not("parasut_error_kind", "in", "(validation,auth)")
                .lt("parasut_retry_count", 5),

            // blocked = needs manual intervention (auth/validation errors)
            supabase.from("sales_orders").select("id", { count: "exact", head: true })
                .in("parasut_error_kind", ["validation", "auth"]),

            // Faz 11.4 — step + error_kind dağılımı (single fetch, JS aggregation)
            supabase.from("sales_orders")
                .select("parasut_step,parasut_error_kind")
                .not("parasut_step", "is", null),

            // Faz 11.4/11.5 — OAuth token durumu (singleton; expires_at + version)
            supabase.from("parasut_oauth_tokens")
                .select("expires_at,token_version,updated_at")
                .eq("singleton_key", "default")
                .maybeSingle(),
        ]);

        // Aggregate distributions
        const byStep:      Record<string, number> = {};
        const byErrorKind: Record<string, number> = {};
        type Row = { parasut_step: string | null; parasut_error_kind: string | null };
        for (const r of (distRes.data ?? []) as Row[]) {
            const s = r.parasut_step ?? "unknown";
            byStep[s] = (byStep[s] ?? 0) + 1;
            if (r.parasut_error_kind) {
                byErrorKind[r.parasut_error_kind] = (byErrorKind[r.parasut_error_kind] ?? 0) + 1;
            }
        }

        // Token info — exists, expired, secondsRemaining
        let token: {
            connected: boolean;
            expiresAt: string | null;
            secondsRemaining: number | null;
            tokenVersion: number | null;
            updatedAt: string | null;
        } = {
            connected: false,
            expiresAt: null,
            secondsRemaining: null,
            tokenVersion: null,
            updatedAt: null,
        };
        const tRow = tokenRes.data as { expires_at: string; token_version: number; updated_at: string } | null;
        if (tRow) {
            const expMs = new Date(tRow.expires_at).getTime();
            token = {
                connected:        expMs > Date.now(),
                expiresAt:        tRow.expires_at,
                secondsRemaining: Math.floor((expMs - Date.now()) / 1000),
                tokenVersion:     tRow.token_version,
                updatedAt:        tRow.updated_at,
            };
        }

        return NextResponse.json({
            customers:         customersRes.count   ?? 0,
            synced_invoices:   syncedRes.count      ?? 0,
            pending_syncs:     pendingRes.count     ?? 0,
            in_progress_syncs: inProgressRes.count  ?? 0,
            failed_syncs:      failedRes.count      ?? 0,
            blocked_syncs:     blockedRes.count     ?? 0,
            byStep,
            byErrorKind,
            token,
        });
    } catch (err) {
        return handleApiError(err, "GET /api/parasut/stats");
    }
}
