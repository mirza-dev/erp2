import { NextRequest, NextResponse } from "next/server";
import { dbSoftDeleteCompanyFile } from "@/lib/supabase/company-files";
import { requirePermission } from "@/lib/auth/role-guard";
import { handleApiError } from "@/lib/api-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// DELETE /api/settings/files/[id] — 30 gün soft-delete (deleted_at damgası).
// Storage objesi bilinçli olarak silinmez; satır listeden düşer.
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "manage_settings");
        if (guard) return guard;

        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "Geçersiz dosya id." }, { status: 400 });
        }

        const deleted = await dbSoftDeleteCompanyFile(id);
        if (!deleted) {
            return NextResponse.json({ error: "Dosya bulunamadı." }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/settings/files/[id]");
    }
}
