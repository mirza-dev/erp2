import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceConvertQuoteToOrder } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

// POST /api/quotes/[id]/convert
// Kabul edilmiş teklifi taslak siparişe dönüştürür.
// Güvenlik: auth + demo mode middleware + manage_quotes (RBAC R1).
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const guard = await requirePermission(_req, "manage_quotes");
        if (guard) return guard;

        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const result = await serviceConvertQuoteToOrder(id, user?.id);

        if (!result.success) {
            const status = result.notFound ? 404
                : result.alreadyConverted ? 409
                : 400;
            return NextResponse.json(
                {
                    error: result.error,
                    existingOrderId: result.existingOrderId,
                    existingOrderNumber: result.existingOrderNumber,
                },
                { status }
            );
        }

        revalidateTag("quotes", "max");
        revalidateTag(`quote-${id}`, "max");
        revalidateTag("orders", "max");
        revalidateTag("products", "max");

        return NextResponse.json({
            orderId: result.orderId,
            orderNumber: result.orderNumber,
            warnings: result.warnings,
        }, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/[id]/convert");
    }
}
