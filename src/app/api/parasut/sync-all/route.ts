import { NextResponse } from "next/server";
import { serviceSyncAllPending } from "@/lib/services/parasut-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/parasut/sync-all
export async function POST() {
    try {
        const result = await serviceSyncAllPending();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/sync-all");
    }
}
