import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbListMaintenanceIncidents } from "@/lib/supabase/email-maintenance";

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;
        const requested = req.nextUrl.searchParams.get("status");
        const status = requested === "resolved" || requested === "all" ? requested : "open";
        return NextResponse.json(await dbListMaintenanceIncidents(status));
    } catch (err) {
        return handleApiError(err, "GET /api/maintenance/incidents");
    }
}
