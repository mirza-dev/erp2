import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serviceCreateQuoteRevision } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

// POST /api/quotes/[id]/revise
// Faz 5: sent/rejected/expired teklifin düzenlenebilir kopyasını (revizyon) yaratır;
// kaynağı 'revised' yapar. Güvenlik: auth + demo mode middleware + Faz 8a RBAC.
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    // Faz 8a: revizyon = yeni düzenlenebilir teklif yaratır → manage_quotes (admin+sales).
    const guard = await requirePermission(req, "manage_quotes");
    if (guard) return guard;

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
