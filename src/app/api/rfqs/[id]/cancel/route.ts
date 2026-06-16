import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { dbCancelRfq } from "@/lib/supabase/supplier-rfqs";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor, actorFromAuthContext } from "@/lib/auth/role-guard";

// POST /api/rfqs/[id]/cancel
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_rfqs");
        if (guard) return guard;

        const { id } = await params;
        const parsed = await safeParseJson(req);
        const reason = parsed.ok ? String((parsed.data as Record<string, unknown>).reason ?? "") : "";

        await dbCancelRfq(id, reason, actorFromAuthContext(ctx).label ?? "system");

        revalidateTag("rfqs", "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("iptal edilemez")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "POST /api/rfqs/[id]/cancel");
    }
}
