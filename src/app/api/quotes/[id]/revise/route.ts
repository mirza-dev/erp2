import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serviceCreateQuoteRevision } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/quotes/[id]/revise
// Faz 5: sent/rejected/expired teklifin düzenlenebilir kopyasını (revizyon) yaratır;
// kaynağı 'revised' yapar. Güvenlik: auth + demo mode middleware tarafından korunur.
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const result = await serviceCreateQuoteRevision(id);

        if (!result.success) {
            const status = result.notFound ? 404
                : result.invalidStatus ? 409
                : 400;
            return NextResponse.json({ error: result.error }, { status });
        }

        revalidateTag("quotes", "max");
        revalidateTag(`quote-${id}`, "max");

        return NextResponse.json({
            newQuoteId: result.newQuoteId,
            newQuoteNumber: result.newQuoteNumber,
        }, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/[id]/revise");
    }
}
