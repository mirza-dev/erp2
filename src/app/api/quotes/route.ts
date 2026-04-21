import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbCreateQuote, dbListQuotes } from "@/lib/supabase/quotes";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import { mapQuoteDetail, mapQuoteSummary } from "@/lib/api-mappers";
import { handleApiError } from "@/lib/api-error";

const getCachedQuotes = unstable_cache(
    async (status?: string) => {
        const rows = await dbListQuotes(status ? { status } : {});
        return rows.map(mapQuoteSummary);
    },
    ["quotes"],
    { tags: ["quotes"], revalidate: 30 }
);

// GET /api/quotes?status=draft
export async function GET(req: NextRequest) {
    try {
        const status = req.nextUrl.searchParams.get("status") ?? undefined;
        const data = await getCachedQuotes(status);
        return NextResponse.json(data);
    } catch (err) {
        return handleApiError(err, "GET /api/quotes");
    }
}

// POST /api/quotes
export async function POST(req: NextRequest) {
    try {
        const body = await req.json() as CreateQuoteInput;
        const row = await dbCreateQuote(body);
        revalidateTag("quotes", "max");
        return NextResponse.json(mapQuoteDetail(row), { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/quotes");
    }
}
