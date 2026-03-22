import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleApiError } from "@/lib/api-error";

// GET /api/parasut/stats
export async function GET() {
    try {
        const supabase = createServiceClient();

        const [customersRes, syncedRes, pendingRes, failedRes] = await Promise.all([
            supabase.from("customers").select("id", { count: "exact", head: true }),
            supabase.from("sales_orders").select("id", { count: "exact", head: true })
                .not("parasut_invoice_id", "is", null),
            supabase.from("sales_orders").select("id", { count: "exact", head: true })
                .eq("commercial_status", "approved")
                .is("parasut_invoice_id", null)
                .is("parasut_error", null),
            supabase.from("integration_sync_logs").select("id", { count: "exact", head: true })
                .eq("status", "error")
                .lt("retry_count", 3),
        ]);

        return NextResponse.json({
            customers: customersRes.count ?? 0,
            synced_invoices: syncedRes.count ?? 0,
            pending_syncs: pendingRes.count ?? 0,
            failed_syncs: failedRes.count ?? 0,
        });
    } catch (err) {
        return handleApiError(err, "GET /api/parasut/stats");
    }
}
