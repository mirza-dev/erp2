import { NextRequest, NextResponse } from "next/server";
import { serviceSyncOrderToParasut } from "@/lib/services/parasut-service";

// POST /api/parasut/sync
// Body: { order_id: string }
export async function POST(req: NextRequest) {
    try {
        const { order_id } = await req.json() as { order_id: string };
        if (!order_id) {
            return NextResponse.json({ error: "'order_id' zorunludur." }, { status: 400 });
        }

        const result = await serviceSyncOrderToParasut(order_id);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/parasut/sync]", err);
        return NextResponse.json({ error: "Sync başarısız." }, { status: 500 });
    }
}
