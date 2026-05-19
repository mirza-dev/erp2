import { NextRequest, NextResponse } from "next/server";
import { dbGetAttachment, dbGetSignedUrl } from "@/lib/supabase/product-attachments";
import { handleApiError } from "@/lib/api-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL = 3600;

export const dynamic = "force-dynamic";

// GET /api/products/[id]/attachments/[attachmentId]/url
// Response: { url, expires_in }
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
    try {
        const { id, attachmentId } = await params;
        if (!UUID_RE.test(id) || !UUID_RE.test(attachmentId)) {
            return NextResponse.json({ error: "Geçersiz id." }, { status: 400 });
        }
        const att = await dbGetAttachment(attachmentId);
        if (!att) return NextResponse.json({ error: "Ek bulunamadı." }, { status: 404 });
        if (att.product_id !== id) {
            return NextResponse.json({ error: "Ek bu ürüne ait değil." }, { status: 404 });
        }
        if (!att.file_path) {
            return NextResponse.json({ error: "Dosya yolu eksik." }, { status: 404 });
        }
        const url = await dbGetSignedUrl(att.file_path, SIGNED_URL_TTL);
        if (!url) return NextResponse.json({ error: "Signed URL üretilemedi." }, { status: 500 });
        return NextResponse.json({ url, expires_in: SIGNED_URL_TTL });
    } catch (err) {
        return handleApiError(err, "GET /api/products/[id]/attachments/[attachmentId]/url");
    }
}
