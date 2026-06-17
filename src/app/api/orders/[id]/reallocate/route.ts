import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serviceReallocateOrder, serviceGetOrder } from "@/lib/services/order-service";
import { handleApiError } from "@/lib/api-error";
import { resolveAuthContext, requirePermissionFor } from "@/lib/auth/role-guard";
import { redactOrderForPerms } from "@/lib/auth/redact";

// POST /api/orders/[id]/reallocate
// Onaylı + (partially_)allocated bir siparişin açık shortage'larını mevcut stoktan
// yeniden tahsis dener (manuel "Yeniden Rezerve Et"). Tüm shortage çözülünce sipariş
// allocated'a yükselir → sevk açılır (denetim O2; Y1 kök fix'inin manuel muadili).
export async function POST(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_sales_orders");
        if (guard) return guard;

        const { id } = await params;
        const result = await serviceReallocateOrder(id);

        revalidateTag("products", "max");

        const updated = await serviceGetOrder(id);
        const order = updated ? redactOrderForPerms(updated, ctx.perms) : null;
        return NextResponse.json({ ...result, order });
    } catch (err) {
        return handleApiError(err, "POST /api/orders/[id]/reallocate");
    }
}
