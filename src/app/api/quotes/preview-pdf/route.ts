import { NextRequest, NextResponse } from "next/server";
import type { QuoteData } from "@/app/dashboard/quotes/components/quote-types";
import { renderQuotePdfBuffer, quotePdfFilename } from "@/lib/quote-pdf";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { validateQuoteLineNotes } from "@/lib/quote-validation";
import { requirePermission } from "@/lib/auth/role-guard";

// POST /api/quotes/preview-pdf
// Önizleme/Yazdır için, e-postada gönderilen ile BİREBİR aynı motoru
// (renderQuotePdfBuffer, @react-pdf) kullanır → not sayfalar arası gerçek bölünür
// (Chrome HTML-tablo print'inin kıramadığı). Salt-önizleme; mutation yok.
export async function POST(req: NextRequest) {
    const guard = await requirePermission(req, "view_quotes");
    if (guard) return guard;

    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const data = parsed.data as QuoteData;

        const lengthErr = validateStringLengths(data as unknown as Record<string, unknown>);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        // 098: satır notu uzunluk sınırı — kaydetme yoluyla parite (QuoteData.rows[].note).
        const noteErr = validateQuoteLineNotes((data.rows ?? []).map(r => ({ note: r.note })));
        if (noteErr) return NextResponse.json({ error: noteErr }, { status: 422 });

        const buffer = await renderQuotePdfBuffer(data);
        const filename = quotePdfFilename(data.quoteNo);
        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `inline; filename="${filename}"`,
                "Cache-Control": "no-store",
            },
        });
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/preview-pdf");
    }
}
