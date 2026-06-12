/**
 * /api/seed — PMT Endüstriyel senaryosal demo verisi (thin orchestrator).
 *
 * Veri ve yükleme mantığı src/lib/seed/'de:
 *   seed-data.ts   — senaryo sabitleri (20 ürün · 8 müşteri · 15 sipariş · 8 teklif · 5 PO ...)
 *   seed-runner.ts — clearAllData + runSeed (tüm modüller: PO/V7 teklif/import-doc/
 *                    company_files/calendar_notes/email_logs/attachments/RBAC hesapları)
 *   seed-assets.ts — sentetik mini PDF/PNG üreticileri (storage demo/ prefix)
 *
 * DIŞ ETKİ YOK: e-posta gönderilmez, Paraşüt/AI çağrılmaz; yalnız Supabase DB+storage.
 * Auth sözleşmesi DEĞİŞMEDİ: ALWAYS_PUBLIC (proxy) + burada CRON_SECRET Bearer VEYA
 * admin oturum zorunlu (yıkıcı endpoint — self-signup oturumu DB'yi silemez).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { parseRoles } from "@/lib/auth/permissions";
import { clearAllData, runSeed } from "@/lib/seed/seed-runner";

async function checkAuth(request: NextRequest): Promise<boolean> {
    // 1. CRON_SECRET (cron veya curl tetikleme)
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return true;

    // 2. Authenticated user session (UI'dan tetikleme — settings → reset butonu).
    //    YIKICI endpoint (tüm veriyi siler+yeniden seed) → yalnız ADMIN.
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;
        const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
        return parseRoles(user.app_metadata, user.email, adminEmails).includes("admin");
    } catch {
        return false;
    }
}

export async function DELETE(request: NextRequest) {
    if (!await checkAuth(request)) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    try {
        const supabase = createServiceClient();
        const cleaned = await clearAllData(supabase);
        return NextResponse.json({
            ok: true,
            message: "Tüm demo + LOAD verileri temizlendi. POST /api/seed ile yeniden yükle.",
            cleaned,
        });
    } catch (err) {
        console.error("[DELETE /api/seed]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Silme başarısız." },
            { status: 500 }
        );
    }
}

export async function POST(request: NextRequest) {
    if (!await checkAuth(request)) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    try {
        const supabase = createServiceClient();
        const cleared = await clearAllData(supabase);
        const seeded = await runSeed(supabase);
        return NextResponse.json({ ok: true, cleared, seeded });
    } catch (err) {
        console.error("[POST /api/seed]", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Seed başarısız." },
            { status: 500 }
        );
    }
}
