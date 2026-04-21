import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { serviceExpireQuotes } from "@/lib/services/quote-service";
import { handleApiError } from "@/lib/api-error";

// POST /api/quotes/expire
// CRON: Süresi dolmuş teklifleri (draft/sent + valid_until < today) expired yapar.
export async function POST() {
    try {
        const result = await serviceExpireQuotes();
        if (result.expired > 0) {
            revalidateTag("quotes", "max");
            for (const id of result.expiredIds) {
                revalidateTag(`quote-${id}`, "max");
            }
        }
        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/quotes/expire");
    }
}
