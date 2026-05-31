import { NextRequest, NextResponse } from "next/server";
import {
    dbGetPurchaseOrderById,
    dbPatchPurchaseOrder,
    isValidPoCurrency,
} from "@/lib/supabase/purchase-orders";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";
import { revalidateTag } from "next/cache";

// GET /api/purchase-orders/[id]
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(_req, "view_purchase_orders");
        if (guard) return guard;

        const { id } = await params;
        const po = await dbGetPurchaseOrderById(id);
        if (!po) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });
        return NextResponse.json(po);
    } catch (err) {
        return handleApiError(err, "GET /api/purchase-orders/[id]");
    }
}

// PATCH /api/purchase-orders/[id] — updates metadata (expected_date, notes, currency)
// Only allowed on draft status
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requirePermission(req, "manage_purchase_orders");
        if (guard) return guard;

        const { id } = await params;

        const existing = await dbGetPurchaseOrderById(id);
        if (!existing) return NextResponse.json({ error: "PO bulunamadı." }, { status: 404 });

        if (existing.status !== "draft") {
            return NextResponse.json(
                { error: "PO sadece draft durumunda düzenlenebilir." },
                { status: 409 },
            );
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;

        if (body.currency !== undefined && !isValidPoCurrency(body.currency)) {
            return NextResponse.json(
                { error: "Geçersiz para birimi. Kabul edilenler: TRY, USD, EUR." },
                { status: 400 },
            );
        }

        const updated = await dbPatchPurchaseOrder(id, {
            expected_date: body.expected_date as string | null | undefined,
            notes:         body.notes as string | null | undefined,
            currency:      body.currency as string | undefined,
        });

        revalidateTag("purchase-orders", "max");
        return NextResponse.json(updated);
    } catch (err) {
        return handleApiError(err, "PATCH /api/purchase-orders/[id]");
    }
}
