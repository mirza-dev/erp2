import { NextRequest, NextResponse } from "next/server";
import {
    dbGetQuotedBreakdownByProduct,
    dbLookupUserEmails,
} from "@/lib/supabase/products";
import { handleApiError } from "@/lib/api-error";

// GET /api/products/[id]/quotes
// Returns the breakdown of active quotes (draft + pending_approval) for a product.
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        const rows = await dbGetQuotedBreakdownByProduct(id);

        const uuids = rows
            .map(r => r.createdBy)
            .filter((x): x is string => !!x);
        const emailMap = await dbLookupUserEmails(uuids);

        const items = rows.map(r => ({
            ...r,
            createdByEmail: r.createdBy ? emailMap.get(r.createdBy) ?? null : null,
        }));

        return NextResponse.json({
            items,
            totalQuoted: rows.reduce((sum, r) => sum + r.quantity, 0),
        });
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/quotes");
    }
}
