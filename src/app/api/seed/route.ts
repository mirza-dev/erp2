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
 * Auth: ALWAYS_PUBLIC (proxy) + burada CRON_SECRET Bearer VEYA admin oturum
 * (yıkıcı endpoint — self-signup oturumu DB'yi silemez).
 *
 * 2026-08-29 — YAZILI ONAY ŞARTI (oturum yolunda). Bu uç canlı veritabanını
 * siler ve GELİŞTİRME ORTAMI AYRI BİR VERİTABANI KULLANMAZ: `.env.local` da
 * fabrikanın hasıl Supabase projesine bakar. Yani "dev'de sıfırla" diye bir
 * şey yok — her çağrı gerçek iş verisini götürür. Tek onay diyaloğu bunun için
 * yeterli değildi; oturum yolu artık gövdede `confirm` alanı ister ve bu alan
 * `company_settings.name` ile BİREBİR eşleşmeli. Böylece:
 *   · yanlışlıkla tıklama (UI'de metin yazmadan) sunucuda da durur,
 *   · başıboş bir script/curl çağrısı firma adını bilmeden geçemez.
 * CRON_SECRET yolu MUAF — otomasyonun kendi sırrı zaten kanıttır.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { parseRoles } from "@/lib/auth/permissions";
import { clearAllData, runSeed } from "@/lib/seed/seed-runner";
import { dbGetCompanySettings } from "@/lib/supabase/company-settings";
import { safeParseJson } from "@/lib/api-error";

type AuthKind = "cron" | "session" | null;

async function checkAuth(request: NextRequest): Promise<AuthKind> {
    // 1. CRON_SECRET (cron veya curl tetikleme)
    const secret = process.env.CRON_SECRET;
    if (secret && request.headers.get("authorization") === `Bearer ${secret}`) return "cron";

    // 2. Authenticated user session (UI'dan tetikleme — settings → reset butonu).
    //    YIKICI endpoint (tüm veriyi siler+yeniden seed) → yalnız ADMIN.
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        const adminEmails = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
        return parseRoles(user.app_metadata, user.email, adminEmails).includes("admin") ? "session" : null;
    } catch {
        return null;
    }
}

/**
 * Oturum yolunda yazılı onay. `null` → geçti; `NextResponse` → reddedildi.
 * Firma adı okunamıyorsa FAIL-CLOSED: doğrulanamayan onay onay değildir.
 */
async function requireWrittenConfirmation(request: NextRequest): Promise<NextResponse | null> {
    const parsed = await safeParseJson(request);
    const body = parsed.ok ? (parsed.data as Record<string, unknown>) : {};
    const typed = typeof body.confirm === "string" ? body.confirm.trim() : "";

    let expected = "";
    try {
        expected = (await dbGetCompanySettings())?.name?.trim() ?? "";
    } catch {
        expected = "";
    }
    if (!expected) {
        return NextResponse.json(
            { error: "Firma adı okunamadığı için sıfırlama onayı doğrulanamadı." },
            { status: 503 },
        );
    }
    if (typed !== expected) {
        return NextResponse.json(
            { error: `Onay için firma adını birebir yazın: "${expected}"`, confirmRequired: expected },
            { status: 400 },
        );
    }
    return null;
}

export async function DELETE(request: NextRequest) {
    const kind = await checkAuth(request);
    if (!kind) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    if (kind === "session") {
        const blocked = await requireWrittenConfirmation(request);
        if (blocked) return blocked;
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
    const kind = await checkAuth(request);
    if (!kind) {
        return NextResponse.json({ error: "Yetkisiz erişim." }, { status: 401 });
    }
    if (kind === "session") {
        const blocked = await requireWrittenConfirmation(request);
        if (blocked) return blocked;
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
