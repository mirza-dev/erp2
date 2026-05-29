import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbCreateQuote, dbListQuotes } from "@/lib/supabase/quotes";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import { mapQuoteDetail, mapQuoteSummary } from "@/lib/api-mappers";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { validateQuoteLineQuantities, validateDiscount, type QuoteLineForValidation } from "@/lib/quote-validation";

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
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as CreateQuoteInput;

        const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        // Faz 2 (V7-A11): gerçek satırlarda adet pozitif tam sayı olmalı.
        const qtyErr = validateQuoteLineQuantities((body.lines ?? []) as QuoteLineForValidation[]);
        if (qtyErr) return NextResponse.json({ error: qtyErr }, { status: 422 });

        // Faz 3 (V7): header iskonto sınırı (negatif / subtotal-üstü → 422).
        const discErr = validateDiscount(Number(body.discount_amount ?? 0), Number(body.subtotal ?? 0));
        if (discErr) return NextResponse.json({ error: discErr }, { status: 422 });

        const row = await dbCreateQuote(body);
        revalidateTag("quotes", "max");
        return NextResponse.json(mapQuoteDetail(row), { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/quotes");
    }
}
