import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { collectOverview } from "@/lib/services/developer-console-service";
import { parseTimeRange } from "@/lib/telemetry/health";

/**
 * Genel Bakış (§3, §14) — tek istekte metrikler + sağlık + son aktivite.
 *
 * Ölçülemeyen metrikler `null` döner; UI onları "Ölçülmüyor" olarak yazar.
 * Uydurma değer üretilmez (§28).
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;

        const range = parseTimeRange(req.nextUrl.searchParams.get("range"));
        return NextResponse.json(await collectOverview(range));
    } catch (err) {
        return handleApiError(err, "GET /api/developer/overview");
    }
}
