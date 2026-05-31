import { NextRequest, NextResponse } from "next/server";
import { dbReverseProduction } from "@/lib/supabase/production";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// DELETE /api/production/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const guard = await requirePermission(_req, "manage_production");
        if (guard) return guard;

        const { id } = await params;
        const result = await dbReverseProduction(id);
        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 409 });
        }
        revalidateTag("products", "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/production/[id]");
    }
}
