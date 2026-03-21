import { NextRequest, NextResponse } from "next/server";
import {
    serviceListOrders,
    serviceCreateOrder,
    validateOrderCreate,
} from "@/lib/services/order-service";
import type { CommercialStatus } from "@/lib/database.types";
import type { CreateOrderInput } from "@/lib/supabase/orders";

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
        console.error("[GET /api/orders]", err);
        return NextResponse.json({ error: "Siparişler alınamadı." }, { status: 500 });
    }
}

// POST /api/orders — creates a new draft order
export async function POST(req: NextRequest) {
    try {
        const body: CreateOrderInput = await req.json();

        const validation = validateOrderCreate(body);
        if (!validation.valid) {
            return NextResponse.json({ errors: validation.errors }, { status: 400 });
        }

        const result = await serviceCreateOrder(body);
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        console.error("[POST /api/orders]", err);
        return NextResponse.json({ error: "Sipariş oluşturulamadı." }, { status: 500 });
    }
}
