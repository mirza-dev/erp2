import { NextRequest, NextResponse } from "next/server";
import { dbListRecommendations } from "@/lib/supabase/recommendations";
import { mapRecommendation } from "@/lib/api-mappers";
import { handleApiError } from "@/lib/api-error";
import type { RecommendationType, RecommendationStatus } from "@/lib/database.types";

export async function GET(req: NextRequest) {
    const { searchParams } = req.nextUrl;
    const entity_type = searchParams.get("entity_type") ?? undefined;
    const entity_id = searchParams.get("entity_id") ?? undefined;
    const recommendation_type = (searchParams.get("recommendation_type") ?? undefined) as RecommendationType | undefined;
    const status = (searchParams.get("status") ?? undefined) as RecommendationStatus | undefined;

    try {
        const rows = await dbListRecommendations({ entity_type, entity_id, recommendation_type, status });
        return NextResponse.json({ recommendations: rows.map(mapRecommendation) });
    } catch (err) {
        return handleApiError(err, "Öneriler listelenemedi.");
    }
}
