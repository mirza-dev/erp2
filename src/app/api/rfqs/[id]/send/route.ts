import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serviceSendRfq } from "@/lib/services/rfq-service";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor, actorFromAuthContext } from "@/lib/auth/role-guard";

// POST /api/rfqs/[id]/send — draft → sent; tedarikçilere PDF arşiv + e-posta.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_rfqs");
        if (guard) return guard;

        const { id } = await params;
        const result = await serviceSendRfq(id, actorFromAuthContext(ctx).label ?? "system");

        revalidateTag("rfqs", "max");
        return NextResponse.json(result);
    } catch (err) {
        if (err instanceof Error && err.message.includes("gönderilemez")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "POST /api/rfqs/[id]/send");
    }
}
