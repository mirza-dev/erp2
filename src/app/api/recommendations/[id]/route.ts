import { NextRequest, NextResponse } from "next/server";
import { dbGetRecommendationById, dbUpdateRecommendationStatus } from "@/lib/supabase/recommendations";
import { mapRecommendation } from "@/lib/api-mappers";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import type { RecommendationStatus } from "@/lib/database.types";

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    try {
        const row = await dbGetRecommendationById(id);
        if (!row) {
            return NextResponse.json({ error: `Recommendation ${id} not found` }, { status: 404 });
        }
        return NextResponse.json({ recommendation: mapRecommendation(row) });
    } catch (err) {
        return handleApiError(err, "Öneri getirilemedi.");
    }
}

const ALLOWED_STATUSES: RecommendationStatus[] = ["accepted", "edited", "rejected"];

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const safeParsed = await safeParseJson(req);
    if (!safeParsed.ok) return safeParsed.response;
    const body = safeParsed.data as { status?: string; editedMetadata?: Record<string, unknown>; feedbackNote?: string };

    const status = body.status as RecommendationStatus;
    if (!status || !ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
            { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
            { status: 400 }
        );
    }

    if (status === "edited") {
        const qty = body.editedMetadata?.suggestQty;
        if (typeof qty !== "number" || !Number.isFinite(qty) || qty <= 0) {
            return NextResponse.json({ error: "editedMetadata.suggestQty must be a positive number" }, { status: 400 });
        }
    }

    try {
        const updated = await dbUpdateRecommendationStatus(id, status, {
            editedMetadata: body.editedMetadata,
            feedbackNote: body.feedbackNote,
            actor: "user", // placeholder until auth (Stage 3)
        });
        return NextResponse.json({ recommendation: mapRecommendation(updated) });
    } catch (err) {
        if (err instanceof Error && err.message.includes("Invalid status transition")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        if (err instanceof Error && err.message.includes("not found")) {
            return NextResponse.json({ error: err.message }, { status: 404 });
        }
        return handleApiError(err, "Öneri güncellenemedi.");
    }
}
