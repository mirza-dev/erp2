/**
 * Teklif PDF eki üretimi — @react-pdf/renderer.
 *
 * Kullanıcı kararı (2026-06): müşteriye giden teklif e-postasında belge LINK
 * değil GERÇEK PDF eki olarak gider (Teklif-<no>.pdf). HTML arşiv + paylaşım
 * token altyapısı (quote-pdfs bucket / /api/quotes/shared) kodda durur; e-posta
 * yolu artık bu modülü kullanır.
 *
 * Lazy import: @react-pdf/renderer + yoga ağır modüldür — yalnız PDF gerçekten
 * üretilirken yüklenir (mupdf pdf-render.ts kalıbı). Çağıran (quote-service) bu
 * modülün tamamını da `await import("@/lib/quote-pdf")` ile almalıdır.
 */
import { createElement } from "react";
import type { QuoteData } from "@/app/dashboard/quotes/components/quote-types";
import { inlineLogoAsDataUri } from "@/lib/quote-archive-html";

/** react-pdf <Image> yalnız PNG/JPEG kabul eder (SVG/webp/gif render edilemez). */
const PDF_IMAGE_DATA_URI_RE = /^data:image\/(png|jpe?g);base64,/;

/**
 * Logo'yu PDF'e gömülebilir data-URI'ye çevirir. Fetch/allowlist/boyut mantığı
 * inlineLogoAsDataUri ile TEK kaynak (Supabase host allowlist + 512KB sınırı);
 * üstüne PDF-özel filtre: PNG/JPEG dışındaki biçimler (ör. SVG logo) null →
 * belge placeholder kutuyla basılır (bilinen sınır; arşiv HTML'de SVG çıkar).
 */
export async function resolvePdfLogo(logoSrc: string | null): Promise<string | null> {
    const dataUri = await inlineLogoAsDataUri(logoSrc);
    if (!dataUri || !PDF_IMAGE_DATA_URI_RE.test(dataUri)) return null;
    return dataUri;
}

/** E-posta eki dosya adı — `Teklif-<no>.pdf`; MIME/header güvenliği için sanitize. */
export function quotePdfFilename(quoteNo: string): string {
    const safe = (quoteNo || "")
        .replace(/[^\w.-]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return `Teklif-${safe || "Belge"}.pdf`;
}

/** QuoteData → A4 teklif belgesi PDF buffer'ı (font kaydı idempotent). */
export async function renderQuotePdfBuffer(data: QuoteData): Promise<Buffer> {
    const [{ renderToBuffer }, { registerQuotePdfFonts }, { default: QuotePdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("./register-fonts"),
        import("./QuotePdfDocument"),
    ]);
    registerQuotePdfFonts();
    const logoSrc = await resolvePdfLogo(data.logoSrc);
    // renderToBuffer imzası ReactElement<DocumentProps> bekler; component'imiz
    // <Document> döndürür ama prop tipi {data} olduğundan yapısal eşleşme yok → cast.
    const element = createElement(QuotePdfDocument, { data: { ...data, logoSrc } }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buf = await renderToBuffer(element);
    return Buffer.from(buf);
}
