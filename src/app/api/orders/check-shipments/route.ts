import { NextResponse } from "next/server";
import { serviceCheckOverdueShipments } from "@/lib/services/alert-service";
import { handleApiError } from "@/lib/api-error";

export async function POST() {
    try {
        const result = await serviceCheckOverdueShipments();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/orders/check-shipments");
    }
}
