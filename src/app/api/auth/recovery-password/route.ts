import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";

/**
 * POST /api/auth/recovery-password — kurtarma akışının parola yazma ucu.
 * Body: { password: string }
 *
 * NEDEN VAR (2026-09-11, dış inceleme #2): parola politikası bu depoda
 * 2026-08-31'den beri "sunucu otoriter, istemci aynalıyor" diye kayıtlı ve üç
 * yüzeyde öyle: `/api/settings/user/password`, admin `PATCH /api/admin/users/[id]`
 * ve `signUp` (hiç yok). DÖRDÜNCÜ yüzey — `/sifre-yenile` — politikayı YALNIZ
 * tarayıcıda uyguluyor, sonra doğrudan `supabase.auth.updateUser` çağırıyordu.
 * Kurtarma oturumuna sahip biri devtools'tan aynı çağrıyı yapıp 6 karakterlik
 * parola kurabiliyordu. Yetki yükselmesi DEĞİL (kişi kendi parolasını
 * zayıflatıyor) ama sözleşmenin deliği: bir kural yalnız istemcide yaşıyorsa
 * yaşamıyordur.
 *
 * MEVCUT ŞİFRE İSTENMEZ — bilerek. Kurtarma akışının tanımı budur: kimlik
 * kanıtı e-posta kutusuna sahip olmaktır (`sifre-yenile/page.tsx`'in başındaki
 * KAYDA GEÇEN KARAR). `/api/settings/user/password` ise oturumu ÇALINMIŞ olma
 * ihtimaline karşı mevcut şifreyi doğrular; iki uç aynı sebeple ayrı.
 *
 * `ALWAYS_PUBLIC`e GİRMEZ: kurtarma oturumu `/auth/callback`te kurulmuş olmalı.
 * Oturumsuz istek 401 alır; `proxy.ts` zaten daha önce eler.
 */
export async function POST(req: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !user.email) {
            // Kurtarma bağlantısının süresi dolmuş ya da hiç oturum yok.
            return NextResponse.json(
                { error: "Oturum bulunamadı. Yeni bir sıfırlama bağlantısı isteyin." },
                { status: 401 },
            );
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as { password?: unknown };
        const password = typeof body.password === "string" ? body.password : "";

        // SUNUCU OTORİTER. İstemcideki aynı çağrı yalnız anında geri bildirim için.
        const policyError = checkPasswordPolicy(password, { email: user.email });
        if (policyError) {
            return NextResponse.json({ error: policyError }, { status: 400 });
        }

        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) {
            return NextResponse.json(
                {
                    error:
                        "Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir; " +
                        "yeni bir sıfırlama bağlantısı isteyin.",
                },
                { status: 400 },
            );
        }

        // Audit — kardeş uçlarla aynı şekil ve aynı `{ error }` disiplini
        // (bu turun #7 bulgusu bu dosyaya da uygulanır, doğduğu gün istisna
        // taşımasın diye).
        try {
            const service = createServiceClient();
            const { error: auditErr } = await service.from("audit_log").insert({
                actor: user.email,
                action: "password_reset_via_recovery",
                entity_type: "user",
                entity_id: null,
                source: "ui",
                before_state: null,
                after_state: { user_id: user.id, email: user.email },
            });
            if (auditErr) {
                console.error(JSON.stringify({
                    audit_insert_failed: auditErr.message,
                    action: "password_reset_via_recovery",
                    userId: user.id,
                }));
            }
        } catch (auditErr) {
            console.error(JSON.stringify({
                audit_insert_threw: String(auditErr),
                action: "password_reset_via_recovery",
                userId: user.id,
            }));
        }

        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "POST /api/auth/recovery-password");
    }
}
