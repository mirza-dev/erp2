import { NextRequest, NextResponse } from "next/server";
import { dbGetPurchaseOrderById, dbReplacePurchaseOrderLines } from "@/lib/supabase/purchase-orders";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

// PUT /api/purchase-orders/[id]/lines — atomik replace (B3)
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
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

        if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
            return NextResponse.json({ error: "En az 1 line gereklidir." }, { status: 400 });
        }

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
