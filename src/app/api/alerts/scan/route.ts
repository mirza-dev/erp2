import { NextResponse } from "next/server";
import { serviceScanStockAlerts } from "@/lib/services/alert-service";

// POST /api/alerts/scan — scans all products and creates/resolves stock alerts
export async function POST() {
    try {
        const result = await serviceScanStockAlerts();
        return NextResponse.json(result);
    } catch (err) {
        console.error("[POST /api/alerts/scan]", err);
        return NextResponse.json({ error: "Tarama başarısız." }, { status: 500 });
    }
}
