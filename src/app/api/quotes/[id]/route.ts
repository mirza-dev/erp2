import { NextRequest, NextResponse } from "next/server";
import { unstable_cache, revalidateTag } from "next/cache";
import { dbGetQuote, dbUpdateQuote, dbDeleteQuote, dbListQuoteChain } from "@/lib/supabase/quotes";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import { dbFindOrderByQuoteId } from "@/lib/supabase/orders";
import { mapQuoteDetail } from "@/lib/api-mappers";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { validateQuoteLineQuantities, validateDiscount, type QuoteLineForValidation } from "@/lib/quote-validation";
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

        // Faz 5: revizyon zinciri bağları. revisedBy = bu teklif 'revised' ise
        // zincirin en yeni üyesi (en güncele git); revisionOf = revizyonsa kök.
        let revisedBy: { id: string; quoteNumber: string } | null = null;
        let revisionOf: { id: string; quoteNumber: string } | null = null;
        const isRevised = data.status === "revised";
        const isRevision = data.revisionNo > 1;
        if (isRevised || isRevision) {
            const root = data.rootQuoteId ?? id;
            const chain = await dbListQuoteChain(root);
            if (isRevised) {
                const latest = chain[chain.length - 1];
                if (latest && latest.id !== id) {
                    revisedBy = { id: latest.id, quoteNumber: latest.quote_number };
                }
            }
            if (isRevision) {
                const rootRow = chain.find(c => c.id === root);
                if (rootRow) revisionOf = { id: rootRow.id, quoteNumber: rootRow.quote_number };
            }
        }

        return NextResponse.json({ ...data, convertedOrderId, convertedOrderNumber, revisedBy, revisionOf });
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
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        // Status transition branch
        if ("transition" in body) {
            const result = await serviceTransitionQuote(id, body.transition as "sent" | "accepted" | "rejected");
            if (!result.success) {
                // Faz 2 (V4-A2/V4-A4): send-time validasyon → 422; transition map ihlali → 409.
                const httpStatus = result.notFound ? 404 : result.validationFailed ? 422 : 409;
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
        // Faz 4a Review (2026-05-23): POST ile parity — yeni serbest text alanları
        // (delivery_method, payment_method) + mevcut notes/customer fields için
        // string length guard. Helper recursive tarama yapar, lines[].size_text
        // gibi nested alanları da kapsar.
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        // Faz 2 (V7-A11): POST ile parity — gerçek satırlarda adet pozitif tam sayı.
        const qtyErr = validateQuoteLineQuantities((body.lines ?? []) as QuoteLineForValidation[]);
        if (qtyErr) return NextResponse.json({ error: qtyErr }, { status: 422 });

        // Faz 3 (V7): header iskonto sınırı (negatif / subtotal-üstü → 422).
        const discountAmount = Number(body.discount_amount ?? 0);
        const discErr = validateDiscount(discountAmount, Number(body.subtotal ?? 0));
        if (discErr) return NextResponse.json({ error: discErr }, { status: 422 });
        // Payload'ı normalize et ("" → 0): RPC numeric cast string'de patlamasın (NULLIF yok).
        body.discount_amount = discountAmount;

        const row = await dbUpdateQuote(id, body as unknown as CreateQuoteInput);
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
