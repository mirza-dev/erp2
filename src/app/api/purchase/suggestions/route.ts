import { NextRequest, NextResponse } from "next/server";
import { serviceListPurchaseSuggestions } from "@/lib/services/purchase-service";
import { requirePermission } from "@/lib/auth/role-guard";

// GET /api/purchase/suggestions — açık purchase_recommended alertleri döner
export async function GET(req: NextRequest) {
    const guard = await requirePermission(req, "view_purchase_suggestions");
    if (guard) return guard;

    try {
        const suggestions = await serviceListPurchaseSuggestions();
        return NextResponse.json(suggestions);
    } catch (err) {
        console.error("[GET /api/purchase/suggestions]", err);
        return NextResponse.json({ error: "Öneriler alınamadı." }, { status: 500 });
    }
}
