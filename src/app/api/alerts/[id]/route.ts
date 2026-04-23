import { NextRequest, NextResponse } from "next/server";
import { serviceGetAlert, serviceUpdateAlertStatus } from "@/lib/services/alert-service";
import { safeParseJson } from "@/lib/api-error";
import type { AlertStatus } from "@/lib/database.types";

// GET /api/alerts/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const alert = await serviceGetAlert(id);
        if (!alert) return NextResponse.json({ error: "Alert bulunamadı." }, { status: 404 });
        return NextResponse.json(alert);
    } catch (err) {
        console.error("[GET /api/alerts/[id]]", err);
        return NextResponse.json({ error: "Alert alınamadı." }, { status: 500 });
    }
}

// PATCH /api/alerts/[id]
// Body: { status: "acknowledged" | "resolved" | "dismissed", reason?: string }
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const { status, reason } = parsed.data as { status: AlertStatus; reason?: string };

        if (!status) {
            return NextResponse.json({ error: "'status' alanı zorunludur." }, { status: 400 });
        }

        const result = await serviceUpdateAlertStatus(id, status, reason);
        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        const updated = await serviceGetAlert(id);
        return NextResponse.json(updated);
    } catch (err) {
        console.error("[PATCH /api/alerts/[id]]", err);
        return NextResponse.json({ error: "Alert güncellenemedi." }, { status: 500 });
    }
}
