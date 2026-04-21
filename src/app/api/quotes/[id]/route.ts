import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbGetQuote, dbUpdateQuote, dbDeleteQuote } from "@/lib/supabase/quotes";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { handleApiError } from "@/lib/api-error";

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
        return NextResponse.json(data);
    } catch (err) {
        return handleApiError(err, "GET /api/quotes/[id]");
    }
}

// PATCH /api/quotes/[id]
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await req.json() as CreateQuoteInput;
        const row = await dbUpdateQuote(id, body);
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
        await dbDeleteQuote(id);
        revalidateTag("quotes", "max");
        revalidateTag(`quote-${id}`, "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/quotes/[id]");
    }
}
