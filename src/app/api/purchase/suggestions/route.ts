import { NextResponse } from "next/server";
import { serviceListPurchaseSuggestions } from "@/lib/services/purchase-service";

// GET /api/purchase/suggestions — açık purchase_recommended alertleri döner
export async function GET() {
    try {
        const suggestions = await serviceListPurchaseSuggestions();
        return NextResponse.json(suggestions);
    } catch (err) {
        console.error("[GET /api/purchase/suggestions]", err);
        return NextResponse.json({ error: "Öneriler alınamadı." }, { status: 500 });
    }
}
