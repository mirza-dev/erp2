/**
 * Faz D — GET /api/import/documents/[id]/lines/[lineId]/preview-image
 *
 * Katalog PDF satırının `source_page` sayfasını mupdf ile PNG render edip
 * döndürür (hibrit: güvenli bbox varsa kırpılmış, yoksa tam sayfa). Lazy:
 * storage'a YAZMAZ — kullanıcı ExtractionReview'da apply ÖNCESİ görseli görür.
 *
 * Auth: middleware authenticated requirement (lines GET ile aynı; viewer okur).
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { dbGetImportDocument } from "@/lib/supabase/import-documents";
import { dbGetLine } from "@/lib/supabase/import-document-lines";
import { renderPdfPageToPng, pickRenderClip } from "@/lib/services/pdf-render";
import { handleApiError } from "@/lib/api-error";

const STORAGE_BUCKET = "product-files";

export async function GET(
    _req: NextRequest,
    ctx: { params: Promise<{ id: string; lineId: string }> },
) {
    try {
        const { id, lineId } = await ctx.params;
        if (!id || !lineId) {
            return NextResponse.json({ error: "Belge ve satır ID zorunludur." }, { status: 400 });
        }

        const line = await dbGetLine(lineId);
        if (!line || line.document_id !== id) {
            return NextResponse.json({ error: "Satır bulunamadı." }, { status: 404 });
        }
        if (line.source_page == null) {
            return NextResponse.json({ error: "Bu satır için görsel sayfası yok." }, { status: 400 });
        }

        const doc = await dbGetImportDocument(id);
        if (!doc) {
            return NextResponse.json({ error: "Belge bulunamadı." }, { status: 404 });
        }
        if (doc.mime_type !== "application/pdf") {
            return NextResponse.json({ error: "Yalnız PDF belgeler render edilebilir." }, { status: 400 });
        }

        const sb = createServiceClient();
        const { data: blob, error: dlErr } = await sb.storage.from(STORAGE_BUCKET).download(doc.file_path);
        if (dlErr || !blob) {
            return NextResponse.json({ error: "Belge dosyası okunamadı." }, { status: 502 });
        }
        const buffer = Buffer.from(await blob.arrayBuffer());

        const clip = pickRenderClip(line.image_region);
        const png = await renderPdfPageToPng(buffer, line.source_page - 1, { clip });

        return new NextResponse(new Uint8Array(png), {
            status: 200,
            headers: {
                "Content-Type": "image/png",
                "Cache-Control": "private, max-age=300",
                "X-Render-Mode": clip ? "cropped" : "full-page",
            },
        });
    } catch (err) {
        return handleApiError(err, "GET /api/import/documents/[id]/lines/[lineId]/preview-image");
    }
}
