import { NextRequest, NextResponse } from "next/server";
import { dbGetQuote } from "@/lib/supabase/quotes";
import { dbGetQuoteArchive, dbGetArchiveSignedUrl, dbArchiveObjectExists, dbDownloadArchiveHtml } from "@/lib/supabase/quote-pdf-archives";
import { handleApiError } from "@/lib/api-error";
import { requirePermission } from "@/lib/auth/role-guard";

export const dynamic = "force-dynamic";

// view modunda hata → ham JSON yerine küçük, tarayıcıda okunur HTML sayfa (yeni sekme).
function htmlError(message: string, status: number): NextResponse {
    const body = `<!doctype html><html lang="tr"><head><meta charset="utf-8">`
        + `<meta name="viewport" content="width=device-width, initial-scale=1">`
        + `<title>Arşiv</title></head>`
        + `<body style="font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;`
        + `display:flex;align-items:center;justify-content:center;height:100vh;margin:0">`
        + `<p style="max-width:32rem;text-align:center;line-height:1.6">${message}</p></body></html>`;
    return new NextResponse(body, {
        status,
        headers: { "Content-Type": "text/html; charset=utf-8" },
    });
}

// GET /api/quotes/[id]/archive
// Faz 4 (V7): gönderilmiş teklifin dondurulmuş HTML arşivi.
// Arşiv send anında üretilir (serviceArchiveQuotePdf) — bu route yalnız lookup yapar,
// üretmez. Read-only → demo modda GET izinli (middleware).
//
// İki mod:
//   (varsayılan)  → JSON { url, expires_in, revision_no } (signed URL; geriye uyumlu).
//   ?view=1       → arşiv HTML'ini DOĞRUDAN `text/html; charset=utf-8` ile stream eder.
// view modu neden: Supabase storage signed URL'i HTML'i render etmeyebilir (stored-XSS
// koruması → ham metin + UTF-8 mojibake). Kendi origin'imizden doğru content-type ile
// servis edince tarayıcı düzgün render eder + buton senkron `window.open` ile açabilir
// (signed-URL'i fetch edip sonra açmaya gerek yok → popup-blocker da elenir).
// Güvenlik: file_path/content_hash JSON modunda sızdırılmaz; HTML'in kendisi zaten
// view_sales_prices guard'ının arkasında.
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const view = req.nextUrl.searchParams.get("view") === "1";
    try {
        // RBAC R3 (Faz 4 tamamlama): arşiv donmuş HTML — fiyatlar gömülü, seçici
        // redaction imkânsız → view_sales_prices yoksa tüm belgeye 403 (quote ağırlıkla
        // fiyat belgesi; viewer/demo/production/purchasing erişemez). Live preview detay
        // GET'ten beslendiği için redaction'ı zaten miras alır.
        const guard = await requirePermission(req, "view_sales_prices");
        if (guard) {
            // view modunda yeni sekme açılır → ham JSON yerine dostça HTML 403.
            return view ? htmlError("Bu belgeyi görüntüleme yetkiniz yok.", 403) : guard;
        }

        const { id } = await params;

        const quote = await dbGetQuote(id);
        if (!quote) {
            return view
                ? htmlError("Teklif bulunamadı.", 404)
                : NextResponse.json({ error: "Teklif bulunamadı." }, { status: 404 });
        }

        const revisionNo = Number(quote.revision_no ?? 1);
        const archive = await dbGetQuoteArchive(id, revisionNo);
        if (!archive) {
            return view
                ? htmlError("Bu teklif için arşiv bulunamadı (henüz gönderilmemiş olabilir).", 404)
                : NextResponse.json(
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
            return view
                ? htmlError("Arşiv dosyası bulunamadı (yeniden gönderim gerekebilir).", 404)
                : NextResponse.json(
                    { error: "Arşiv dosyası bulunamadı (yeniden gönderim gerekebilir)." },
                    { status: 404 },
                );
        }

        // view modu: HTML'i doğrudan stream et (tarayıcı render eder, UTF-8 doğru).
        if (view) {
            const html = await dbDownloadArchiveHtml(archive.file_path);
            if (html === null) {
                return htmlError("Arşiv dosyası okunamadı (yeniden gönderim gerekebilir).", 404);
            }
            return new NextResponse(html, {
                status: 200,
                headers: {
                    "Content-Type": "text/html; charset=utf-8",
                    // donmuş arşiv immutable → kısa süreli private cache zararsız
                    "Cache-Control": "private, max-age=300",
                },
            });
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
