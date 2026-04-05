import { NextResponse } from "next/server";
import { serviceScanStockAlerts } from "@/lib/services/alert-service";
import { createServiceClient } from "@/lib/supabase/service";

// POST /api/alerts/scan — scans all products and creates/resolves stock alerts
export async function POST() {
    const supabase = createServiceClient();

    // Advisory lock: only one scan at a time
    const { data: locked } = await supabase.rpc("try_acquire_scan_lock");
    if (!locked) {
        return NextResponse.json(
            { error: "Tarama zaten devam ediyor." },
            { status: 409 }
        );
    }

    try {
        const result = await serviceScanStockAlerts();
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/alerts/scan]", err);
        return NextResponse.json({ error: "Tarama başarısız." }, { status: 500 });
    } finally {
        try { await supabase.rpc("release_scan_lock"); } catch { /* ignore */ }
    }
}
