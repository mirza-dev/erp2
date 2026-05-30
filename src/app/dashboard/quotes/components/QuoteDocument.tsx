// Faz 4 (V7): "use client" KALDIRILDI — bu component saf fonksiyon (hook YOK,
// browser API YOK; yalnız inline style + dangerouslySetInnerHTML CSS = SSR-safe).
// Server graph'te renderToStaticMarkup ile arşiv HTML üretimi için (quote-archive-html.ts)
// gerçek fonksiyon olarak import edilebilmesi gerekiyor — "use client" olsaydı bundler
// onu client-reference proxy'ye çevirip render'ı boşaltırdı. Client preview sayfası (Mod A)
// bu shared component'i sorunsuz import etmeye devam eder (tek template korunur).

import type { QuoteData } from "./quote-types";

// ── Constants ─────────────────────────────────────────────────────────────────

const FONT = {
    heading: "var(--font-doc-heading), 'Montserrat', system-ui, sans-serif",
    body: "var(--font-doc-body), 'Inter', system-ui, sans-serif",
    mono: "'JetBrains Mono', 'Geist Mono', monospace",
};

const C = {
    brand: "#0072BC",
    brandLight: "rgba(0,114,188,0.08)",
    brandBorder: "rgba(0,114,188,0.2)",
    text: "#1a1a2e",
    muted: "#64748b",
    subtle: "#94a3b8",
    border: "#d0d7de",
    borderLight: "#e8ecf0",
    zebraEven: "#f6f8fa",
    footerBg: "#f0f4f8",
    white: "#ffffff",
};

const SYM: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€" };

import { BILINGUAL_LABELS } from "@/lib/quote-document-helpers";

const L = BILINGUAL_LABELS;

function fmt(n: number) {
    return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(s: string) {
    if (!s) return "—";
    try {
        const [y, m, d] = s.split("-");
        return `${d}.${m}.${y}`;
    } catch {
        return s;
    }
}

// ── @page rule (top-level, NOT inside @media print) ──────────────────────────
// margin: 0 → browser has no space to show its default headers/footers (title, URL, date)

export const PAGE_CSS = `
@page {
    size: A4 portrait;
    margin: 8mm;
}
`;

// ── Print CSS (scoped to #quote-document) ────────────────────────────────────

export const PRINT_CSS = `
@media print {
    #quote-document, #quote-document * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    #quote-document {
        width: 100% !important;
        padding: 0 !important;
        box-sizing: border-box !important;
        min-height: auto !important;
        box-shadow: none !important;
        margin: 0 !important;
        border: 1.5px solid #222 !important;
        overflow: visible !important;
        -webkit-box-decoration-break: clone !important;
        box-decoration-break: clone !important;
    }
    /* Tbody satırları bölünmesin — sığmazsa tümüyle sonraki sayfaya */
    #quote-document table tbody tr {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }
    /* Tablo dış çerçevesi */
    #quote-document table {
        border-collapse: collapse !important;
        border: 1px solid #d0d7de !important;
    }
    #quote-document .doc-brand-bg,
    #quote-document .doc-brand-bg * {
        background: #0072BC !important;
        color: white !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    #quote-document .doc-brand-text {
        color: #0072BC !important;
    }
    #quote-document .doc-zebra-even td {
        background: #f6f8fa !important;
    }
    #quote-document .doc-footer-band {
        background: #f0f4f8 !important;
    }
    #quote-document .doc-no-break {
        break-inside: avoid;
        page-break-inside: avoid;
    }
    #quote-document .doc-watermark {
        color: rgba(0,114,188,0.05) !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
}
`;

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
    data: QuoteData;
}

// Faz 4c: TR ana / EN alt italic — common <th> sub-label style.
const enSubLabelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "7.5px",
    opacity: 0.65,
    fontStyle: "italic",
    textTransform: "none" as const,
    fontWeight: 400,
    marginTop: "1px",
};

// Faz 4c: Section heading EN-italic suffix (used in notes/terms/signatures heads).
const enSectionSuffixStyle: React.CSSProperties = {
    fontWeight: 400,
    fontStyle: "italic",
    opacity: 0.7,
    textTransform: "none" as const,
    letterSpacing: "normal",
};

export default function QuoteDocument({ data }: Props) {
    const sym = SYM[data.currency] ?? "₺";

    // ── Section styles ────────────────────────────────────────────────────────

    const docStyle: React.CSSProperties = {
        position: "relative",
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        background: C.white,
        border: "1.5px solid #222",
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        fontFamily: FONT.body,
        color: C.text,
        fontSize: "11px",
        lineHeight: 1.5,
        overflow: "visible",
    };

    const headerBandStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        alignItems: "center",
        gap: "20px",
        padding: "20px 28px",
        background: C.brand,
        color: C.white,
    };

    const titleBandStyle: React.CSSProperties = {
        padding: "14px 28px 12px",
        textAlign: "center",
        borderBottom: `1px solid ${C.border}`,
        background: C.white,
    };

    const metaGridStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        borderBottom: `1px solid ${C.border}`,
    };

    const metaColStyle: React.CSSProperties = {
        padding: "14px 20px",
        display: "flex",
        flexDirection: "column",
        gap: "0",
    };

    const metaColRightStyle: React.CSSProperties = {
        ...metaColStyle,
        borderLeft: `1px solid ${C.border}`,
    };

    const metaSectionHeadStyle: React.CSSProperties = {
        fontFamily: FONT.heading,
        fontSize: "8px",
        fontWeight: 700,
        color: C.brand,
        textTransform: "uppercase" as const,
        letterSpacing: "0.1em",
        paddingBottom: "6px",
        borderBottom: `1px solid ${C.brandBorder}`,
        marginBottom: "8px",
    };

    const metaRowStyle: React.CSSProperties = {
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gap: "6px",
        alignItems: "baseline",
        paddingBottom: "5px",
        borderBottom: `0.5px solid ${C.borderLight}`,
        marginBottom: "4px",
    };

    const metaLabelStyle: React.CSSProperties = {
        fontSize: "8.5px",
        fontWeight: 600,
        color: C.muted,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
    };

    const metaLabelEnStyle: React.CSSProperties = {
        display: "block",
        fontSize: "7px",
        fontWeight: 400,
        color: C.subtle,
        fontStyle: "italic",
        textTransform: "none" as const,
        letterSpacing: "normal",
    };

    const metaValueStyle: React.CSSProperties = {
        fontSize: "10px",
        fontWeight: 500,
        color: C.text,
    };

    const tableSectionStyle: React.CSSProperties = {
        borderBottom: `1px solid ${C.border}`,
    };

    const tableLabelStyle: React.CSSProperties = {
        padding: "8px 20px 6px",
        fontFamily: FONT.heading,
        fontSize: "8px",
        fontWeight: 700,
        color: C.brand,
        textTransform: "uppercase" as const,
        letterSpacing: "0.1em",
        background: C.zebraEven,
        borderBottom: `1px solid ${C.border}`,
    };

    const thStyle: React.CSSProperties = {
        padding: "7px 8px",
        fontSize: "8.5px",
        fontFamily: FONT.heading,
        fontWeight: 700,
        color: C.white,
        background: C.brand,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
        border: `0.5px solid rgba(255,255,255,0.2)`,
        whiteSpace: "nowrap" as const,
        textAlign: "left" as const,
        verticalAlign: "bottom" as const,
    };

    const tdStyle: React.CSSProperties = {
        padding: "5px 8px",
        fontSize: "10px",
        border: `0.5px solid ${C.border}`,
        verticalAlign: "middle" as const,
        color: C.text,
    };

    const tdMonoStyle: React.CSSProperties = {
        ...tdStyle,
        fontFamily: FONT.mono,
        fontSize: "10px",
    };

    const totalsSectionStyle: React.CSSProperties = {
        display: "flex",
        justifyContent: "flex-end",
        padding: "12px 20px",
        borderBottom: `1px solid ${C.border}`,
    };

    const totalsTableStyle: React.CSSProperties = {
        width: "300px",
        borderCollapse: "collapse" as const,
        border: `1px solid ${C.border}`,
    };

    const totalLabelTdStyle: React.CSSProperties = {
        padding: "6px 12px",
        fontSize: "10px",
        fontWeight: 600,
        color: C.muted,
        textAlign: "right" as const,
        border: `0.5px solid ${C.border}`,
        background: C.zebraEven,
    };

    const totalLabelEnStyle: React.CSSProperties = {
        display: "block",
        fontSize: "7.5px",
        fontWeight: 400,
        color: C.subtle,
        fontStyle: "italic",
        marginTop: "1px",
        letterSpacing: "normal",
    };

    const totalValueTdStyle: React.CSSProperties = {
        padding: "6px 12px",
        fontSize: "10px",
        fontFamily: FONT.mono,
        fontWeight: 500,
        color: C.text,
        textAlign: "right" as const,
        border: `0.5px solid ${C.border}`,
        whiteSpace: "nowrap" as const,
    };

    const notesSectionStyle: React.CSSProperties = {
        padding: "14px 20px",
        borderBottom: `1px solid ${C.border}`,
    };

    const sigSectionStyle: React.CSSProperties = {
        padding: "14px 20px 22px",
        borderBottom: `1px solid ${C.border}`,
    };

    const footerBandStyle: React.CSSProperties = {
        padding: "10px 20px",
        background: C.footerBg,
        borderTop: `1px solid ${C.border}`,
    };

    const sectionHeadStyle: React.CSSProperties = {
        fontFamily: FONT.heading,
        fontSize: "8px",
        fontWeight: 700,
        color: C.brand,
        textTransform: "uppercase" as const,
        letterSpacing: "0.1em",
        marginBottom: "10px",
    };

    // Faz 4c: Terms band — 3-column grid (Delivery | Validity | Payment).
    const termsColStyle: React.CSSProperties = {
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column" as const,
        gap: "4px",
    };

    const termsLabelStyle: React.CSSProperties = {
        fontFamily: FONT.heading,
        fontSize: "9px",
        fontWeight: 700,
        color: C.text,
        textTransform: "uppercase" as const,
        letterSpacing: "0.05em",
    };

    const termsLabelEnStyle: React.CSSProperties = {
        fontSize: "7.5px",
        fontWeight: 400,
        fontStyle: "italic",
        color: C.subtle,
        textTransform: "none" as const,
        marginTop: "1px",
    };

    const termsValueStyle: React.CSSProperties = {
        fontSize: "10px",
        color: C.text,
        whiteSpace: "pre-wrap" as const,
        marginTop: "2px",
    };

    return (
        <>
            <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
            <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

            <div id="quote-document" style={docStyle}>

                {/* ── Header Band ── */}
                <div className="doc-brand-bg doc-no-break" style={headerBandStyle}>
                    {/* Logo */}
                    <div style={{ flexShrink: 0 }}>
                        {data.logoSrc
                            // PDF/print için <img> bilinçli tercih: next/image lazy-load + optimization servisi
                            // print render'da görünmez logo veya extra request yaratabiliyor.
                            // eslint-disable-next-line @next/next/no-img-element
                            ? <img src={data.logoSrc} alt="logo" style={{ width: "96px", height: "96px", objectFit: "contain", background: "white", borderRadius: "6px", padding: "4px" }} />
                            : <div style={{ width: "96px", height: "96px", background: "rgba(255,255,255,0.15)", borderRadius: "6px", display: "grid", placeItems: "center" }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                            </div>
                        }
                    </div>

                    {/* Seller info */}
                    <div>
                        <div style={{ fontFamily: FONT.heading, fontSize: "17px", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: "6px" }}>
                            {data.sellerName || "Firma Adı"}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "4px 16px", fontSize: "9.5px", color: "rgba(255,255,255,0.82)" }}>
                            {data.sellerTel   && <span>Tel: {data.sellerTel}</span>}
                            {data.sellerEmail && <span>E: {data.sellerEmail}</span>}
                            {data.sellerWeb   && <span>Web: {data.sellerWeb}</span>}
                            {data.sellerTaxId && <span>VKN: {data.sellerTaxId}</span>}
                            {data.sellerAddr  && <span style={{ width: "100%" }}>{data.sellerAddr}</span>}
                        </div>
                    </div>

                    {/* Doc reference */}
                    <div style={{ textAlign: "right" as const, flexShrink: 0 }}>
                        <div style={{ fontFamily: FONT.mono, fontSize: "12px", fontWeight: 600, marginBottom: "4px", background: "rgba(255,255,255,0.15)", padding: "4px 10px", borderRadius: "4px", letterSpacing: "0.04em" }}>
                            {data.quoteNo || "TKL-—"}
                        </div>
                        <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.7)", marginTop: "6px" }}>
                            {fmtDate(data.quoteDate)}
                        </div>
                        {data.validUntil && (
                            <div style={{ fontSize: "9px", color: "rgba(255,255,255,0.6)", marginTop: "2px" }}>
                                {L.validity.tr}: {fmtDate(data.validUntil)}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Title Band ── */}
                <div className="doc-no-break" style={titleBandStyle}>
                    <div style={{ fontFamily: FONT.heading, fontSize: "20px", fontWeight: 800, letterSpacing: "0.08em", color: C.brand }}>
                        {L.title.tr}
                        <span style={{ margin: "0 12px", color: C.border, fontWeight: 300 }}>|</span>
                        <span style={{ fontStyle: "italic", fontWeight: 600, letterSpacing: "0.04em" }}>{L.title.en}</span>
                    </div>
                    <div style={{ marginTop: "8px", height: "2px", background: `linear-gradient(90deg, transparent, ${C.brand}, transparent)`, borderRadius: "1px" }} />
                </div>

                {/* ── Meta Grid ── */}
                <div className="doc-no-break" style={metaGridStyle}>
                    {/* Left: Customer */}
                    <div style={metaColStyle}>
                        <div className="doc-brand-text" style={metaSectionHeadStyle}>
                            {L.customer.tr} <span style={enSectionSuffixStyle}>/ {L.customer.en}</span>
                        </div>
                        {[
                            [L.company, data.custCompany],
                            [L.contact, data.custContact],
                            [L.phone,   data.custPhone],
                            [L.email,   data.custEmail],
                        ].map(([label, value]) => {
                            const lab = label as { tr: string; en: string };
                            const val = value as string;
                            return val ? (
                                <div key={lab.tr} style={metaRowStyle}>
                                    <span style={metaLabelStyle}>
                                        {lab.tr}
                                        <span style={metaLabelEnStyle}>{lab.en}</span>
                                    </span>
                                    <span style={metaValueStyle}>{val}</span>
                                </div>
                            ) : null;
                        })}
                    </div>

                    {/* Right: Quote details */}
                    <div style={metaColRightStyle}>
                        <div className="doc-brand-text" style={metaSectionHeadStyle}>
                            {L.quoteDetails.tr} <span style={enSectionSuffixStyle}>/ {L.quoteDetails.en}</span>
                        </div>
                        {[
                            [L.salesRep,   data.salesRep],
                            [L.phone,      data.salesPhone],
                            [L.email,      data.salesEmail],
                            [L.quoteNo,    data.quoteNo],
                            [L.date,       fmtDate(data.quoteDate)],
                            // Faz 4c Review: L.validUntil kaldırıldı, L.validity tek source
                            // (Geçerlilik Tarihi / Valid Until — terms band + footer ile aynı).
                            [L.validity,   data.validUntil ? fmtDate(data.validUntil) : ""],
                            [L.currency,   data.currency],
                        ].map(([label, value]) => {
                            const lab = label as { tr: string; en: string };
                            const val = value as string;
                            return val ? (
                                <div key={lab.tr} style={metaRowStyle}>
                                    <span style={metaLabelStyle}>
                                        {lab.tr}
                                        <span style={metaLabelEnStyle}>{lab.en}</span>
                                    </span>
                                    <span style={metaValueStyle}>{val}</span>
                                </div>
                            ) : null;
                        })}
                    </div>
                </div>

                {/* ── Items Table ── */}
                <div style={tableSectionStyle}>
                    <div style={tableLabelStyle}>
                        {L.lineItems.tr} <span style={enSectionSuffixStyle}>/ {L.lineItems.en}</span>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                        <thead>
                            <tr>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "28px", textAlign: "center" as const }}>
                                    {L.rowNo.tr}
                                    <span style={enSubLabelStyle}>{L.rowNo.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "88px" }}>
                                    {L.productCode.tr}
                                    <span style={enSubLabelStyle}>{L.productCode.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "80px" }}>
                                    {L.leadTime.tr}
                                    <span style={enSubLabelStyle}>{L.leadTime.en}</span>
                                </th>
                                {/* Faz 4a Review: PMT brand "Ölçü / Size" kolonu */}
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "60px" }}>
                                    {L.size.tr}
                                    <span style={enSubLabelStyle}>{L.size.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={thStyle}>
                                    {L.description.tr}
                                    <span style={enSubLabelStyle}>{L.description.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "52px", textAlign: "center" as const }}>
                                    {L.qty.tr}
                                    <span style={enSubLabelStyle}>{L.qty.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "100px", textAlign: "right" as const }}>
                                    {L.unitPrice.tr}
                                    <span style={enSubLabelStyle}>{L.unitPrice.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "110px", textAlign: "right" as const }}>
                                    {L.totalPrice.tr}
                                    <span style={enSubLabelStyle}>{L.totalPrice.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "80px" }}>
                                    {L.hsCode.tr}
                                    <span style={enSubLabelStyle}>{L.hsCode.en}</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "62px", textAlign: "right" as const }}>
                                    {L.weight.tr}
                                    <span style={enSubLabelStyle}>{L.weight.en}</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row, idx) => {
                                const qty = parseFloat(row.qty) || 0;
                                const price = parseFloat(row.price) || 0;
                                const lineTotal = qty * price;
                                // V3-B6: gerçek (içerikli) satırda 0 fiyat "0.00" gösterilir
                                // ("—" değil); tamamen boş filler satırlar "—" kalır.
                                const isRealRow = !!(row.code || row.desc || row.qty || row.size || row.lead || row.hs || row.kg);
                                const isEven = idx % 2 === 1;
                                const rowBg = isEven ? C.zebraEven : C.white;
                                return (
                                    <tr key={idx} className={isEven ? "doc-zebra-even" : ""}>
                                        <td style={{ ...tdStyle, background: rowBg, textAlign: "center" as const, color: C.muted, fontFamily: FONT.mono, fontSize: "9px" }}>{idx + 1}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, fontSize: "9.5px" }}>{row.code || "—"}</td>
                                        <td style={{ ...tdStyle, background: rowBg }}>{row.lead || "—"}</td>
                                        {/* Faz 4a Review: Size kolonu (PMT brand "Ölçü") */}
                                        <td style={{ ...tdStyle, background: rowBg }}>{row.size || "—"}</td>
                                        <td style={{ ...tdStyle, background: rowBg }}>{row.desc || "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "center" as const }}>{row.qty || "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "right" as const }}>{isRealRow ? `${sym} ${fmt(price)}` : "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "right" as const, fontWeight: 600 }}>{isRealRow ? `${sym} ${fmt(lineTotal)}` : "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, fontSize: "9.5px" }}>{row.hs || "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "right" as const }}>{row.kg || "—"}</td>
                                    </tr>
                                );
                            })}
                            {data.rows.length === 0 && (
                                <tr>
                                    {/* Faz 4a Review: colSpan 9 → 10 (Size kolonu eklendi) */}
                                    <td colSpan={10} style={{ ...tdStyle, textAlign: "center" as const, color: C.subtle, padding: "20px" }}>
                                        — {L.emptyRows.tr} / {L.emptyRows.en} —
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* ── Totals ── */}
                <div style={totalsSectionStyle}>
                    <table style={totalsTableStyle}>
                        <tbody>
                            <tr>
                                <td style={totalLabelTdStyle}>
                                    {L.subtotal.tr}
                                    <span style={totalLabelEnStyle}>{L.subtotal.en}</span>
                                </td>
                                <td style={totalValueTdStyle}>{sym} {fmt(data.subtotal)}</td>
                            </tr>
                            {/* Faz 3 (V7): header iskonto — yalnız >0 iken (eski teklifler temiz kalır) */}
                            {data.discountAmount > 0 && (
                                <tr>
                                    <td style={totalLabelTdStyle}>
                                        {L.discount.tr}
                                        <span style={totalLabelEnStyle}>{L.discount.en}</span>
                                    </td>
                                    <td style={totalValueTdStyle}>−{sym} {fmt(data.discountAmount)}</td>
                                </tr>
                            )}
                            <tr>
                                <td style={totalLabelTdStyle}>
                                    {L.vat.tr} ({data.vatRate}%)
                                    <span style={totalLabelEnStyle}>{L.vat.en}</span>
                                </td>
                                <td style={totalValueTdStyle}>{sym} {fmt(data.vatTotal)}</td>
                            </tr>
                            {data.totalKg > 0 && (
                                <tr>
                                    <td style={{ ...totalLabelTdStyle, color: C.subtle, fontWeight: 400 }}>
                                        {L.totalWeight.tr}
                                        <span style={totalLabelEnStyle}>{L.totalWeight.en}</span>
                                    </td>
                                    <td style={{ ...totalValueTdStyle, color: C.muted }}>{fmt(data.totalKg)} kg</td>
                                </tr>
                            )}
                            <tr>
                                <td style={{ ...totalLabelTdStyle, background: C.brand, color: C.white, fontFamily: FONT.heading, fontWeight: 700, fontSize: "11px", letterSpacing: "0.04em" }} className="doc-brand-bg">
                                    {L.grandTotal.tr}
                                    <span style={{ ...totalLabelEnStyle, color: "rgba(255,255,255,0.7)" }}>{L.grandTotal.en}</span>
                                </td>
                                <td style={{ ...totalValueTdStyle, background: C.brand, color: C.white, fontSize: "13px", fontWeight: 700 }} className="doc-brand-bg">
                                    {sym} {fmt(data.grandTotal)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── Faz 4c: Terms band — 3-column grid (Delivery | Validity | Payment) ──
                    Plan §516-519 PMT brand layout: Teslimat | Geçerlilik | Ödeme yan yana
                    tek satır. En az biri dolu ise section render (üçü de boşsa hiç gösterilmez).
                    Boş hücreler "—" placeholder ile 3-column tutarlılık sağlar. */}
                {(data.deliveryMethod || data.validUntil || data.paymentMethod) && (
                    <div className="doc-no-break" style={notesSectionStyle}>
                        <div style={sectionHeadStyle}>
                            {L.termsTitle.tr} <span style={enSectionSuffixStyle}>/ {L.termsTitle.en}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", border: `0.5px solid ${C.border}`, background: C.zebraEven }}>
                            <div style={termsColStyle}>
                                <div style={termsLabelStyle}>
                                    {L.delivery.tr}
                                    <div style={termsLabelEnStyle}>{L.delivery.en}</div>
                                </div>
                                <div style={termsValueStyle}>{data.deliveryMethod || "—"}</div>
                            </div>
                            <div style={{ ...termsColStyle, borderLeft: `0.5px solid ${C.border}` }}>
                                <div style={termsLabelStyle}>
                                    {L.validity.tr}
                                    <div style={termsLabelEnStyle}>{L.validity.en}</div>
                                </div>
                                <div style={termsValueStyle}>{data.validUntil ? fmtDate(data.validUntil) : "—"}</div>
                            </div>
                            <div style={{ ...termsColStyle, borderLeft: `0.5px solid ${C.border}` }}>
                                <div style={termsLabelStyle}>
                                    {L.payment.tr}
                                    <div style={termsLabelEnStyle}>{L.payment.en}</div>
                                </div>
                                <div style={termsValueStyle}>{data.paymentMethod || "—"}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── Notes & Terms ── */}
                {data.notes && (
                    <div className="doc-no-break" style={notesSectionStyle}>
                        <div style={sectionHeadStyle}>
                            {L.notes.tr} <span style={enSectionSuffixStyle}>/ {L.notes.en}</span>
                        </div>
                        <div style={{ fontSize: "10px", color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" as const, padding: "10px 14px", background: C.zebraEven, border: `0.5px solid ${C.border}`, borderRadius: "3px" }}>
                            {data.notes}
                        </div>
                    </div>
                )}

                {/* ── Signatures ── */}
                <div className="doc-no-break" style={sigSectionStyle}>
                    <div style={sectionHeadStyle}>
                        {L.signatures.tr} <span style={enSectionSuffixStyle}>/ {L.signatures.en}</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px" }}>
                        {data.signatures.map((sig, i) => (
                            <div key={i} style={{ display: "flex", flexDirection: "column" as const }}>
                                {/* Role — TR ana, EN alt italic (PMT brand hierarchy) */}
                                <div style={{ fontSize: "10px", fontWeight: 700, fontFamily: FONT.heading, color: C.text, marginBottom: "2px" }}>{sig.roleTr}</div>
                                <div style={{ fontSize: "8.5px", color: C.muted, fontStyle: "italic", marginBottom: "6px" }}>{sig.role}</div>
                                {/* Name & Title (shown above signature line) */}
                                <div style={{ fontSize: "10.5px", fontWeight: 600, color: C.text, minHeight: "16px" }}>{sig.name || ""}</div>
                                <div style={{ fontSize: "9.5px", color: C.muted, minHeight: "14px", marginBottom: "6px" }}>{sig.title || ""}</div>
                                {/* Signature line */}
                                <div style={{ height: "44px", borderBottom: `1px solid ${C.border}` }} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Faz 4c: Footer band — Merkez/HQ + Tel + Web (2-row layout) ──
                    Plan §527 PMT brand layout'unda 4 etiket gösterilir:
                    Fabrika | Merkez | Tel | Web. Bu implementasyonda yalnız 3
                    etiket var (Fabrika atlandı) çünkü mevcut data shape
                    `QuoteData.sellerAddr` tek alan; PMT'nin çoğu teklif
                    senaryosunda tek operasyon adresi yeterli.

                    Plan sapması (kabul edilen scope kararı, Faz 4c Review 2026-05-25):
                    Fabrika ayrı bir alan olarak gerekirse Faz 4d tetiklenmeli —
                    QuoteData'ya `sellerFactoryAddr: string` eklenir, company_settings
                    schema'sında karşılığı tanımlanır, form UI'da ayrı input alanı
                    açılır. Şu anda PMT'de tek-merkez yeterli olduğu için bu Faz'a
                    girilmedi (over-engineering riski). */}
                <div className="doc-footer-band" style={footerBandStyle}>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: "4px 14px", fontSize: "8.5px", color: C.muted, fontFamily: FONT.body }}>
                        {data.sellerAddr && (
                            <span>
                                <strong style={{ color: C.text }}>{L.hq.tr} / {L.hq.en}:</strong> {data.sellerAddr}
                            </span>
                        )}
                        {data.sellerTel && (
                            <span>
                                <strong style={{ color: C.text }}>{L.tel.tr}:</strong> {data.sellerTel}
                            </span>
                        )}
                        {data.sellerWeb && (
                            <span>
                                <strong style={{ color: C.text }}>{L.web.tr}:</strong> {data.sellerWeb}
                            </span>
                        )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "6px", fontSize: "7.5px", color: C.subtle }}>
                        <span style={{ fontFamily: FONT.heading, fontWeight: 600, color: C.muted }}>
                            {data.sellerName}
                        </span>
                        <span>
                            {L.confidential.tr} / {L.confidential.en}
                        </span>
                        <span>
                            {data.validUntil ? `${L.validity.tr}: ${fmtDate(data.validUntil)}` : ""}
                        </span>
                    </div>
                </div>

            </div>
        </>
    );
}
