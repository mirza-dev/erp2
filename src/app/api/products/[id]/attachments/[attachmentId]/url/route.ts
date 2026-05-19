import { NextRequest, NextResponse } from "next/server";
import { dbGetAttachment, dbGetSignedUrl } from "@/lib/supabase/product-attachments";
import { handleApiError } from "@/lib/api-error";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_URL_TTL = 3600;

export const dynamic = "force-dynamic";

// GET /api/products/[id]/attachments/[attachmentId]/url
// Response: { url, expires_in }
//
// SECURITY NOTE (Faz 2d Review P3-005):
// middleware.ts demo cookie + GET /api/* anonymous read'e izin verir. Bu endpoint
// authenticated kullanıcı OLMADAN da private bucket için signed URL üretebilir.
// Mevcut politika: demo bucket SADECE seed/fake data içerdiğinden risk yok.
// Eğer ileride demo ile prod aynı Supabase bucket'ını paylaşırsa, bu route'a
// (ve liste GET'ine) `requireAuthenticatedUser` guard'ı eklenmeli.
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
