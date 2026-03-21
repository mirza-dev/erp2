import { NextRequest, NextResponse } from "next/server";
import { serviceCreateProductionEntry } from "@/lib/services/production-service";
import { dbListProductionEntries } from "@/lib/supabase/production";
import { handleApiError } from "@/lib/api-error";

// GET /api/production?product_id=xxx&limit=50
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const productId = searchParams.get("product_id") ?? undefined;
        const limit = parseInt(searchParams.get("limit") ?? "50", 10);
        const entries = await dbListProductionEntries(productId, limit);
        return NextResponse.json(entries);
    } catch (err) {
        return handleApiError(err, "GET /api/production");
    }
}

// POST /api/production
// Body: { product_id, produced_qty, scrap_qty?, waste_reason?, production_date?, notes?, related_order_id? }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { product_id, produced_qty, scrap_qty, waste_reason, production_date, notes, related_order_id } = body;

        if (!product_id) return NextResponse.json({ error: "'product_id' zorunludur." }, { status: 400 });
        if (!produced_qty || produced_qty <= 0) return NextResponse.json({ error: "'produced_qty' sıfırdan büyük olmalı." }, { status: 400 });

        const result = await serviceCreateProductionEntry({
            product_id,
            produced_qty,
            scrap_qty,
            waste_reason,
            production_date,
            notes,
            related_order_id,
        });

        if (!result.success) {
            const status = result.shortages ? 409 : 400;
            return NextResponse.json({ error: result.error, shortages: result.shortages }, { status });
        }

        return NextResponse.json({ entry_id: result.entry_id }, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/production");
    }
}
