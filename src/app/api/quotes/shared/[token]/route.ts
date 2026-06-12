/**
 * GET /api/quotes/shared/[token] — müşteri teklif arşivi görüntüleme (PUBLIC).
 *
 * Müşteri e-postasındaki "Teklifi Görüntüle" linki. Login YOK — erişim yalnız
 * süreli HMAC token'la (quote-share-token.ts). Token e-postayla teklif sahibine
 * gider; URL'i bilen belgeyi görür (e-postadaki ek ile aynı güven modeli).
 *
 * Donmuş arşiv HTML'i kendi origin'imizden `text/html; charset=utf-8` ile servis
 * edilir — Supabase signed URL HTML'i render etmez (stored-XSS koruması → ham
 * kaynak + mojibake). `[id]/archive?view=1` kalıbının token'lı public ikizi.
 *
 * Proxy: `/api/quotes/shared` ALWAYS_PUBLIC'te (davetiye kilidi bypass — bilinçli).
 */
import { NextRequest, NextResponse } from "next/server";
import { dbGetQuoteArchive, dbDownloadArchiveHtml } from "@/lib/supabase/quote-pdf-archives";
import { resolveQuoteShareSecret, verifyQuoteShareToken } from "@/lib/quote-share-token";

export const dynamic = "force-dynamic";

function htmlError(message: string, status: number): NextResponse {
    const body = `<!doctype html><html lang="tr"><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width, initial-scale=1">`
        + `<title>Teklif</title></head>`
        + `<body style="font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;`
        + `display:flex;align-items:center;justify-content:center;height:100vh;margin:0">`
        + `<p style="max-width:32rem;text-align:center;line-height:1.6">${message}</p></body></html>`;
    return new NextResponse(body, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ token: string }> }
) {
    try {
        const { token } = await params;
        const secret = resolveQuoteShareSecret();
        if (!secret) {
            // Yapılandırma eksik (QUOTE_SHARE_SECRET/CRON_SECRET yok) — fail-closed.
            return htmlError("Belge paylaşımı şu an kullanılamıyor.", 503);
        }
        const payload = verifyQuoteShareToken(token, secret);
        if (!payload) {
            return htmlError(
                "Bu bağlantının süresi dolmuş veya geçersiz. Güncel teklif için bize e-postayla ulaşabilirsiniz.",
                403,
            );
        }

        const archive = await dbGetQuoteArchive(payload.q, payload.r);
        if (!archive) return htmlError("Teklif belgesi bulunamadı.", 404);

        const html = await dbDownloadArchiveHtml(archive.file_path);
        if (html === null) return htmlError("Teklif belgesi şu an açılamıyor. Lütfen daha sonra tekrar deneyin.", 502);

        return new NextResponse(html, {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                // Token süreli ama içerik immutable arşiv — kısa cache yeterli.
                "Cache-Control": "private, max-age=300",
                "X-Robots-Tag": "noindex",
            },
        });
    } catch (err) {
        console.error("[GET /api/quotes/shared]", err);
        return htmlError("Beklenmeyen bir hata oluştu.", 500);
    }
}
