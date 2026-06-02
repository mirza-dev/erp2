import { NextRequest, NextResponse } from "next/server";
import { dbGetPurchaseOrderById, dbReplacePurchaseOrderLines, validatePoLines } from "@/lib/supabase/purchase-orders";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { validateStringLengths } from "@/lib/validation/string-lengths";
import { requirePermission } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// PUT /api/purchase-orders/[id]/lines — atomik replace (B3)
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "manage_purchase_orders");
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetPurchaseOrderById(id);
        if (!existing) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });

        if (existing.status !== "draft") {
            return NextResponse.json(
                { error: "PO line'ları sadece draft durumunda değiştirilebilir." },
                { status: 409 },
            );
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;

        const lenErr = validateStringLengths(body);
        if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });

        const linesErr = validatePoLines(body.lines);
        if (linesErr) return NextResponse.json({ error: linesErr }, { status: 400 });

        const actor = (body.actor as string | undefined) ?? "system";

        await dbReplacePurchaseOrderLines(
            id,
            body.lines as Parameters<typeof dbReplacePurchaseOrderLines>[1],
            actor,
        );

        revalidateTag("purchase-orders", "max");
        const updated = await dbGetPurchaseOrderById(id);
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("line replace edilemez") ||
            err.message.includes("en az 1 line")
        )) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "PUT /api/purchase-orders/[id]/lines");
    }
}
