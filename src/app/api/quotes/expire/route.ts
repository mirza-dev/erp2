import { NextResponse } from "next/server";
import { serviceExpireQuotes } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/quotes/expire
// CRON: Süresi dolmuş teklifleri (draft/sent + valid_until < today) expired yapar.
export async function POST() {
    try {
        const result = await serviceExpireQuotes();
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/expire");
    }
}
