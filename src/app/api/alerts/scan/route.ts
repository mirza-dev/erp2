import { NextResponse } from "next/server";
import { serviceScanStockAlerts } from "@/lib/services/alert-service";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";

// POST /api/alerts/scan — scans all products and creates/resolves stock alerts
// Auth: CRON_SECRET Bearer token (Vercel Cron) OR authenticated session (UI "Tara" butonu)
// ?force=true → takılı lock'u temizler (demo / manuel tetikleme için)
export async function POST(request: Request) {
    // Auth: CRON_SECRET veya oturum zorunlu
    const secret = process.env.CRON_SECRET;
    const authHeader = request.headers.get("authorization");
    const hasCronSecret = secret && authHeader === `Bearer ${secret}`;

    if (!hasCronSecret) {
        try {
            const supabase = await createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
            }
        } catch {
            return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
        }
    }
    const { searchParams } = new URL(request.url);
    const force = searchParams.get("force") === "true";
    const supabase = createServiceClient();

    if (force) {
        // Takılı lock'u zorla bırak
        try { await supabase.rpc("release_scan_lock"); } catch { /* ignore */ }
    }

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
