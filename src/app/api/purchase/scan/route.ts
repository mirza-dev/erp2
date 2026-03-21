import { NextResponse } from "next/server";
import { serviceScanPurchaseSuggestions } from "@/lib/services/purchase-service";

// POST /api/purchase/scan — tüm kritik ürünleri tarayıp purchase_recommended alert üretir
export async function POST() {
    try {
        const result = await serviceScanPurchaseSuggestions();
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/purchase/scan]", err);
        return NextResponse.json({ error: "Tarama başarısız." }, { status: 500 });
    }
}
