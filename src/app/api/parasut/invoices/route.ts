import { NextRequest, NextResponse } from "next/server";
import { dbListSyncedOrders } from "@/lib/supabase/orders";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

// GET /api/parasut/invoices
export async function GET(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "view_parasut");
        if (guard) return guard;

        const orders = await dbListSyncedOrders(20);
        return NextResponse.json(orders);
    } catch (err) {
        return handleApiError(err, "GET /api/parasut/invoices");
    }
}
