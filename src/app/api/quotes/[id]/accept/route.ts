import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { serviceAcceptQuoteToOrder } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/quotes/[id]/accept
// Faz 6 (V5-A4 / V4-A8): kabul + taslak sipariş TEK atomik işlem (RPC 077).
// Eski iki yol — PATCH { transition: "accepted" } ve POST /convert — 410 Gone.
// Güvenlik: auth + demo mode middleware tarafından korunur (POST demo → 403).
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const result = await serviceAcceptQuoteToOrder(id, user?.id);

        if (!result.success) {
            const status = result.notFound ? 404
                : result.invalidStatus ? 409
                : result.archiveFailed ? 502
                : result.expired ? 400
                : result.unprocessable ? 422
                : 400;
            return NextResponse.json({ error: result.error }, { status });
        }

        revalidateTag("quotes", "max");
        revalidateTag(`quote-${id}`, "max");
        revalidateTag("orders", "max");
        revalidateTag("products", "max");

        return NextResponse.json({
            orderId: result.orderId,
            orderNumber: result.orderNumber,
            already: result.already,
        }, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/[id]/accept");
    }
}
