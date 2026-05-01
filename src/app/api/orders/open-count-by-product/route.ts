import { NextResponse } from "next/server";
import { dbGetOpenOrderCountByProduct } from "@/lib/supabase/orders";
import { handleApiError } from "@/lib/api-error";

export async function GET() {
    try {
        const map = await dbGetOpenOrderCountByProduct();
        return NextResponse.json(Object.fromEntries(map));
    } catch (err) {
        return handleApiError(err, "GET /api/orders/open-count-by-product");
    }
}
