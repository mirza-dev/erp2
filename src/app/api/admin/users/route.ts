import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { parseRoles, normalizeAssignedRoles } from "@/lib/auth/permissions";

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
    const svc = createServiceClient();
    const { data } = await svc.auth.admin.listUsers();
    const anyAdmin = (data?.users ?? []).some(u => parseRoles(u.app_metadata, u.email, emails).includes("admin"));
    if (!anyAdmin) return null;
    return { error: NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir." }, { status: 403 }) };
}

// GET /api/admin/users — tüm kullanıcıları listele
export async function GET() {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const supabase = createServiceClient();
        const { data, error } = await supabase.auth.admin.listUsers();
        if (error) return handleApiError(error, "GET /api/admin/users");
        return NextResponse.json(
            data.users.map((u) => ({
                id: u.id,
                email: u.email,
                created_at: u.created_at,
                last_sign_in_at: u.last_sign_in_at ?? null,
                roles: parseRoles(u.app_metadata, u.email, adminEmails()),
            }))
        );
    } catch (err) {
        return handleApiError(err, "GET /api/admin/users");
    }
}

// POST /api/admin/users — yeni kullanıcı oluştur
// Body: { email: string, password: string }
export async function POST(req: NextRequest) {
    const adminCheck = await requireAdmin();
    if (adminCheck) return adminCheck.error;
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const { email, password, roles } = parsed.data as { email?: string; password?: string; roles?: unknown };

        if (!email?.trim()) {
            return NextResponse.json({ error: "E-posta zorunludur." }, { status: 400 });
        }
        if (!password || password.length < 8) {
            return NextResponse.json(
                { error: "Şifre en az 8 karakter olmalıdır." },
                { status: 400 }
            );
        }

        // RBAC Faz 5: roller normalize (verilmezse → ["viewer"], sessiz yetki YOK)
        const assignedRoles = normalizeAssignedRoles(roles);

        const supabase = createServiceClient();
        const { data, error } = await supabase.auth.admin.createUser({
            email: email.trim(),
            password,
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

        return NextResponse.json(
            { id: data.user.id, email: data.user.email, roles: assignedRoles },
            { status: 201 }
        );
    } catch (err) {
        return handleApiError(err, "POST /api/admin/users");
    }
}
