/**
 * RFQ PDF eki üretimi — @react-pdf/renderer. quote-pdf deseni; fontlar + logo
 * çözümleme quote-pdf modülüyle PAYLAŞILIR (tek kaynak). Lazy import (yoga ağır).
 */
import { createElement } from "react";
import type { RfqDocData } from "@/lib/rfq-document-helpers";
import { resolvePdfLogo } from "@/lib/quote-pdf";

/** E-posta eki dosya adı — `Fiyat-Talebi-<no>.pdf`. */
export function rfqPdfFilename(rfqNo: string): string {
    const safe = (rfqNo || "").replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
    return `Fiyat-Talebi-${safe || "Belge"}.pdf`;
}

/** RfqDocData → A4 RFQ belgesi PDF buffer'ı (quote font kaydı idempotent reuse). */
export async function renderRfqPdfBuffer(data: RfqDocData): Promise<Buffer> {
    const [{ renderToBuffer }, { registerQuotePdfFonts }, { default: RfqPdfDocument }] = await Promise.all([
        import("@react-pdf/renderer"),
        import("@/lib/quote-pdf/register-fonts"),
        import("./RfqPdfDocument"),
    ]);
    registerQuotePdfFonts();
    const logoSrc = await resolvePdfLogo(data.logoSrc);
    const element = createElement(RfqPdfDocument, { data: { ...data, logoSrc } }) as unknown as Parameters<typeof renderToBuffer>[0];
    const buf = await renderToBuffer(element);
    return Buffer.from(buf);
}
