import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import { handleApiError } from "@/lib/api-error";

async function requireAdmin(): Promise<{ error: NextResponse } | null> {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: NextResponse.json({ error: "Yetkisiz." }, { status: 401 }) };
    const allowed = (process.env.ADMIN_EMAILS ?? "").split(",").map(e => e.trim()).filter(Boolean);
    if (allowed.length > 0 && !allowed.includes(user.email ?? "")) {
        return { error: NextResponse.json({ error: "Bu işlem için admin yetkisi gereklidir." }, { status: 403 }) };
    }
    return null;
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
        const { error } = await supabase.auth.admin.deleteUser(id);
        if (error) return handleApiError(error, "DELETE /api/admin/users/[id]");
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/admin/users/[id]");
    }
}
