/**
 * RFQ belgesi: tedarikçiye gönderilen self-contained HTML snapshot (gönderim anında
 * arşivlenir). Müşteri quote-archive-html deseni; logo data-URI gömme aynı helper
 * (inlineLogoAsDataUri) ile yeniden kullanılır.
 */
import { createElement } from "react";
import RfqDocument, { RFQ_PAGE_CSS } from "@/app/dashboard/purchase/rfqs/components/RfqDocument";
import { inlineLogoAsDataUri } from "@/lib/quote-archive-html";
import type { RfqDocData } from "@/lib/rfq-document-helpers";
import type { RfqDetail, RfqVendorWithPrices } from "@/lib/supabase/supplier-rfqs";
import type { CompanySettingsRow } from "@/lib/database.types";

export function buildRfqDocData(
    detail: RfqDetail,
    vendor: RfqVendorWithPrices,
    company?: CompanySettingsRow | null,
): RfqDocData {
    return {
        rfqNo: detail.rfq_number,
        title: detail.title ?? "",
        rfqDate: detail.rfq_date,
        dueDate: detail.due_date ?? "",
        currency: detail.currency,
        notes: detail.notes ?? "",

        sellerName: company?.name ?? "",
        sellerTel: company?.phone ?? "",
        sellerEmail: company?.email ?? "",
        sellerAddr: company?.address ?? "",
        sellerTaxId: company?.tax_no ?? "",
        sellerWeb: company?.website ?? "",
        logoSrc: company?.logo_url ?? null,

        vendorName: vendor.vendor_name,
        vendorContact: "",
        vendorEmail: vendor.vendor_email ?? "",

        lines: detail.lines.map((l) => ({
            position: l.position + 1,
            code: l.product_code ?? "",
            description: l.description ?? "",
            qty: String(l.quantity),
            unit: l.unit ?? "",
            targetDate: l.target_date ?? "",
            notes: l.notes ?? "",
        })),
    };
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function renderRfqArchiveHtml(data: RfqDocData): Promise<string> {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const inlinedLogo = await inlineLogoAsDataUri(data.logoSrc);
    const renderData = inlinedLogo ? { ...data, logoSrc: inlinedLogo } : data;
    const body = renderToStaticMarkup(createElement(RfqDocument, { data: renderData }));
    return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(data.rfqNo || "Fiyat Talebi")} — Fiyat Talebi</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@600;700;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root { --font-doc-heading: 'Montserrat'; --font-doc-body: 'Inter'; }
html, body { margin: 0; padding: 0; background: #d0d5dd; }
${RFQ_PAGE_CSS}
</style>
</head>
<body>
${body}
</body>
</html>`;
}
