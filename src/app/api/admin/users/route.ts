import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { parseRoles, normalizeAssignedRoles } from "@/lib/auth/permissions";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";
import { inviteAvailable, randomInvitePassword, sendUserInvite } from "@/lib/services/user-invite-service";

function adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
}

/**
 * RBAC Faz 5: admin guard artık `app_metadata.roles ∋ admin` üzerinden
 * (parseRoles ADMIN_EMAILS bootstrap'ı da kapsar). Eski "ADMIN_EMAILS boşsa
 * herkes admin" davranışı KALDIRILDI — ilk admin ADMIN_EMAILS veya create-admin
 * ile bootstrap edilir.
 */
async function requireAdmin(): Promise<{ error: NextResponse } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: "Yetkisiz." }, { status: 401 }) };
    const emails = adminEmails();
    if (parseRoles(user.app_metadata, user.email, emails).includes("admin")) return null;
    // Zero-admin bootstrap: sistemde hiç admin yoksa ilk authd kullanıcıya izin ver
    // (first-run / migration sonrası). İlk admin atanınca otomatik kapanır → brick-proof.
    // P1 #3 fix: listUsers HATASI fail-CLOSED — hata varsa "admin yok" varsayıp
    // izin verme (eski hâl: data undefined → boş → fail-open).
    const svc = createServiceClient();
    const { data, error } = await svc.auth.admin.listUsers();
    if (error || !data) {
        return { error: NextResponse.json({ error: "Yetki doğrulanamadı." }, { status: 500 }) };
    }
    const anyAdmin = data.users.some(u => parseRoles(u.app_metadata, u.email, emails).includes("admin"));
    if (!anyAdmin) return null;
    return { error: NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir." }, { status: 403 }) };
}

// GET /api/admin/users — tüm kullanıcıları listele
// Yanıt: { users: [...], inviteAvailable } — UI davet seçeneğini buna göre açar
// (2026-09-16). Eski düz-dizi şekli `users` alanına taşındı.
export async function GET() {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const supabase = createServiceClient();
        const { data, error } = await supabase.auth.admin.listUsers();
        if (error) return handleApiError(error, "GET /api/admin/users");
        return NextResponse.json({
            users: data.users.map((u) => ({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at ?? null,
                roles: parseRoles(u.app_metadata, u.email, adminEmails()),
            })),
            inviteAvailable: inviteAvailable(),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/admin/users");
    }
}

/** Davet bağlantısının döneceği origin: env yoksa isteğin kendi origin'i. */
function requestOrigin(req: NextRequest): string {
    return process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin;
}

// POST /api/admin/users — yeni kullanıcı oluştur
// Body: { email: string, roles?: string[], mode?: "invite" | "password", password?: string }
//
// İKİ MOD (onboarding, 2026-09-16):
//   invite   → parola YAZILMAZ; hesap rastgele parolayla açılır, kişiye "parolanı
//              belirle" e-postası gider (recovery link + Resend). E-posta
//              yapılandırılmamışsa 400; gönderim düşerse hesap GERİ ALINIR (502) —
//              yarım kullanıcı kalmaz.
//   password → eski yol: admin parolayı belirler, elden iletir (e-posta yokken
//              tek yol). `checkPasswordPolicy` aynen (gate/password-policy kilidi).
export async function POST(req: NextRequest) {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const { email, password, roles, mode } = parsed.data as {
            email?: string; password?: string; roles?: unknown; mode?: unknown;
        };

        if (!email?.trim()) {
            return NextResponse.json({ error: "E-posta zorunludur." }, { status: 400 });
        }
        const invite = mode === "invite";
        if (invite && !inviteAvailable()) {
            return NextResponse.json(
                { error: "E-posta gönderimi yapılandırılmamış — daveti gönderemem. Parolayı kendiniz belirleyin veya Ayarlar › Sistem Durumu'na bakın.", code: "email_not_configured" },
                { status: 400 },
            );
        }
        // Parola politikası KULLANICI SEÇİMİ içindir; davetteki parola sunucu
        // üretimi 32 baytlık rastgele sır — kimse görmez, ilk girişte değişir.
        // Politikadan geçirmek yalnız nadir rastgele dizilerde sahte 400 üretirdi.
        const effectivePassword = invite ? randomInvitePassword() : (password ?? "");
        if (!invite) {
            const policyError = checkPasswordPolicy(effectivePassword, { email });
            if (policyError) {
                return NextResponse.json({ error: policyError }, { status: 400 });
            }
        }

        // RBAC Faz 5: roller normalize (verilmezse → ["viewer"], sessiz yetki YOK)
        const assignedRoles = normalizeAssignedRoles(roles);

        const supabase = createServiceClient();
        const { data, error } = await supabase.auth.admin.createUser({
            email: email.trim(),
            password: effectivePassword,
            email_confirm: true,
            app_metadata: { roles: assignedRoles },
        });

        if (error) {
            if (error.message.includes("already registered")) {
                return NextResponse.json(
                    { error: "Bu e-posta adresi zaten kayıtlı." },
                    { status: 409 }
                );
            }
            return handleApiError(error, "POST /api/admin/users");
        }

        if (invite) {
            const actor = (await (await createClient()).auth.getUser()).data.user;
            const sent = await sendUserInvite({
                userId: data.user.id,
                email: email.trim(),
                roles: assignedRoles,
                inviter: { id: actor?.id ?? null, email: actor?.email ?? null },
                origin: requestOrigin(req),
            });
            if (!sent.ok) {
                // Davet gitmediyse hesap yok sayılır: kimsenin bilmediği rastgele
                // parolalı, giriş yapılamayan bir kullanıcı bırakmak yerine geri al.
                const { error: delErr } = await supabase.auth.admin.deleteUser(data.user.id);
                if (delErr) console.error("[admin/users] invite rollback failed", delErr.message);
                return NextResponse.json(
                    { error: `Davet e-postası gönderilemedi (${sent.error}). Kullanıcı oluşturulmadı.`, code: "invite_send_failed" },
                    { status: 502 },
                );
            }
        }

        return NextResponse.json(
            { id: data.user.id, email: data.user.email, roles: assignedRoles, invited: invite },
            { status: 201 }
        );
    } catch (err) {
        return handleApiError(err, "POST /api/admin/users");
    }
}
