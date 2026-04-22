import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbGetQuote, dbUpdateQuote, dbDeleteQuote } from "@/lib/supabase/quotes";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import { dbFindOrderByQuoteId } from "@/lib/supabase/orders";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { handleApiError } from "@/lib/api-error";
import { serviceTransitionQuote } from "@/lib/services/quote-service";

function getCachedQuote(id: string) {
    return unstable_cache(
        async () => {
            const row = await dbGetQuote(id);
            return row ? mapQuoteDetail(row) : null;
        },
        [`quote-${id}`],
        { tags: [`quote-${id}`], revalidate: 60 }
    )();
}

// GET /api/quotes/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const data = await getCachedQuote(id);
        if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

        // Accepted tekliflerde dönüştürme durumunu kontrol et
        let convertedOrderId: string | undefined;
        let convertedOrderNumber: string | undefined;
        if (data.status === "accepted") {
            const existingOrder = await dbFindOrderByQuoteId(id);
            if (existingOrder) {
                convertedOrderId = existingOrder.id;
                convertedOrderNumber = existingOrder.order_number;
            }
        }

        return NextResponse.json({ ...data, convertedOrderId, convertedOrderNumber });
    } catch (err) {
        return handleApiError(err, "GET /api/quotes/[id]");
    }
}

// PATCH /api/quotes/[id]
// Two modes:
//   1. { transition: "sent" | "accepted" | "rejected" } → status transition
//   2. { ...document fields } → full document update
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json();

        // Status transition branch
        if ("transition" in body) {
            const result = await serviceTransitionQuote(id, body.transition);
            if (!result.success) {
                const httpStatus = result.notFound ? 404 : 409;
                return NextResponse.json({ error: result.error }, { status: httpStatus });
            }
            const updated = await dbGetQuote(id);
            revalidateTag("quotes", "max");
            revalidateTag(`quote-${id}`, "max");
            return NextResponse.json(updated ? mapQuoteDetail(updated) : null);
        }

        // Document update branch (existing behavior)
        const existing = await dbGetQuote(id);
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (existing.status !== "draft") {
            return NextResponse.json({ error: "Sadece taslak teklifler düzenlenebilir." }, { status: 409 });
        }
        const row = await dbUpdateQuote(id, body as CreateQuoteInput);
        revalidateTag("quotes", "max");
        revalidateTag(`quote-${id}`, "max");
        return NextResponse.json(mapQuoteDetail(row));
    } catch (err) {
        return handleApiError(err, "PATCH /api/quotes/[id]");
    }
}

// DELETE /api/quotes/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const existing = await dbGetQuote(id);
        if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
        if (!["draft", "sent"].includes(existing.status)) {
            return NextResponse.json(
                { error: `Cannot delete a quote with status '${existing.status}'` },
                { status: 409 }
            );
        }
        await dbDeleteQuote(id);
        revalidateTag("quotes", "max");
        revalidateTag(`quote-${id}`, "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/quotes/[id]");
    }
}
