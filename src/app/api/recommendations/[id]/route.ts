import { NextRequest, NextResponse } from "next/server";
import { dbUpdateRecommendationStatus } from "@/lib/supabase/recommendations";
import { mapRecommendation } from "@/lib/api-mappers";
import { handleApiError } from "@/lib/api-error";
import type { RecommendationStatus } from "@/lib/database.types";

const ALLOWED_STATUSES: RecommendationStatus[] = ["accepted", "edited", "rejected"];

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    let body: { status?: string; editedMetadata?: Record<string, unknown>; feedbackNote?: string };

    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const status = body.status as RecommendationStatus;
    if (!status || !ALLOWED_STATUSES.includes(status)) {
        return NextResponse.json(
            { error: `status must be one of: ${ALLOWED_STATUSES.join(", ")}` },
            { status: 400 }
        );
    }

    try {
        const updated = await dbUpdateRecommendationStatus(id, status, {
            editedMetadata: body.editedMetadata,
            feedbackNote: body.feedbackNote,
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
