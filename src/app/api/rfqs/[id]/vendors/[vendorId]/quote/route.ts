import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { dbUpsertVendorQuote } from "@/lib/supabase/supplier-rfqs";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { validateVendorPrices, isValidRfqCurrency } from "@/lib/rfq-validation";
import { resolveAuthContext, requirePermissionFor, actorFromAuthContext } from "@/lib/auth/role-guard";

// PATCH /api/rfqs/[id]/vendors/[vendorId]/quote — bir tedarikçinin verdiği fiyatları kaydet.
// [vendorId] = supplier_rfq_vendors.id (RFQ-vendor satırı), vendors.id DEĞİL.
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; vendorId: string }> },
) {
    try {
        const ctx = await resolveAuthContext();
        const guard = requirePermissionFor(ctx, "manage_rfqs");
        if (guard) return guard;

        const { vendorId } = await params;
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;
        const body = parsed.data as Record<string, unknown>;

        const lenErr = validateStringLengths(body);
        if (lenErr) return NextResponse.json({ error: lenErr }, { status: 400 });
        if (body.currency !== undefined && body.currency !== null && !isValidRfqCurrency(body.currency)) {
            return NextResponse.json({ error: "Geçersiz para birimi." }, { status: 400 });
        }
        const pricesErr = validateVendorPrices(body.prices);
        if (pricesErr) return NextResponse.json({ error: pricesErr }, { status: 400 });

        await dbUpsertVendorQuote(
            vendorId,
            {
                currency: body.currency as string | undefined,
                valid_until: body.valid_until as string | null | undefined,
                lead_time_days: body.lead_time_days as number | null | undefined,
                notes: body.notes as string | null | undefined,
                status: body.status as string | undefined,
            },
            body.prices as Parameters<typeof dbUpsertVendorQuote>[2],
            actorFromAuthContext(ctx).label ?? "system",
        );

        revalidateTag("rfqs", "max");
        return NextResponse.json({ ok: true });
    } catch (err) {
        return handleApiError(err, "PATCH /api/rfqs/[id]/vendors/[vendorId]/quote");
    }
}
