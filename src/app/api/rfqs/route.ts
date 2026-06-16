import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { dbListRfqs, dbCreateRfq } from "@/lib/supabase/supplier-rfqs";
import type { SupplierRfqStatus } from "@/lib/database.types";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { isValidRfqCurrency, validateRfqLines, validateRfqVendorIds } from "@/lib/rfq-validation";
import { resolveAuthContext, requirePermissionFor, actorFromAuthContext } from "@/lib/auth/role-guard";

// GET /api/rfqs?status=...&search=...
export async function GET(req: NextRequest) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "view_rfqs");
        if (guard) return guard;

        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status") ?? undefined;
        const search = searchParams.get("search") ?? undefined;

        const rows = await dbListRfqs({
            status: status as SupplierRfqStatus | undefined,
            search,
        });
        return NextResponse.json(rows);
    } catch (err) {
        return handleApiError(err, "GET /api/rfqs");
    }
}

// POST /api/rfqs
export async function POST(req: NextRequest) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_rfqs");
        if (guard) return guard;

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const lenErr = validateStringLengths(body);
        if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });

        if (!isValidRfqCurrency(body.currency)) {
            return NextResponse.json(
                { error: "Geçersiz para birimi. Kabul edilenler: TRY, USD, EUR." },
                { status: 400 },
            );
        }
        const linesErr = validateRfqLines(body.lines);
        if (linesErr) return NextResponse.json({ error: linesErr }, { status: 400 });
        const vendorsErr = validateRfqVendorIds(body.vendor_ids);
        if (vendorsErr) return NextResponse.json({ error: vendorsErr }, { status: 400 });

        const result = await dbCreateRfq({
            title: body.title as string | null | undefined,
            dueDate: body.due_date as string | null | undefined,
            currency: String(body.currency),
            notes: body.notes as string | null | undefined,
            lines: body.lines as Parameters<typeof dbCreateRfq>[0]["lines"],
            vendorIds: body.vendor_ids as string[],
            createdBy: actorFromAuthContext(ctx).label,
        });

        revalidateTag("rfqs", "max");
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        return handleApiError(err, "POST /api/rfqs");
    }
}
