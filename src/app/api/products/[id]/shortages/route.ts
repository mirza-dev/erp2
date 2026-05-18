import { NextRequest, NextResponse } from "next/server";
import { dbGetOpenShortagesByProductId } from "@/lib/supabase/products";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/[id]/shortages
// Returns open shortage detail rows (order_id/order_number/customer_name/qty)
// for a product. Used by the order_shortage alert drawer (Faz 10 §9.4.4).
// Auth: session via middleware (/api/** protected); demo mode allowed (GET only).
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const rows = await dbGetOpenShortagesByProductId(id);

        return NextResponse.json({
            items: rows,
            totalShortage: rows.reduce((sum, r) => sum + r.shortageQty, 0),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/shortages");
    }
}
