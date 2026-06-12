import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbListSuppressions } from "@/lib/supabase/email-maintenance";

export async function GET() {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;
        return NextResponse.json(await dbListSuppressions(true));
    } catch (err) {
        return handleApiError(err, "GET /api/maintenance/email-suppressions");
    }
}
