import { NextRequest, NextResponse } from "next/server";
import { serviceScanPurchaseSuggestions } from "@/lib/services/purchase-service";
import { requirePermission } from "@/lib/auth/role-guard";

// POST /api/purchase/scan — tüm kritik ürünleri tarayıp purchase_recommended alert üretir
export async function POST(req: NextRequest) {
    try {
        const guard = await requirePermission(req, "manage_purchase_suggestions");
        if (guard) return guard;

        const result = await serviceScanPurchaseSuggestions();
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/purchase/scan]", err);
        return NextResponse.json({ error: "Tarama başarısız." }, { status: 500 });
    }
}
