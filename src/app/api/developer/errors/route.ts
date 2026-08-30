import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbListErrorGroups } from "@/lib/supabase/telemetry";
import { parseTimeRange, rangeStartISO } from "@/lib/telemetry/health";
import {
    parseErrorGroupStatus,
    parseCursor,
    parseLimit,
    parseSeverity,
    parseText,
} from "@/lib/telemetry/api-params";

/**
 * Hata merkezi listesi (§5, §6, §15).
 *
 * Gruplanmış döner — aynı kusurun yüzlerce oluşumu tek satırdır ve
 * `occurrence_count` gerçek toplamı taşır. Sayfalama cursor tabanlı
 * (`before` = son satırın `last_seen_at`'i): binlerce kayıtta offset
 * sayfalaması hem yavaşlar hem yeni kayıt geldikçe satır atlar.
 */
export async function GET(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const sp = req.nextUrl.searchParams;
        const range = parseTimeRange(sp.get("range"));

        const page = await dbListErrorGroups({
            severity: parseSeverity(sp.get("severity")),
            status: parseErrorGroupStatus(sp.get("status")),
            module: parseText(sp.get("module"), 60),
            endpoint: parseText(sp.get("endpoint"), 120),
            errorType: parseText(sp.get("errorType"), 60),
            environment: parseText(sp.get("environment"), 40),
            since: rangeStartISO(range),
            before: parseCursor(sp.get("before")),
            search: parseText(sp.get("search"), 120),
            limit: parseLimit(sp.get("limit"), 50, 200),
        });

        return NextResponse.json({ ...page, range });
    } catch (err) {
        return handleApiError(err, "GET /api/developer/errors");
    }
}
