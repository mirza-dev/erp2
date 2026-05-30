import { NextRequest, NextResponse } from "next/server";
import { dbGetQuote } from "@/lib/supabase/quotes";
import { dbGetQuoteArchive, dbGetArchiveSignedUrl, dbArchiveObjectExists } from "@/lib/supabase/quote-pdf-archives";
import { handleApiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";

// GET /api/quotes/[id]/archive
// Faz 4 (V7): gönderilmiş teklifin dondurulmuş HTML arşivinin signed URL'i.
// Arşiv send anında üretilir (serviceArchiveQuotePdf) — bu route yalnız lookup yapar,
// üretmez. Read-only → demo modda GET izinli (middleware).
// Güvenlik: yalnız {url, expires_in, revision_no} döner; file_path/content_hash sızdırmaz.
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        const quote = await dbGetQuote(id);
        if (!quote) {
            return NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });
        }

        const revisionNo = Number(quote.revision_no ?? 1);
        const archive = await dbGetQuoteArchive(id, revisionNo);
        if (!archive) {
            return NextResponse.json(
                { error: "Bu teklif için arşiv bulunamadı (henüz gönderilmemiş olabilir)." },
                { status: 404 },
            );
        }

        // Bulgu 4 / P3-2: DB satırı var ama storage dosyası yoksa ("phantom" —
        // nadir crash/timeout penceresi) signed URL üretip window.open'da kırık
        // sekme açmak yerine graceful 404 dön (UI info toast'a düşer). Kalıcı
        // recover/generate (eksik dosyayı yeniden üret) Faz 6'da serviceArchiveQuotePdf
        // (tri-state dbArchiveObjectStatus: missing→sil+üret / unknown→502) ile geldi;
        // accept yolunda self-heal eder. Bu GET route lookup-only sözleşmeyi korur
        // (üretmez) — accept dışı görüntülemede phantom'u yeniden üretmek istemeyiz.
        const objectExists = await dbArchiveObjectExists(archive.file_path);
        if (!objectExists) {
            return NextResponse.json(
                { error: "Arşiv dosyası bulunamadı (yeniden gönderim gerekebilir)." },
                { status: 404 },
            );
        }

        const expiresIn = 3600;
        const url = await dbGetArchiveSignedUrl(archive.file_path, expiresIn);
        if (!url) {
            return NextResponse.json({ error: "Arşiv linki oluşturulamadı." }, { status: 500 });
        }

        return NextResponse.json({ url, expires_in: expiresIn, revision_no: revisionNo });
    } catch (err) {
        return handleApiError(err, "GET /api/quotes/[id]/archive");
    }
}
