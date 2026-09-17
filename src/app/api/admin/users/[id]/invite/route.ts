import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";
import { parseRoles } from "@/lib/auth/permissions";
import { inviteAvailable, sendUserInvite } from "@/lib/services/user-invite-service";

function adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
}

/** `admin/users/route.ts` ile aynı guard (zero-admin bootstrap dahil, listUsers hatası fail-closed). */
async function requireAdmin(): Promise<{ error: NextResponse } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: "Yetkisiz." }, { status: 401 }) };
    const emails = adminEmails();
    if (parseRoles(user.app_metadata, user.email, emails).includes("admin")) return null;
    const svc = createServiceClient();
    const { data, error } = await svc.auth.admin.listUsers();
    if (error || !data) {
        return { error: NextResponse.json({ error: "Yetki doğrulanamadı." }, { status: 500 }) };
    }
    const anyAdmin = data.users.some(u => parseRoles(u.app_metadata, u.email, emails).includes("admin"));
    if (!anyAdmin) return null;
    return { error: NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir." }, { status: 403 }) };
}

/**
 * POST /api/admin/users/[id]/invite — daveti yeniden gönder (onboarding, 2026-09-16).
 *
 * Yalnız HİÇ giriş yapmamış kullanıcı için: davet bağlantısı süreli/tek
 * kullanımlık, kişi geç kalınca yeniden gerekiyor. Giriş yapmış kullanıcıya
 * 409 — onun yolu "Şifre sıfırla" (kendi parolası var, davet değil).
 * E-posta yapılandırılmamışsa 400 (`email_not_configured`).
 */
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const { id } = await params;
        if (!inviteAvailable()) {
            return NextResponse.json(
                { error: "E-posta gönderimi yapılandırılmamış — davet gönderilemez.", code: "email_not_configured" },
                { status: 400 },
            );
        }

        const svc = createServiceClient();
        const { data: target, error: getErr } = await svc.auth.admin.getUserById(id);
        if (getErr || !target?.user?.email) {
            return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
        }
        if (target.user.last_sign_in_at) {
            return NextResponse.json(
                { error: "Bu kullanıcı zaten giriş yapmış — davet yerine 'Şifre sıfırla' kullanın.", code: "already_signed_in" },
                { status: 409 },
            );
        }

        const actor = (await (await createClient()).auth.getUser()).data.user;
        const sent = await sendUserInvite({
            userId: target.user.id,
            email: target.user.email,
            roles: parseRoles(target.user.app_metadata, target.user.email, adminEmails()),
            inviter: { id: actor?.id ?? null, email: actor?.email ?? null },
            origin: process.env.NEXT_PUBLIC_APP_URL?.trim() || new URL(req.url).origin,
        });
        if (!sent.ok) {
            return NextResponse.json(
                { error: `Davet e-postası gönderilemedi (${sent.error}).`, code: "invite_send_failed" },
                { status: 502 },
            );
        }
        return NextResponse.json({ ok: true, email: target.user.email });
    } catch (err) {
        return handleApiError(err, "POST /api/admin/users/[id]/invite");
    }
}
