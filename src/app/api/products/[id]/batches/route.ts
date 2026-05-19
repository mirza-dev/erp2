import { NextRequest, NextResponse } from "next/server";
import { dbListBatchesByProduct, dbCreateBatch } from "@/lib/supabase/product-batches";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError, safeParseJson, validateStringLengths } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/products/[id]/batches
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "Geçersiz ürün id." }, { status: 400 });
        }
        const batches = await dbListBatchesByProduct(id);
        return NextResponse.json(batches);
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/batches");
    }
}

// POST /api/products/[id]/batches — admin|purchaser
export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id } = await params;
        if (!UUID_RE.test(id)) {
            return NextResponse.json({ error: "Geçersiz ürün id." }, { status: 400 });
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;
        const lengthErr = validateStringLengths(body);
        if (lengthErr) return NextResponse.json({ error: lengthErr }, { status: 400 });

        const initialQty = Number(body.initial_qty);
        const remainingQty = body.remaining_qty !== undefined && body.remaining_qty !== null
            ? Number(body.remaining_qty)
            : undefined;

        const certAttachId = (body.certificate_attachment_id as string | null | undefined) ?? null;
        if (certAttachId !== null && !UUID_RE.test(certAttachId)) {
            return NextResponse.json({ error: "Geçersiz sertifika eki id." }, { status: 400 });
        }

        const batch = await dbCreateBatch({
            product_id: id,
            heat_no: String(body.heat_no ?? "").trim(),
            batch_date: (body.batch_date as string | null | undefined) ?? null,
            initial_qty: initialQty,
            remaining_qty: remainingQty,
            certificate_attachment_id: certAttachId,
            notes: (body.notes as string | null | undefined) ?? null,
        });

        revalidateTag("products", "max");
        return NextResponse.json(batch, { status: 201 });
    } catch (err) {
        if (err instanceof Error && (
            err.message.includes("zorunludur") ||
            err.message.includes("pozitif") ||
            err.message.includes("büyük olamaz") ||
            err.message.includes("formatında") ||
            err.message.toLowerCase().includes("geçersiz")
        )) {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        return handleApiError(err, "POST /api/products/[id]/batches");
    }
}
