import { NextRequest, NextResponse } from "next/server";
import { dbListPurchaseOrders, dbCreatePurchaseOrder, validatePoLines, isValidPoCurrency } from "@/lib/supabase/purchase-orders";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

// GET /api/purchase-orders?status=...&vendor_id=...
export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const status = searchParams.get("status") ?? undefined;
        const vendor_id = searchParams.get("vendor_id") ?? undefined;

        const orders = await dbListPurchaseOrders({
            status: status as import("@/lib/database.types").PurchaseOrderStatus | undefined,
            vendor_id,
        });
        return NextResponse.json(orders);
    } catch (err) {
        return handleApiError(err, "GET /api/purchase-orders");
    }
}

// POST /api/purchase-orders
export async function POST(req: NextRequest) {
    try {
        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;

        if (!body.vendor_id) {
            return NextResponse.json({ error: "vendor_id zorunludur." }, { status: 400 });
        }
        if (!isValidPoCurrency(body.currency)) {
            return NextResponse.json(
                { error: "Geçersiz para birimi. Kabul edilenler: TRY, USD, EUR." },
                { status: 400 },
            );
        }
        const linesErr = validatePoLines(body.lines);
        if (linesErr) return NextResponse.json({ error: linesErr }, { status: 400 });

        const result = await dbCreatePurchaseOrder({
            vendorId:     String(body.vendor_id),
            expectedDate: body.expected_date as string | null | undefined,
            currency:     String(body.currency),
            notes:        body.notes as string | null | undefined,
            lines:        body.lines as Parameters<typeof dbCreatePurchaseOrder>[0]["lines"],
            createdBy:    body.created_by as string | null | undefined,
        });

        revalidateTag("purchase-orders", "max");
        return NextResponse.json(result, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("vendor pasif") ||
            err.message.includes("en az 1 line") ||
            err.message.includes("zorunludur")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/purchase-orders");
    }
}
