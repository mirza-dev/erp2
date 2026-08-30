import { NextResponse } from "next/server";
import { serviceRunAlertScan } from "@/lib/services/alert-scan-runner";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";

// POST /api/alerts/scan — scans all products and creates/resolves stock alerts
// Auth: CRON_SECRET Bearer token (Vercel Cron) OR authenticated session (UI "Tara" butonu)
// ?force=true → takılı lock'u temizler (demo / manuel tetikleme için)
//
// KOBİ-sim Y5: lock + tarama adımları `alert-scan-runner`'a taşındı — mal kabul
// yolu da aynı koşucuyu çağırıyor (eskiden kendi sunucusuna göreli URL ile HTTP
// atıp sessizce başarısız oluyordu).
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

    try {
        const result = await serviceRunAlertScan(force);
        if (result.skipped) {
            return NextResponse.json(
                { error: "Tarama zaten devam ediyor." },
                { status: 409 }
            );
        }
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/alerts/scan", { clientMessage: "Tarama başarısız." });
    }
}
