/**
 * Faz 4 (V7) — Teklif PDF arşivi: dondurulmuş HTML snapshot.
 *
 * İki saf fonksiyon:
 *  - buildQuoteDataFromDetail: DB `QuoteDetail` → `QuoteData` (server tarafı tek
 *    source-of-truth; şu ana dek QuoteData yalnız QuoteForm client'ında kuruluyordu).
 *  - renderQuoteArchiveHtml: `QuoteData` → self-contained statik HTML (renkler
 *    concrete hex, font var'ları + Google Fonts wrapper'da gömülü). Send anında
 *    arşivlenir; template sonradan değişse bile arşiv aynen kalır (drift'e bağışık).
 *
 * QuoteDocument "use client" DEĞİL (Faz 4'te kaldırıldı) → server graph'te gerçek
 * fonksiyon olarak renderToStaticMarkup ile render edilir.
 */
import { createElement } from "react";
import QuoteDocument, { PAGE_CSS } from "@/app/dashboard/quotes/components/QuoteDocument";
import type { QuoteData, Currency } from "@/app/dashboard/quotes/components/quote-types";
import type { QuoteDetail } from "@/lib/mock-data";
import type { CompanySettingsRow } from "@/lib/database.types";

const QD_CURRENCIES: Currency[] = ["TRY", "USD", "EUR"];
// QuoteData.status union "revised" içermez (QuoteStatus içerir). Arşiv send anında
// üretilir → status "sent"; yine de defansif map: bilinmeyen/revised → "sent".
const QD_STATUSES: QuoteData["status"][] = ["draft", "sent", "accepted", "rejected", "expired"];

/**
 * DB `QuoteDetail`'dan render edilebilir `QuoteData` üretir.
 * Seller alanları quote snapshot'tan (sent'te donmuş); boşsa company_settings fallback.
 */
export function buildQuoteDataFromDetail(detail: QuoteDetail, company?: CompanySettingsRow | null): QuoteData {
    const currency: Currency = (QD_CURRENCIES as string[]).includes(detail.currency)
        ? (detail.currency as Currency)
        : "TRY";
    const status: QuoteData["status"] = (QD_STATUSES as string[]).includes(detail.status)
        ? (detail.status as QuoteData["status"])
        : "sent";

    const rows = detail.lines.map((l) => ({
        code: l.productCode ?? "",
        lead: l.leadTime ?? "",
        desc: l.description ?? "",
        qty: l.quantity != null ? String(l.quantity) : "",
        price: l.unitPrice != null ? String(l.unitPrice) : "",
        hs: l.hsCode ?? "",
        kg: l.weightKg != null ? String(l.weightKg) : "",
        size: l.sizeText ?? "",
    }));

    const totalKg = detail.lines.reduce((s, l) => s + (l.weightKg ?? 0), 0);

    return {
        // Seller (quote snapshot öncelikli, company_settings fallback)
        sellerName: detail.sellerName || company?.name || "",
        sellerTel: detail.sellerPhone || company?.phone || "",
        sellerEmail: detail.sellerEmail || company?.email || "",
        sellerAddr: detail.sellerAddress || company?.address || "",
        sellerTaxId: detail.sellerTaxId || company?.tax_no || "",
        sellerWeb: detail.sellerWebsite || company?.website || "",
        logoSrc: detail.sellerLogoUrl || company?.logo_url || null,

        // Customer
        custCompany: detail.customerName ?? "",
        custContact: detail.customerContact ?? "",
        custPhone: detail.customerPhone ?? "",
        custEmail: detail.customerEmail ?? "",
        custAddress: detail.customerAddress ?? "",

        // Quote details
        quoteNo: detail.quoteNumber ?? "",
        quoteDate: detail.quoteDate ?? "",
        validUntil: detail.validUntil ?? "",
        salesRep: detail.salesRep ?? "",
        salesPhone: detail.salesPhone ?? "",
        salesEmail: detail.salesEmail ?? "",
        currency,
        vatRate: detail.vatRate,

        rows,

        // Totals (DB snapshot — yeniden hesaplama yok)
        subtotal: detail.subtotal,
        discountAmount: detail.discountAmount,
        vatTotal: detail.vatTotal,
        grandTotal: detail.grandTotal,
        totalKg,

        // Footer
        notes: detail.notes ?? "",
        deliveryMethod: detail.deliveryMethod ?? "",
        paymentMethod: detail.paymentMethod ?? "",
        signatures: [
            { role: "Prepared by", roleTr: "Hazırlayan", name: detail.sigPrepared ?? "", title: "" },
            { role: "Approved by", roleTr: "Onay", name: detail.sigApproved ?? "", title: "" },
            { role: "Manager Seal", roleTr: "Mühür Onayı", name: detail.sigManager ?? "", title: "" },
        ],

        status,
    };
}

function escapeHtml(s: string): string {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

/**
 * `QuoteData` → bağımsız açılabilir/yazdırılabilir self-contained HTML.
 *
 * Self-containment: QuoteDocument print renkleri concrete hex (gömülü); PAGE_CSS +
 * PRINT_CSS component markup'ında zaten `<style>` ile var. Wrapper EK olarak font
 * CSS var tanımı (`:root --font-doc-*`) + Google Fonts link sağlar (standalone HTML'de
 * uygulama font değişkenleri çözülmez). NOT: Google Fonts link view-time external
 * bağımlılık — arşiv "tam offline self-contained" DEĞİL (kullanıcı byte-exact-olmayan
 * HTML'i kabul etti); ileride @font-face binary inline ile kapatılabilir.
 */
export async function renderQuoteArchiveHtml(data: QuoteData): Promise<string> {
    // Dinamik import: Next.js App Router server graph'inde `react-dom/server` STATİK
    // import'u Turbopack tarafından reddedilir (footgun guard). Dinamik import statik
    // analizi atlar, runtime'da server'da çalışır.
    const { renderToStaticMarkup } = await import("react-dom/server");
    const body = renderToStaticMarkup(createElement(QuoteDocument, { data }));
    return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.quoteNo || "Teklif")} — Teklif Arşivi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root { --font-doc-heading: 'Montserrat'; --font-doc-body: 'Inter'; }
html, body { margin: 0; padding: 0; background: #d0d5dd; }
${PAGE_CSS}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
