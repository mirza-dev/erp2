import { NextRequest, NextResponse } from "next/server";
import {
    dbRecordMovementAtomic,
    dbTryResolveShortages,
    dbListMovements,
    type RecordMovementInput,
} from "@/lib/supabase/products";

// GET /api/inventory/movements?product_id=xxx&limit=50
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const productId = searchParams.get("product_id");
        const limit = parseInt(searchParams.get("limit") ?? "50");

        if (!productId) {
            return NextResponse.json({ error: "product_id zorunludur." }, { status: 400 });
        }

        const movements = await dbListMovements(productId, limit);
        return NextResponse.json(movements);
    } catch (err) {
        console.error("[GET /api/inventory/movements]", err);
        return NextResponse.json({ error: "Hareketler alınamadı." }, { status: 500 });
    }
}

// POST /api/inventory/movements — manual stock adjustment or receipt
export async function POST(req: NextRequest) {
    try {
        const body: RecordMovementInput = await req.json();

        if (!body.product_id) {
            return NextResponse.json({ error: "product_id zorunludur." }, { status: 400 });
        }
        if (!body.quantity || body.quantity === 0) {
            return NextResponse.json({ error: "Miktar 0 olamaz." }, { status: 400 });
        }
        if (!["production", "receipt", "adjustment"].includes(body.movement_type)) {
            return NextResponse.json({ error: "Geçersiz hareket tipi." }, { status: 400 });
        }

        const result = await dbRecordMovementAtomic(body);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 409 });
        }

        // Stock receipt → try resolving open shortages (non-fatal)
        if (body.quantity > 0) {
            try {
                await dbTryResolveShortages(body.product_id);
            } catch {
                console.warn("[POST /api/inventory/movements] shortage resolution failed (non-fatal)", body.product_id);
            }
        }

        return NextResponse.json({ ok: true, new_on_hand: result.new_on_hand }, { status: 201 });
    } catch (err) {
        console.error("[POST /api/inventory/movements]", err);
        return NextResponse.json({ error: "Hareket kaydedilemedi." }, { status: 500 });
    }
}
