import { NextRequest, NextResponse } from "next/server";
import { handleApiError } from "@/lib/api-error";
import { requireInternalOperatorFor } from "@/lib/auth/internal-access";
import { resolveAuthContext } from "@/lib/auth/role-guard";
import { dbListEmailDeliveries } from "@/lib/supabase/email-maintenance";

export async function GET(req: NextRequest) {
    try {
        const auth = await resolveAuthContext();
        const guard = requireInternalOperatorFor(auth);
        if (guard) return guard;
        const q = req.nextUrl.searchParams;
        const rows = await dbListEmailDeliveries({
            status: q.get("status") || undefined,
            notificationType: q.get("type") || undefined,
            recipient: q.get("recipient") || undefined,
            entityType: q.get("entity") || undefined,
            from: q.get("from") || undefined,
            to: q.get("to") || undefined,
        });
        return NextResponse.json(rows.map(({ html_body: _html, text_body: _text, metadata: _metadata, ...row }) => row));
    } catch (err) {
        return handleApiError(err, "GET /api/maintenance/email-deliveries");
    }
}
