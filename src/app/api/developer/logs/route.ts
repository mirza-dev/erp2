import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbActivityFeed } from "@/lib/supabase/developer-feed";
import { parseTimeRange, rangeStartISO } from "@/lib/telemetry/health";
import {
    parseFeedSources,
    parseISODate,
    parseLimit,
    parseSeverity,
    parseText,
} from "@/lib/telemetry/api-params";

/**
 * Kayıt / olay görüntüleyici (§9) ve Genel Bakış'ın "son aktivite" listesi (§14).
 *
 * Veri, ERP'nin ZATEN ürettiği kaynaklardan okunarak birleştirilir — yeni bir
 * log borusu yok (bkz. developer-feed.ts). Mock veri hiç yok.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const sp = req.nextUrl.searchParams;
        const range = parseTimeRange(sp.get("range"));

        const feed = await dbActivityFeed({
            sources: parseFeedSources(sp.get("sources")),
            level: parseSeverity(sp.get("level")),
            module: parseText(sp.get("module"), 60),
            requestId: parseText(sp.get("requestId"), 64),
            userId: parseText(sp.get("userId"), 64),
            since: parseISODate(sp.get("since")) ?? rangeStartISO(range),
            before: parseISODate(sp.get("before")),
            search: parseText(sp.get("search"), 120),
            limit: parseLimit(sp.get("limit"), 60, 200),
        });

        return NextResponse.json({ ...feed, range });
    } catch (err) {
        return handleApiError(err, "GET /api/developer/logs");
    }
}
