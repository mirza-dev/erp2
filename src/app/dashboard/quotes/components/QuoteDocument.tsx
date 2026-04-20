"use client";

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

const PAGE_CSS = `
@page {
    size: A4 portrait;
    margin: 8mm;
}
`;

// ── Print CSS (scoped to #quote-document) ────────────────────────────────────

const PRINT_CSS = `
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
    /* Thead her sayfada tekrar render edilsin */
    #quote-document table thead {
        display: table-header-group !important;
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

export default function QuoteDocument({ data }: Props) {
    const sym = SYM[data.currency] ?? "₺";

    // ── Section styles ────────────────────────────────────────────────────────

    const docStyle: React.CSSProperties = {
        position: "relative",
        width: "210mm",
        minHeight: "297mm",
        margin: "0 auto",
        background: C.white,
        border: `1.5px solid ${C.brand}`,
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
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: C.footerBg,
        borderTop: `1px solid ${C.border}`,
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
                                Geçerli: {fmtDate(data.validUntil)}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Title Band ── */}
                <div className="doc-no-break" style={titleBandStyle}>
                    <div style={{ fontFamily: FONT.heading, fontSize: "20px", fontWeight: 800, letterSpacing: "0.08em", color: C.brand }}>
                        TEKLİF
                        <span style={{ margin: "0 12px", color: C.border, fontWeight: 300 }}>|</span>
                        <span style={{ fontStyle: "italic", fontWeight: 600, letterSpacing: "0.04em" }}>QUOTATION</span>
                    </div>
                    <div style={{ marginTop: "8px", height: "2px", background: `linear-gradient(90deg, transparent, ${C.brand}, transparent)`, borderRadius: "1px" }} />
                </div>

                {/* ── Meta Grid ── */}
                <div className="doc-no-break" style={metaGridStyle}>
                    {/* Left: Customer */}
                    <div style={metaColStyle}>
                        <div className="doc-brand-text" style={metaSectionHeadStyle}>Müşteri / Customer</div>
                        {[
                            ["Company", data.custCompany],
                            ["Contact", data.custContact],
                            ["Phone",   data.custPhone],
                            ["Email",   data.custEmail],
                        ].map(([label, value]) => (
                            value ? (
                                <div key={label} style={metaRowStyle}>
                                    <span style={metaLabelStyle}>{label}</span>
                                    <span style={metaValueStyle}>{value}</span>
                                </div>
                            ) : null
                        ))}
                    </div>

                    {/* Right: Quote details */}
                    <div style={metaColRightStyle}>
                        <div className="doc-brand-text" style={metaSectionHeadStyle}>Teklif Detayları / Quote Details</div>
                        {[
                            ["Sales Rep",   data.salesRep],
                            ["Phone",       data.salesPhone],
                            ["Email",       data.salesEmail],
                            ["Quote No",    data.quoteNo],
                            ["Date",        fmtDate(data.quoteDate)],
                            ["Valid Until", data.validUntil ? fmtDate(data.validUntil) : ""],
                            ["Currency",    data.currency],
                        ].map(([label, value]) => (
                            value ? (
                                <div key={label} style={metaRowStyle}>
                                    <span style={metaLabelStyle}>{label}</span>
                                    <span style={metaValueStyle}>{value}</span>
                                </div>
                            ) : null
                        ))}
                    </div>
                </div>

                {/* ── Items Table ── */}
                <div style={tableSectionStyle}>
                    <div style={tableLabelStyle}>Kalemler / Line Items</div>
                    <table style={{ width: "100%", borderCollapse: "collapse" as const }}>
                        <thead>
                            <tr>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "28px", textAlign: "center" as const }}>#</th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "88px" }}>
                                    Product Code
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>Ürün Kodu</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "80px" }}>
                                    Lead Time
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>Teslim Süresi</span>
                                </th>
                                <th className="doc-brand-bg" style={thStyle}>
                                    Description
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>Ürün Açıklaması</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "52px", textAlign: "center" as const }}>
                                    Qty
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>Adet</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "100px", textAlign: "right" as const }}>
                                    Unit Price
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>Birim Fiyat</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "110px", textAlign: "right" as const }}>
                                    Total Price
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>Toplam Fiyat</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "80px" }}>
                                    HS Code
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>GTİP Kodu</span>
                                </th>
                                <th className="doc-brand-bg" style={{ ...thStyle, width: "62px", textAlign: "right" as const }}>
                                    Kg
                                    <span style={{ display: "block", fontSize: "7.5px", opacity: 0.65, fontStyle: "italic", textTransform: "none" as const, fontWeight: 400, marginTop: "1px" }}>Ağırlık</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {data.rows.map((row, idx) => {
                                const qty = parseFloat(row.qty) || 0;
                                const price = parseFloat(row.price) || 0;
                                const lineTotal = qty * price;
                                const isEven = idx % 2 === 1;
                                const rowBg = isEven ? C.zebraEven : C.white;
                                return (
                                    <tr key={idx} className={isEven ? "doc-zebra-even" : ""}>
                                        <td style={{ ...tdStyle, background: rowBg, textAlign: "center" as const, color: C.muted, fontFamily: FONT.mono, fontSize: "9px" }}>{idx + 1}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, fontSize: "9.5px" }}>{row.code || "—"}</td>
                                        <td style={{ ...tdStyle, background: rowBg }}>{row.lead || "—"}</td>
                                        <td style={{ ...tdStyle, background: rowBg }}>{row.desc || "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "center" as const }}>{row.qty || "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "right" as const }}>{price > 0 ? `${sym} ${fmt(price)}` : "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "right" as const, fontWeight: 600 }}>{lineTotal > 0 ? `${sym} ${fmt(lineTotal)}` : "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, fontSize: "9.5px" }}>{row.hs || "—"}</td>
                                        <td style={{ ...tdMonoStyle, background: rowBg, textAlign: "right" as const }}>{row.kg || "—"}</td>
                                    </tr>
                                );
                            })}
                            {data.rows.length === 0 && (
                                <tr>
                                    <td colSpan={9} style={{ ...tdStyle, textAlign: "center" as const, color: C.subtle, padding: "20px" }}>
                                        — Kalem girilmedi —
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
                                <td style={totalLabelTdStyle}>Subtotal / Ara Toplam</td>
                                <td style={totalValueTdStyle}>{sym} {fmt(data.subtotal)}</td>
                            </tr>
                            <tr>
                                <td style={totalLabelTdStyle}>VAT / KDV ({data.vatRate}%)</td>
                                <td style={totalValueTdStyle}>{sym} {fmt(data.vatTotal)}</td>
                            </tr>
                            {data.totalKg > 0 && (
                                <tr>
                                    <td style={{ ...totalLabelTdStyle, color: C.subtle, fontWeight: 400 }}>Total Weight / Toplam Kg</td>
                                    <td style={{ ...totalValueTdStyle, color: C.muted }}>{fmt(data.totalKg)} kg</td>
                                </tr>
                            )}
                            <tr>
                                <td style={{ ...totalLabelTdStyle, background: C.brand, color: C.white, fontFamily: FONT.heading, fontWeight: 700, fontSize: "11px", letterSpacing: "0.04em" }} className="doc-brand-bg">
                                    GRAND TOTAL
                                </td>
                                <td style={{ ...totalValueTdStyle, background: C.brand, color: C.white, fontSize: "13px", fontWeight: 700 }} className="doc-brand-bg">
                                    {sym} {fmt(data.grandTotal)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── Notes & Terms ── */}
                {data.notes && (
                    <div className="doc-no-break" style={notesSectionStyle}>
                        <div style={{ fontFamily: FONT.heading, fontSize: "8px", fontWeight: 700, color: C.brand, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "8px" }}>
                            Notes &amp; Terms / Notlar &amp; Koşullar
                        </div>
                        <div style={{ fontSize: "10px", color: C.text, lineHeight: 1.7, whiteSpace: "pre-wrap" as const, padding: "10px 14px", background: C.zebraEven, border: `0.5px solid ${C.border}`, borderRadius: "3px" }}>
                            {data.notes}
                        </div>
                    </div>
                )}

                {/* ── Signatures ── */}
                <div className="doc-no-break" style={sigSectionStyle}>
                    <div style={{ fontFamily: FONT.heading, fontSize: "8px", fontWeight: 700, color: C.brand, textTransform: "uppercase" as const, letterSpacing: "0.1em", marginBottom: "14px" }}>
                        Signatures / İmzalar
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "24px" }}>
                        {data.signatures.map((sig, i) => (
                            <div key={i} style={{ display: "flex", flexDirection: "column" as const }}>
                                {/* Role */}
                                <div style={{ fontSize: "10px", fontWeight: 700, fontFamily: FONT.heading, color: C.text, marginBottom: "2px" }}>{sig.role}</div>
                                <div style={{ fontSize: "8.5px", color: C.muted, fontStyle: "italic", marginBottom: "6px" }}>{sig.roleTr}</div>
                                {/* Name & Title (shown above signature line) */}
                                <div style={{ fontSize: "10.5px", fontWeight: 600, color: C.text, minHeight: "16px" }}>{sig.name || ""}</div>
                                <div style={{ fontSize: "9.5px", color: C.muted, minHeight: "14px", marginBottom: "6px" }}>{sig.title || ""}</div>
                                {/* Signature line */}
                                <div style={{ height: "44px", borderBottom: `1px solid ${C.border}` }} />
                            </div>
                        ))}
                    </div>
                </div>

                {/* ── Footer Band ── */}
                <div className="doc-footer-band" style={footerBandStyle}>
                    <span style={{ fontSize: "8.5px", color: C.muted, fontFamily: FONT.heading, fontWeight: 600 }}>
                        {data.sellerName}
                    </span>
                    <span style={{ fontSize: "8px", color: C.subtle }}>
                        Bu belge gizlidir / This document is confidential
                    </span>
                    <span style={{ fontSize: "8.5px", color: C.muted }}>
                        {data.validUntil ? `Geçerlilik: ${fmtDate(data.validUntil)}` : ""}
                    </span>
                </div>

            </div>
        </>
    );
}
