import { NextRequest, NextResponse } from "next/server";
import {
    serviceListOrders,
    serviceCreateOrder,
    validateOrderCreate,
} from "@/lib/services/order-service";
import { aiScoreOrder } from "@/lib/services/ai-service";
import type { CommercialStatus } from "@/lib/database.types";
import type { CreateOrderInput } from "@/lib/supabase/orders";
import { handleApiError } from "@/lib/api-error";

// GET /api/orders?commercial_status=approved&customer_id=xxx&page=1
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const status = searchParams.get("commercial_status") as CommercialStatus | null;
        const customer_id = searchParams.get("customer_id") ?? undefined;
        const page = parseInt(searchParams.get("page") ?? "1");

        const orders = await serviceListOrders({
            commercial_status: status ?? undefined,
            customer_id,
            page,
        });

        return NextResponse.json(orders);
    } catch (err) {
        return handleApiError(err, "GET /api/orders");
    }
}

// POST /api/orders — creates a new order (draft or pending_approval)
export async function POST(req: NextRequest) {
    try {
        const body: CreateOrderInput = await req.json();

        const validation = validateOrderCreate(body);
        if (!validation.valid) {
            return NextResponse.json({ errors: validation.errors }, { status: 400 });
        }

        const result = await serviceCreateOrder(body);

        // Fire-and-forget AI scoring — don't block the response
        aiScoreOrder(result.id).catch(err =>
            console.error("[AI Score] fire-and-forget:", err)
        );

        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/orders");
    }
}
