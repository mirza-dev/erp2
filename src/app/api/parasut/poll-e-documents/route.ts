import { NextResponse } from "next/server";
import { serviceParasutPollEDocuments } from "@/lib/services/parasut-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/parasut/poll-e-documents
// CRON-only — middleware Bearer token kontrolü yapar.
export async function POST() {
    try {
        const result = await serviceParasutPollEDocuments();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/poll-e-documents");
    }
}
