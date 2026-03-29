import { NextRequest, NextResponse } from "next/server";
import { dbDeleteCustomer } from "@/lib/supabase/customers";
import { dbCountOrdersByCustomer } from "@/lib/supabase/orders";
import { handleApiError } from "@/lib/api-error";

// DELETE /api/customers/[id]
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const orderCount = await dbCountOrdersByCustomer(id);
        if (orderCount > 0) {
            return NextResponse.json(
                { error: `Bu müşteriye ait ${orderCount} sipariş var. Önce siparişleri silin.` },
                { status: 409 }
            );
        }
        await dbDeleteCustomer(id);
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "DELETE /api/customers/[id]");
    }
}
