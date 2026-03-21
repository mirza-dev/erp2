import { NextRequest, NextResponse } from "next/server";
import { aiParseEntity } from "@/lib/services/ai-service";
import type { ParseEntityInput } from "@/lib/services/ai-service";

// POST /api/ai/parse
// Body: { raw_text: string, entity_type: "customer"|"product"|"order" }
export async function POST(req: NextRequest) {
    try {
        const body: ParseEntityInput = await req.json();

        if (!body.raw_text || !body.entity_type) {
            return NextResponse.json(
                { error: "'raw_text' ve 'entity_type' zorunludur." },
                { status: 400 }
            );
        }

        if (!["customer", "product", "order"].includes(body.entity_type)) {
            return NextResponse.json(
                { error: "entity_type 'customer', 'product' veya 'order' olmalıdır." },
                { status: 400 }
            );
        }

        const result = await aiParseEntity(body);
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/ai/parse]", err);
        return NextResponse.json({ error: "Parse işlemi başarısız." }, { status: 500 });
    }
}
