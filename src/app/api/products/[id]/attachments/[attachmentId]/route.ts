import { NextRequest, NextResponse } from "next/server";
import {
    dbGetAttachment,
    dbDeleteAttachment,
    dbSetPrimaryImage,
} from "@/lib/supabase/product-attachments";
import { requireRole } from "@/lib/auth/role-guard";
import { handleApiError, safeParseJson } from "@/lib/api-error";
import { revalidateTag } from "next/cache";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// PATCH /api/products/[id]/attachments/[attachmentId] — admin|purchaser
// Body: { is_primary_image?: true }  (yalnız bu desteklenir; kind/metadata ileride)
export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id, attachmentId } = await params;
        if (!UUID_RE.test(id) || !UUID_RE.test(attachmentId)) {
            return NextResponse.json({ error: "Geçersiz id." }, { status: 400 });
        }

        const existing = await dbGetAttachment(attachmentId);
        if (!existing) return NextResponse.json({ error: "Ek bulunamadı." }, { status: 404 });
        if (existing.product_id !== id) {
            return NextResponse.json({ error: "Ek bu ürüne ait değil." }, { status: 404 });
        }

        const parsed = await safeParseJson(req);
        if (!parsed.ok) return parsed.response;

        const body = parsed.data as Record<string, unknown>;

        if (body.is_primary_image === true) {
            if (existing.kind !== "image") {
                return NextResponse.json(
                    { error: "Yalnızca görsel ekler ana görsel olarak seçilebilir." },
                    { status: 400 },
                );
            }
            await dbSetPrimaryImage(id, attachmentId);
            revalidateTag("products", "max");
            return NextResponse.json({ ok: true });
        }

        return NextResponse.json({ error: "Desteklenmeyen patch." }, { status: 400 });
    } catch (err) {
        return handleApiError(err, "PATCH /api/products/[id]/attachments/[attachmentId]");
    }
}

// DELETE /api/products/[id]/attachments/[attachmentId] — admin|purchaser
export async function DELETE(
    req: NextRequest,
    { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
    try {
        const guard = await requireRole(req, ["admin", "purchaser"]);
        if (guard) return guard;

        const { id, attachmentId } = await params;
        if (!UUID_RE.test(id) || !UUID_RE.test(attachmentId)) {
            return NextResponse.json({ error: "Geçersiz id." }, { status: 400 });
        }

        const existing = await dbGetAttachment(attachmentId);
        if (!existing) return NextResponse.json({ error: "Ek bulunamadı." }, { status: 404 });
        if (existing.product_id !== id) {
            return NextResponse.json({ error: "Ek bu ürüne ait değil." }, { status: 404 });
        }

        await dbDeleteAttachment(attachmentId);
        revalidateTag("products", "max");
        return new NextResponse(null, { status: 204 });
    } catch (err) {
        return handleApiError(err, "DELETE /api/products/[id]/attachments/[attachmentId]");
    }
}
