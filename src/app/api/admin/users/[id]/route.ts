import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { parseRoles, normalizeAssignedRoles } from "@/lib/auth/permissions";

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
    const svc = createServiceClient();
    const { data } = await svc.auth.admin.listUsers();
    const anyAdmin = (data?.users ?? []).some(u => parseRoles(u.app_metadata, u.email, emails).includes("admin"));
    if (!anyAdmin) return null;
    return { error: NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir." }, { status: 403 }) };
}

/**
 * Sistemdeki toplam admin sayısı (app_metadata + ADMIN_EMAILS bootstrap dahil).
 * Last-admin lockout korumasında kullanılır.
 */
async function countAdmins(svc: ReturnType<typeof createServiceClient>): Promise<{ count: number; targetIsAdmin: (id: string) => boolean }> {
    const { data } = await svc.auth.admin.listUsers();
    const emails = adminEmails();
    const adminIds = new Set(
        (data?.users ?? [])
            .filter(u => parseRoles(u.app_metadata, u.email, emails).includes("admin"))
            .map(u => u.id),
    );
    return { count: adminIds.size, targetIsAdmin: (id) => adminIds.has(id) };
}

// PATCH /api/admin/users/[id] — kullanıcının rollerini güncelle
// Body: { roles: string[] }
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
        const { roles } = parsed.data as { roles?: unknown };
        if (!Array.isArray(roles)) {
            return NextResponse.json({ error: "roles bir dizi olmalıdır." }, { status: 400 });
        }
        const newRoles = normalizeAssignedRoles(roles);

        const svc = createServiceClient();

        // Last-admin lockout guard: admin'i admin'likten düşürüyorsak ve son admin'se → 409
        const { count, targetIsAdmin } = await countAdmins(svc);
        if (targetIsAdmin(id) && !newRoles.includes("admin") && count <= 1) {
            return NextResponse.json(
                { error: "Son admin'in admin rolü kaldırılamaz." },
                { status: 409 }
            );
        }

        const { data, error } = await svc.auth.admin.updateUserById(id, {
            app_metadata: { roles: newRoles },
        });
        if (error) return handleApiError(error, "PATCH /api/admin/users/[id]");
        return NextResponse.json({ id: data.user.id, email: data.user.email, roles: newRoles });
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
