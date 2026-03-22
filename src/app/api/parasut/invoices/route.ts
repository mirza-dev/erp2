import { NextResponse } from "next/server";
import { dbListSyncedOrders } from "@/lib/supabase/orders";
import { handleApiError } from "@/lib/api-error";

// GET /api/parasut/invoices
export async function GET() {
    try {
        const orders = await dbListSyncedOrders(20);
        return NextResponse.json(orders);
    } catch (err) {
        return handleApiError(err, "GET /api/parasut/invoices");
    }
}
