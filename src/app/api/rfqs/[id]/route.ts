import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { dbGetRfqById, dbUpdateRfq, dbDeleteRfq } from "@/lib/supabase/supplier-rfqs";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { isValidRfqCurrency, validateRfqLines, validateRfqVendorIds } from "@/lib/rfq-validation";
import { resolveAuthContext, requirePermissionFor, actorFromAuthContext } from "@/lib/auth/role-guard";
import { redactRfqDetailForPerms } from "@/lib/auth/redact";

// GET /api/rfqs/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "view_rfqs");
        if (guard) return guard;

        const { id } = await params;
        const rfq = await dbGetRfqById(id);
        if (!rfq) return NextResponse.json({ error: "RFQ bulunamadı." }, { status: 404 });
        return NextResponse.json(redactRfqDetailForPerms(rfq, ctx.perms));
    } catch (err) {
        return handleApiError(err, "GET /api/rfqs/[id]");
    }
}

// PATCH /api/rfqs/[id] — yalnız draft içerik güncelleme
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_rfqs");
        if (guard) return guard;

        const { id } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const lenErr = validateStringLengths(body);
        if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });
        if (!isValidRfqCurrency(body.currency)) {
            return NextResponse.json({ error: "Geçersiz para birimi." }, { status: 400 });
        }
        const linesErr = validateRfqLines(body.lines);
        if (linesErr) return NextResponse.json({ error: linesErr }, { status: 400 });
        const vendorsErr = validateRfqVendorIds(body.vendor_ids);
        if (vendorsErr) return NextResponse.json({ error: vendorsErr }, { status: 400 });

        await dbUpdateRfq(
            id,
            {
                title: body.title as string | null | undefined,
                dueDate: body.due_date as string | null | undefined,
                currency: String(body.currency),
                notes: body.notes as string | null | undefined,
                lines: body.lines as Parameters<typeof dbUpdateRfq>[1]["lines"],
                vendorIds: body.vendor_ids as string[],
            },
            actorFromAuthContext(ctx).label ?? "system",
        );

        revalidateTag("rfqs", "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("yalnız draft")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "PATCH /api/rfqs/[id]");
    }
}

// DELETE /api/rfqs/[id] — yalnız draft
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_rfqs");
        if (guard) return guard;

        const { id } = await params;
        await dbDeleteRfq(id);
        revalidateTag("rfqs", "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        if (err instanceof Error && err.message.includes("Yalnız taslak")) {
            return NextResponse.json({ error: err.message }, { status: 409 });
        }
        return handleApiError(err, "DELETE /api/rfqs/[id]");
    }
}
