import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbResolveMaintenanceIncident } from "@/lib/supabase/email-maintenance";

export async function PATCH(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;
        if (!auth.userId) return NextResponse.json({ error: "Yetkisiz." }, { status: 401 });
        const resolved = await dbResolveMaintenanceIncident((await params).id, auth.userId);
        return resolved
            ? NextResponse.json({ ok: true })
            : NextResponse.json({ error: "Açık bakım kaydı bulunamadı." }, { status: 404 });
    } catch (err) {
        return handleApiError(err, "PATCH /api/maintenance/incidents/[id]");
    }
}
