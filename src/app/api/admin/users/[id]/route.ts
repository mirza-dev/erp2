import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { parseRoles, normalizeAssignedRoles } from "@/lib/auth/permissions";
import { checkPasswordPolicy } from "@/lib/auth/password-policy";

function adminEmails(): string[] {
    return (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
}

async function requireAdmin(): Promise<{ error: NextResponse } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: "Yetkisiz." }, { status: 401 }) };
    const emails = adminEmails();
    if (parseRoles(user.app_metadata, user.email, emails).includes("admin")) return null;
    // Zero-admin bootstrap (route.ts ile aynı): sistemde hiç admin yoksa ilk
    // authd kullanıcıya izin; ilk admin atanınca kapanır → brick-proof.
    // R4 fix: listUsers HATASI fail-CLOSED — hata varsa "admin yok" varsayıp
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

/**
 * Sistemdeki toplam admin sayısı (app_metadata + ADMIN_EMAILS bootstrap dahil).
 * Last-admin lockout korumasında kullanılır.
 */
async function countAdmins(svc: ReturnType<typeof createServiceClient>): Promise<{ count: number; targetIsAdmin: (id: string) => boolean }> {
    const { data, error } = await svc.auth.admin.listUsers();
    // R4 fix: listUsers hatası fail-CLOSED — count=0 dönmek last-admin lockout'u
    // bypass ettirir (son admin demote/sil edilebilir). Hata → throw → 500.
    if (error || !data) throw new Error("Admin sayımı yapılamadı (listUsers).");
    const emails = adminEmails();
    const adminIds = new Set(
        data.users
            .filter(u => parseRoles(u.app_metadata, u.email, emails).includes("admin"))
            .map(u => u.id),
    );
    return { count: adminIds.size, targetIsAdmin: (id) => adminIds.has(id) };
}

// PATCH /api/admin/users/[id] — rolleri ve/veya şifreyi güncelle
// Body: { roles?: string[], password?: string }  (en az biri zorunlu)
//
// ŞİFRE KOLU NEDEN VAR (2026-08-31, madde #4): self-servis sıfırlama e-posta
// teslimine bağlı — `EMAIL_FROM` boşken ve Supabase'in yerleşik SMTP'si saatte
// birkaç mailde tıkanırken tek güvenilir kurtarma yolu bu. Yeni bir yetki yüzeyi
// AÇMAZ: admin bu kullanıcıyı zaten silip yeniden oluşturabiliyor.
//
// Şifre kolu `checkPasswordPolicy`'den geçer — admin'in belirlediği şifre,
// kullanıcının kendi belirlediğinden daha zayıf olamaz.
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const { id } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const { roles, password } = parsed.data as { roles?: unknown; password?: unknown };

        const wantsRoles = roles !== undefined;
        const wantsPassword = password !== undefined;
        if (!wantsRoles && !wantsPassword) {
            return NextResponse.json({ error: "roles veya password gerekli." }, { status: 400 });
        }
        if (wantsRoles && !Array.isArray(roles)) {
            return NextResponse.json({ error: "roles bir dizi olmalıdır." }, { status: 400 });
        }

        const svc = createServiceClient();
        const update: { app_metadata?: { roles: string[] }; password?: string } = {};
        let newRoles: string[] | null = null;

        if (wantsRoles) {
            newRoles = normalizeAssignedRoles(roles as unknown[]);

            // Last-admin lockout guard: admin'i admin'likten düşürüyorsak ve son admin'se → 409
            const { count, targetIsAdmin } = await countAdmins(svc);
            if (targetIsAdmin(id) && !newRoles.includes("admin") && count <= 1) {
                return NextResponse.json(
                    { error: "Son admin'in admin rolü kaldırılamaz." },
                    { status: 409 }
                );
            }
            update.app_metadata = { roles: newRoles };
        }

        if (wantsPassword) {
            // Politika bağlamı hedefin KENDİ e-postası — "kendi adresini şifre yapma"
            // kuralı admin sıfırlamasında da geçerli olsun.
            const { data: target, error: lookupError } = await svc.auth.admin.getUserById(id);
            if (lookupError || !target?.user) {
                return NextResponse.json({ error: "Kullanıcı bulunamadı." }, { status: 404 });
            }
            const policyError = checkPasswordPolicy(
                typeof password === "string" ? password : "",
                { email: target.user.email },
            );
            if (policyError) {
                return NextResponse.json({ error: policyError }, { status: 400 });
            }
            update.password = password as string;
        }

        const { data, error } = await svc.auth.admin.updateUserById(id, update);
        if (error) return handleApiError(error, "PATCH /api/admin/users/[id]");

        if (wantsPassword) {
            // Başkasının şifresini değiştirmek iz bırakmalı — kim, kime, ne zaman.
            try {
                const actor = (await (await createClient()).auth.getUser()).data.user;
                await svc.from("audit_log").insert({
                    actor: actor?.email ?? null,
                    action: "password_reset_by_admin",
                    entity_type: "user",
                    entity_id: null,
                    source: "ui",
                    before_state: null,
                    after_state: { user_id: id, email: data.user.email },
                });
            } catch {
                /* non-fatal — şifre değişti, log eksik kalabilir */
            }
        }

        return NextResponse.json({
            id: data.user.id,
            email: data.user.email,
            roles: newRoles ?? parseRoles(data.user.app_metadata, data.user.email, adminEmails()),
            passwordReset: wantsPassword,
        });
    } catch (err) {
        return handleApiError(err, "PATCH /api/admin/users/[id]");
    }
}

// DELETE /api/admin/users/[id] — kullanıcıyı sil
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const { id } = await params;
        const supabase = createServiceClient();

        // Last-admin lockout guard: son admin'i silme → 409
        const { count, targetIsAdmin } = await countAdmins(supabase);
        if (targetIsAdmin(id) && count <= 1) {
            return NextResponse.json(
                { error: "Son admin kullanıcı silinemez." },
                { status: 409 }
            );
        }

        const { error } = await supabase.auth.admin.deleteUser(id);
        if (error) return handleApiError(error, "DELETE /api/admin/users/[id]");
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/admin/users/[id]");
    }
}
