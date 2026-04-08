import { NextRequest, NextResponse } from "next/server";
import {
    dbListCommitments,
    dbCreateCommitment,
} from "@/lib/supabase/purchase-commitments";
import { handleApiError } from "@/lib/api-error";

// GET /api/purchase-commitments?product_id=xxx&status=pending
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = req.nextUrl;
        const product_id = searchParams.get("product_id") ?? undefined;
        const status     = searchParams.get("status") ?? undefined;

        const commitments = await dbListCommitments({ product_id, status });
        return NextResponse.json(commitments);
    } catch (err) {
        return handleApiError(err, "GET /api/purchase-commitments");
    }
}

// POST /api/purchase-commitments
// Body: { product_id, quantity, expected_date, supplier_name?, notes? }
export async function POST(req: NextRequest) {
    try {
        const body = await req.json();

        if (!body.product_id?.trim()) {
            return NextResponse.json({ error: "product_id zorunludur." }, { status: 400 });
        }
        if (!body.quantity || body.quantity <= 0) {
            return NextResponse.json({ error: "quantity sıfırdan büyük olmalıdır." }, { status: 400 });
        }
        if (!body.expected_date?.trim()) {
            return NextResponse.json({ error: "expected_date zorunludur." }, { status: 400 });
        }

        const commitment = await dbCreateCommitment({
            product_id:    body.product_id,
            quantity:      body.quantity,
            expected_date: body.expected_date,
            supplier_name: body.supplier_name ?? undefined,
            notes:         body.notes ?? undefined,
        });

        return NextResponse.json(commitment, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/purchase-commitments");
    }
}
