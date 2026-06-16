import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { dbAwardRfq } from "@/lib/supabase/supplier-rfqs";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { validateRfqAwards } from "@/lib/rfq-validation";
import { resolveAuthContext, requirePermissionFor, actorFromAuthContext } from "@/lib/auth/role-guard";

// POST /api/rfqs/[id]/award — kazanan kalemleri PO('lara) çevir.
// Hem RFQ yönetimi hem PO oluşturma yetkisi gerekir (PO doğurur).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const rfqGuard = requirePermissionFor(ctx, "manage_rfqs");
        if (rfqGuard) return rfqGuard;
        const poGuard = requirePermissionFor(ctx, "manage_purchase_orders");
        if (poGuard) return poGuard;

        const { id } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const awardsErr = validateRfqAwards(body.awards);
        if (awardsErr) return NextResponse.json({ error: awardsErr }, { status: 400 });

        const pos = await dbAwardRfq(
            id,
            body.awards as Parameters<typeof dbAwardRfq>[1],
            actorFromAuthContext(ctx).label ?? "system",
        );

        revalidateTag("rfqs", "max");
        revalidateTag("purchase-orders", "max");
        return NextResponse.json({ pos }, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("karara bağlanamaz") ||
            err.message.includes("kazanan kalem")
        )) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "POST /api/rfqs/[id]/award");
    }
}
