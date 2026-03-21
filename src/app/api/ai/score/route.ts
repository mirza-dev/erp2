import { NextRequest, NextResponse } from "next/server";
import { aiScoreOrder } from "@/lib/services/ai-service";

// POST /api/ai/score
// Body: { order_id: string }
export async function POST(req: NextRequest) {
    try {
        const { order_id } = await req.json() as { order_id: string };

        if (!order_id) {
            return NextResponse.json(
                { error: "'order_id' zorunludur." },
                { status: 400 }
            );
        }

        const result = await aiScoreOrder(order_id);
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/ai/score]", err);
        const message = err instanceof Error ? err.message : "Score işlemi başarısız.";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
