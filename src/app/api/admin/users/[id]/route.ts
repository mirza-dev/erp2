import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { handleApiError } from "@/lib/api-error";

// DELETE /api/admin/users/[id] — kullanıcıyı sil
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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
