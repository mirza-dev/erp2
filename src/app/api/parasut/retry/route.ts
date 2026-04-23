import { NextRequest, NextResponse } from "next/server";
import { serviceRetrySyncLog } from "@/lib/services/parasut-service";
import { handleApiError, safeParseJson } from "@/lib/api-error";

// POST /api/parasut/retry
// Body: { sync_log_id: string }
export async function POST(req: NextRequest) {
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const { sync_log_id } = parsed.data as { sync_log_id: string };
        if (!sync_log_id) {
            return NextResponse.json({ error: "'sync_log_id' zorunludur." }, { status: 400 });
        }

        const result = await serviceRetrySyncLog(sync_log_id);

        if (!result.success) {
            return NextResponse.json({ error: result.error }, { status: 400 });
        }

        return NextResponse.json(result);
    } catch (err) {
        return handleApiError(err, "POST /api/parasut/retry");
    }
}
