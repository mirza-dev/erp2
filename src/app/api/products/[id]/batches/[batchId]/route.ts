import { NextRequest, NextResponse } from "next/server";
import { dbGetBatch, dbUpdateBatch, dbDeleteBatch } from "@/lib/supabase/product-batches";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/products/[id]/batches/[batchId] — admin|purchaser
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; batchId: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id, batchId } = await params;
        if (!UUID_RE.test(id) || !UUID_RE.test(batchId)) {
            return NextResponse.json({ error: "Geçersiz id." }, { status: 400 });
        }

        const existing = await dbGetBatch(batchId);
        if (!existing) return NextResponse.json({ error: "Parti bulunamadı." }, { status: 404 });
        if (existing.product_id !== id) {
            return NextResponse.json({ error: "Parti bu ürüne ait değil." }, { status: 404 });
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const patch: Record<string, unknown> = {};
        if (body.heat_no !== undefined) patch.heat_no = String(body.heat_no);
        if (body.batch_date !== undefined) patch.batch_date = body.batch_date;
        if (body.initial_qty !== undefined) patch.initial_qty = Number(body.initial_qty);
        if (body.remaining_qty !== undefined) patch.remaining_qty = Number(body.remaining_qty);
        if (body.certificate_attachment_id !== undefined) patch.certificate_attachment_id = body.certificate_attachment_id;
        if (body.notes !== undefined) patch.notes = body.notes;

        const updated = await dbUpdateBatch(batchId, patch);
        revalidateTag("products", "max");
        return NextResponse.json(updated);
    } catch (err) {
        if (err instanceof Error) {
            if (err.message.includes("bulunamadı")) {
                return NextResponse.json({ error: err.message }, { status: 404 });
            }
            if (
                err.message.includes("zorunludur") ||
                err.message.includes("pozitif") ||
                err.message.includes("büyük olamaz") ||
                err.message.includes("formatında") ||
                err.message.includes("ait değil") ||
                err.message.includes("türünde olmalıdır") ||
                err.message.toLowerCase().includes("geçersiz")
            ) {
                return NextResponse.json({ error: err.message }, { status: 400 });
            }
        }
        return handleApiError(err, "PATCH /api/products/[id]/batches/[batchId]");
    }
}

// DELETE /api/products/[id]/batches/[batchId] — admin|purchaser
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; batchId: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id, batchId } = await params;
        if (!UUID_RE.test(id) || !UUID_RE.test(batchId)) {
            return NextResponse.json({ error: "Geçersiz id." }, { status: 400 });
        }

        const existing = await dbGetBatch(batchId);
        if (!existing) return NextResponse.json({ error: "Parti bulunamadı." }, { status: 404 });
        if (existing.product_id !== id) {
            return NextResponse.json({ error: "Parti bu ürüne ait değil." }, { status: 404 });
        }

        await dbDeleteBatch(batchId);
        revalidateTag("products", "max");
        return new NextResponse(null, { status: 204 });
    } catch (err) {
        return handleApiError(err, "DELETE /api/products/[id]/batches/[batchId]");
    }
}
