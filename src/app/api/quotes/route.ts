import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbCreateQuote, dbListQuotes } from "@/lib/supabase/quotes";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import { mapQuoteDetail, mapQuoteSummary } from "@/lib/api-mappers";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { validateQuoteLineQuantities, validateQuoteLineNotes, validateDiscount, type QuoteLineForValidation } from "@/lib/quote-validation";
import { requirePermission, getCurrentUserPermissions } from "@/lib/auth/role-guard";
import { redactQuotesForPerms } from "@/lib/auth/redact";

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
        // RBAC (A3): view_quotes guard. Liste müşteri + teklif no + tarih (pipeline)
        // taşır; redaction yalnız fiyatı (grandTotal) maskeler. view_quotes production+
        // purchasing'de YOK + /dashboard/quotes page-access ile onlara kapalı → guard'sız
        // GET pipeline'ı sızdırıyordu. Dashboard Teklif Hattı KPI fail-soft (.catch→null).
        const guard = await requirePermission(req, "view_quotes");
        if (guard) return guard;

        const status = req.nextUrl.searchParams.get("status") ?? undefined;
        const data = await getCachedQuotes(status);
        // RBAC R3 (Faz 4 tamamlama): sales-financial — view_sales_prices yoksa grandTotal null.
        const perms = await getCurrentUserPermissions(req);
        return NextResponse.json(redactQuotesForPerms(data, perms));
    } catch (err) {
        return handleApiError(err, "GET /api/quotes");
    }
}

// POST /api/quotes
export async function POST(req: NextRequest) {
    // Faz 8a: teklif oluşturma = teklif yönetim yetkisi (admin+sales). accept precedent'i.
    const guard = await requirePermission(req, "manage_quotes");
    if (guard) return guard;

    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as CreateQuoteInput;

        const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        // Faz 2 (V7-A11): gerçek satırlarda adet pozitif tam sayı olmalı.
        const qtyErr = validateQuoteLineQuantities((body.lines ?? []) as QuoteLineForValidation[]);
        if (qtyErr) return NextResponse.json({ error: qtyErr }, { status: 422 });

        // 098: satır notu uzunluk sınırı (belge sayfa-kırpılmasını önler)
        const noteErr = validateQuoteLineNotes((body.lines ?? []) as QuoteLineForValidation[]);
        if (noteErr) return NextResponse.json({ error: noteErr }, { status: 422 });

        // Faz 3 (V7): header iskonto sınırı (negatif / subtotal-üstü → 422).
        const discountAmount = Number(body.discount_amount ?? 0);
        const discErr = validateDiscount(discountAmount, Number(body.subtotal ?? 0));
        if (discErr) return NextResponse.json({ error: discErr }, { status: 422 });
        // Payload'ı normalize et: validasyon sonrası finite garanti → number'a çevir
        // ("" → 0, "100" → 100). RPC COALESCE((...)::numeric) string'de patlamasın (NULLIF yok).
        body.discount_amount = discountAmount;

        const row = await dbCreateQuote(body);
        revalidateTag("quotes", "max");
        return NextResponse.json(mapQuoteDetail(row), { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/quotes");
    }
}
