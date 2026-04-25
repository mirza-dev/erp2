import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleApiError } from "@/lib/api-error";

// GET /api/parasut/stats
export async function GET() {
    try {
        const supabase = createServiceClient();

        const [customersRes, syncedRes, pendingRes, inProgressRes, failedRes, blockedRes] = await Promise.all([
            supabase.from("customers").select("id", { count: "exact", head: true }),

            // synced = has a Paraşüt invoice (backward-compatible)
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
        ]);

        return NextResponse.json({
            customers:        customersRes.count   ?? 0,
            synced_invoices:  syncedRes.count      ?? 0,
            pending_syncs:    pendingRes.count     ?? 0,
            in_progress_syncs: inProgressRes.count ?? 0,
            failed_syncs:     failedRes.count      ?? 0,
            blocked_syncs:    blockedRes.count     ?? 0,
        });
    } catch (err) {
        return handleApiError(err, "GET /api/parasut/stats");
    }
}
