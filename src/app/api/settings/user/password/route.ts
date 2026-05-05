import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseJsClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleApiError, safeParseJson } from "@/lib/api-error";

// POST /api/settings/user/password
// Body: { currentPassword: string, newPassword: string }
//
// Akış:
// 1. Session'dan kullanıcıyı al
// 2. Cookie'siz fresh anon client ile signInWithPassword → mevcut şifre doğrulaması
//    (Supabase updateUser({ password }) eski şifre sormuyor; çalınmış oturum riskine
//    karşı manuel doğrulama. Doğrulama session'ı global state'e karışmasın diye
//    paylaşılmayan ayrı client kullanıyoruz; signOut çağırmamıza gerek yok.)
// 3. Mevcut session ile updateUser({ password: newPassword })
// 4. audit_log entry
//
// Brute-force koruması: Supabase GoTrue katmanı signInWithPassword için kendi
// rate-limit'ini uyguluyor (~15 dakikada 30 deneme/IP, GoTrue config). Endpoint
// yine de session-locked: yalnızca giriş yapmış kullanıcı kendi şifresini
// değiştirebilir. Çoklu hesap enumeration veya IP-bazlı brute-force için ek
// Upstash rate-limit altyapısı sonraki tur.
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) {
            return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as { currentPassword?: unknown; newPassword?: unknown };
        const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
        const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";

        if (!currentPassword) {
            return NextResponse.json({ error: "Mevcut şifre gerekli." }, { status: 400 });
        }
        if (newPassword.length < 8) {
            return NextResponse.json({ error: "Yeni şifre en az 8 karakter olmalı." }, { status: 400 });
        }
        if (currentPassword === newPassword) {
            return NextResponse.json({ error: "Yeni şifre mevcut şifreden farklı olmalı." }, { status: 400 });
        }

        // Mevcut şifre doğrulama — paylaşılmayan, cookie'siz client (mevcut session etkilenmez)
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (!url || !anonKey) {
            return NextResponse.json({ error: "Sunucu yapılandırma hatası." }, { status: 503 });
        }
        const verifyClient = createSupabaseJsClient(url, anonKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error: signInError } = await verifyClient.auth.signInWithPassword({
            email: user.email,
            password: currentPassword,
        });
        if (signInError) {
            return NextResponse.json({ error: "Mevcut şifre hatalı." }, { status: 400 });
        }

        // Şifreyi güncelle (mevcut session ile)
        const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        // Audit log
        try {
            const service = createServiceClient();
            await service.from("audit_log").insert({
                actor: user.email,
                action: "password_changed",
                entity_type: "user",
                entity_id: null,
                source: "ui",
                before_state: null,
                after_state: { user_id: user.id, email: user.email },
            });
        } catch {
            /* non-fatal — şifre değişti, log eksik kalabilir */
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "POST /api/settings/user/password");
    }
}
