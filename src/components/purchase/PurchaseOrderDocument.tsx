"use client";

import Link from "next/link";
import type {
    PurchaseOrderRow,
    PurchaseOrderLineRow,
    PurchaseOrderStatus,
    VendorRow,
    CompanySettingsRow,
} from "@/lib/database.types";
import type { ProductRef } from "@/lib/supabase/products";

// ── Constants ─────────────────────────────────────────────────────────────────

const C = {
    text: "#1a1a2e",
    muted: "#64748b",
    subtle: "#94a3b8",
    border: "#d0d7de",
    borderLight: "#e8ecf0",
    headerBg: "#f6f8fa",
    white: "#ffffff",
    brand: "#0072BC",
    cancelledBg: "#fee2e2",
    cancelledText: "#991b1b",
    cancelledBorder: "#fca5a5",
};

const STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
    draft:              "Taslak",
    sent:               "Gönderildi",
    confirmed:          "Onaylandı",
    partially_received: "Kısmen Kabul Edildi",
    received:           "Tamamlandı",
    cancelled:          "İPTAL EDİLDİ",
};

const PAGE_CSS = `
@page { size: A4 portrait; margin: 10mm; }
`;

const PRINT_CSS = `
@media print {
    .po-no-print { display: none !important; }
    #po-document, #po-document * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
    }
    #po-document {
        width: 100% !important;
        margin: 0 !important;
        box-shadow: none !important;
        border: 1px solid #222 !important;
    }
    #po-document table tbody tr {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
    }
    #po-document .po-no-break {
        break-inside: avoid;
        page-break-inside: avoid;
    }
}
`;

// ── Format helpers ────────────────────────────────────────────────────────────
export { formatPoCurrency, formatPoDate } from "@/lib/po-document-helpers";
import { formatPoCurrency, formatPoDate } from "@/lib/po-document-helpers";

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PurchaseOrderDocumentProps {
    po: PurchaseOrderRow & { lines: PurchaseOrderLineRow[] };
    vendor: VendorRow | null;
    company: CompanySettingsRow | null;
    // Minimal product view: id/sku/name/unit only.
    // Sensitive fields (cost_price, parasut_*, on_hand, reserved, product_notes,
    // daily_usage, ...) must not be serialized into the print client payload.
    products: ProductRef[];
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PurchaseOrderDocument({ po, vendor, company, products }: PurchaseOrderDocumentProps) {
    const productMap = new Map<string, ProductRef>();
    for (const p of products) productMap.set(p.id, p);

    const isCancelled = po.status === "cancelled";
    const statusLabel = STATUS_LABEL[po.status];

    return (
        <div style={{ minHeight: "100vh", background: "#eee", padding: "16px 0" }}>
            <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />
            <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

            {/* Toolbar — hidden on print */}
            <div className="po-no-print" style={{
                maxWidth: "210mm", margin: "0 auto 16px",
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "0 4px",
            }}>
                <Link
                    href={`/dashboard/purchase/orders/${po.id}`}
                    style={{
                        fontSize: "13px", color: "#333", textDecoration: "none",
                        padding: "6px 12px", border: "1px solid #d0d7de", borderRadius: "6px",
                        background: "#fff",
                    }}
                    aria-label="Sipariş detayına dön"
                >← Siparişe Dön</Link>
                <button
                    onClick={() => window.print()}
                    style={{
                        fontSize: "13px", fontWeight: 500, color: "#fff",
                        padding: "6px 14px", border: "none", borderRadius: "6px",
                        background: C.brand, cursor: "pointer",
                    }}
                    aria-label="Sipariş belgesini yazdır veya PDF olarak kaydet"
                >📄 Yazdır / PDF Olarak Kaydet</button>
            </div>

            {/* A4 document */}
            <div id="po-document" style={{
                position: "relative",
                width: "210mm",
                minHeight: "297mm",
                margin: "0 auto",
                background: C.white,
                border: "1px solid #222",
                boxShadow: "0 8px 40px rgba(0,0,0,0.15)",
                fontFamily: "'Inter', system-ui, sans-serif",
                color: C.text,
                fontSize: "11px",
                lineHeight: 1.5,
                padding: "16mm",
                boxSizing: "border-box",
            }}>

                {/* ── Header: Company + Title ── */}
                <div className="po-no-break" style={{
                    display: "grid", gridTemplateColumns: "auto 1fr", gap: "20px",
                    paddingBottom: "16px", borderBottom: `2px solid ${C.text}`, marginBottom: "16px",
                }}>
                    <div style={{ minWidth: "80px" }}>
                        {company?.logo_url ? (
                            // PDF/print için <img> bilinçli tercih: next/image lazy-load + optimization
                            // print render'da görünmez logo veya extra request yaratabiliyor.
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={company.logo_url} alt={company.name ?? "logo"} style={{
                                width: "80px", height: "80px", objectFit: "contain",
                            }} />
                        ) : (
                            <div style={{
                                width: "80px", height: "80px", border: `1px dashed ${C.border}`,
                                display: "grid", placeItems: "center",
                                fontSize: "9px", color: C.subtle,
                            }}>LOGO</div>
                        )}
                    </div>
                    <div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: C.text, marginBottom: "4px" }}>
                            {company?.name ?? "—"}
                        </div>
                        {company && (
                            <div style={{ fontSize: "10px", color: C.muted, lineHeight: 1.6 }}>
                                {company.tax_office && company.tax_no && (
                                    <div>{company.tax_office} V.D. · VKN: {company.tax_no}</div>
                                )}
                                {company.address && <div>{company.address}</div>}
                                <div>
                                    {company.phone && <>Tel: {company.phone}</>}
                                    {company.phone && company.email && " · "}
                                    {company.email && <>E: {company.email}</>}
                                    {company.website && (
                                        <>{(company.phone || company.email) && " · "}Web: {company.website}</>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Title Band ── */}
                <div className="po-no-break" style={{
                    textAlign: "center", marginBottom: "16px",
                }}>
                    <div style={{
                        fontSize: "20px", fontWeight: 800, letterSpacing: "0.1em",
                        color: C.brand, textTransform: "uppercase",
                    }}>SATIN ALMA SİPARİŞİ</div>
                    {isCancelled && (
                        <div style={{
                            marginTop: "8px",
                            display: "inline-block",
                            padding: "4px 16px",
                            background: C.cancelledBg,
                            color: C.cancelledText,
                            border: `1px solid ${C.cancelledBorder}`,
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                        }}>İPTAL EDİLDİ</div>
                    )}
                </div>

                {/* ── Meta Grid: PO info + Vendor info ── */}
                <div className="po-no-break" style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0",
                    border: `1px solid ${C.border}`, marginBottom: "20px",
                }}>
                    {/* Left: PO meta */}
                    <div style={{ padding: "12px 14px", borderRight: `1px solid ${C.border}` }}>
                        <div style={{
                            fontSize: "9px", fontWeight: 700, color: C.brand,
                            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px",
                            paddingBottom: "4px", borderBottom: `1px solid ${C.borderLight}`,
                        }}>Sipariş Bilgisi</div>
                        <MetaRow label="Sipariş No" value={po.po_number} mono />
                        <MetaRow label="Tarih" value={formatPoDate(po.order_date)} />
                        <MetaRow label="Beklenen Teslim" value={formatPoDate(po.expected_date)} />
                        <MetaRow label="Durum" value={statusLabel} />
                        <MetaRow label="Para Birimi" value={po.currency} />
                    </div>
                    {/* Right: Vendor */}
                    <div style={{ padding: "12px 14px" }}>
                        <div style={{
                            fontSize: "9px", fontWeight: 700, color: C.brand,
                            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px",
                            paddingBottom: "4px", borderBottom: `1px solid ${C.borderLight}`,
                        }}>Tedarikçi</div>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: C.text, marginBottom: "6px" }}>
                            {vendor?.name ?? "—"}
                        </div>
                        {vendor?.contact_person && (
                            <div style={{ fontSize: "10px", color: C.muted, marginBottom: "2px" }}>
                                İletişim: {vendor.contact_person}
                            </div>
                        )}
                        {(vendor?.contact_email || vendor?.contact_phone) && (
                            <div style={{ fontSize: "10px", color: C.muted, marginBottom: "2px" }}>
                                {vendor.contact_email}
                                {vendor.contact_email && vendor.contact_phone && " · "}
                                {vendor.contact_phone}
                            </div>
                        )}
                        {vendor?.address && (
                            <div style={{ fontSize: "10px", color: C.muted, marginBottom: "2px" }}>
                                {vendor.address}
                            </div>
                        )}
                        {(vendor?.tax_number || vendor?.payment_terms_days != null) && (
                            <div style={{ fontSize: "10px", color: C.muted }}>
                                {vendor.tax_number && <>VKN: {vendor.tax_number}</>}
                                {vendor.tax_number && vendor.payment_terms_days != null && " · "}
                                {vendor.payment_terms_days != null && (
                                    <>Ödeme Vadesi: {vendor.payment_terms_days} gün</>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Lines Table ── */}
                <table style={{
                    width: "100%", borderCollapse: "collapse", marginBottom: "16px",
                    border: `1px solid ${C.border}`,
                }}>
                    <thead>
                        <tr style={{ background: C.headerBg }}>
                            <th style={thCell(C, "center", "28px")}>#</th>
                            <th style={thCell(C, "left", "100px")}>SKU</th>
                            <th style={thCell(C, "left")}>Ürün</th>
                            <th style={thCell(C, "right", "60px")}>Adet</th>
                            <th style={thCell(C, "right", "90px")}>Birim Fiyat</th>
                            <th style={thCell(C, "right", "60px")}>İskonto</th>
                            <th style={thCell(C, "right", "100px")}>Satır Toplamı</th>
                        </tr>
                    </thead>
                    <tbody>
                        {po.lines.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{
                                    padding: "20px", textAlign: "center", color: C.subtle,
                                    border: `1px solid ${C.border}`, fontSize: "11px",
                                }}>— Satır yok —</td>
                            </tr>
                        )}
                        {po.lines.map((line, idx) => {
                            const product = productMap.get(line.product_id);
                            return (
                                <tr key={line.id}>
                                    <td style={tdCell(C, "center")}>{idx + 1}</td>
                                    <td style={{ ...tdCell(C, "left"), fontFamily: "'JetBrains Mono', monospace", fontSize: "10px" }}>
                                        {product?.sku ?? "—"}
                                    </td>
                                    <td style={tdCell(C, "left")}>
                                        <div style={{ fontWeight: 500 }}>{product?.name ?? "—"}</div>
                                        {line.notes && (
                                            <div style={{ fontSize: "9.5px", color: C.muted, marginTop: "2px" }}>
                                                {line.notes}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...tdCell(C, "right"), fontFamily: "'JetBrains Mono', monospace" }}>
                                        {line.quantity} {product?.unit ?? ""}
                                    </td>
                                    <td style={{ ...tdCell(C, "right"), fontFamily: "'JetBrains Mono', monospace" }}>
                                        {formatPoCurrency(line.unit_price, po.currency)}
                                    </td>
                                    <td style={{ ...tdCell(C, "right"), fontFamily: "'JetBrains Mono', monospace" }}>
                                        {line.discount_pct > 0 ? `%${line.discount_pct}` : "—"}
                                    </td>
                                    <td style={{ ...tdCell(C, "right"), fontFamily: "'JetBrains Mono', monospace", fontWeight: 600 }}>
                                        {formatPoCurrency(line.line_total, po.currency)}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                {/* ── Totals ── */}
                <div className="po-no-break" style={{
                    display: "flex", justifyContent: "flex-end", marginBottom: "16px",
                }}>
                    <table style={{ width: "300px", borderCollapse: "collapse", border: `1px solid ${C.border}` }}>
                        <tbody>
                            <tr>
                                <td style={totalLabelCell(C)}>Ara Toplam</td>
                                <td style={totalValueCell(C)}>{formatPoCurrency(po.subtotal, po.currency)}</td>
                            </tr>
                            <tr>
                                <td style={totalLabelCell(C)}>KDV ({po.vat_rate}%)</td>
                                <td style={totalValueCell(C)}>{formatPoCurrency(po.vat_total, po.currency)}</td>
                            </tr>
                            <tr>
                                <td style={{ ...totalLabelCell(C), background: C.brand, color: C.white, fontWeight: 700 }}>
                                    Genel Toplam
                                </td>
                                <td style={{ ...totalValueCell(C), background: C.brand, color: C.white, fontWeight: 700, fontSize: "12px" }}>
                                    {formatPoCurrency(po.grand_total, po.currency)}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* ── Notes ── */}
                {po.notes && (
                    <div className="po-no-break" style={{ marginBottom: "16px" }}>
                        <div style={{
                            fontSize: "9px", fontWeight: 700, color: C.brand,
                            textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "6px",
                        }}>Notlar</div>
                        <div style={{
                            fontSize: "11px", color: C.text, lineHeight: 1.6,
                            padding: "10px 12px", background: C.headerBg,
                            border: `1px solid ${C.borderLight}`, borderRadius: "3px",
                            whiteSpace: "pre-wrap",
                        }}>{po.notes}</div>
                    </div>
                )}

                {/* ── Cancelled note (only if cancelled) ── */}
                {isCancelled && po.cancel_reason && (
                    <div className="po-no-break" style={{ marginBottom: "16px" }}>
                        <div style={{
                            fontSize: "10px", color: C.cancelledText,
                            padding: "8px 12px", background: C.cancelledBg,
                            border: `1px solid ${C.cancelledBorder}`, borderRadius: "3px",
                        }}>
                            <strong>İptal Sebebi:</strong> {po.cancel_reason}
                        </div>
                    </div>
                )}

                {/* ── Footer ── */}
                <div className="po-no-break" style={{
                    marginTop: "24px", paddingTop: "12px", borderTop: `1px solid ${C.border}`,
                    fontSize: "9px", color: C.subtle, textAlign: "center",
                }}>
                    Bu belge otomatik üretilmiştir.
                </div>
            </div>
        </div>
    );
}

// ── Subcomponents / style helpers ─────────────────────────────────────────────

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div style={{
            display: "grid", gridTemplateColumns: "110px 1fr", gap: "8px",
            paddingBottom: "4px", marginBottom: "4px",
            borderBottom: `0.5px solid ${C.borderLight}`,
            alignItems: "baseline",
        }}>
            <span style={{
                fontSize: "9px", fontWeight: 600, color: C.muted,
                textTransform: "uppercase", letterSpacing: "0.05em",
            }}>{label}</span>
            <span style={{
                fontSize: "10.5px", color: C.text, fontWeight: 500,
                fontFamily: mono ? "'JetBrains Mono', monospace" : undefined,
            }}>{value}</span>
        </div>
    );
}

function thCell(C_: typeof C, align: "left" | "center" | "right", width?: string): React.CSSProperties {
    return {
        padding: "6px 8px",
        fontSize: "9.5px",
        fontWeight: 700,
        color: C_.text,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        textAlign: align,
        border: `0.5px solid ${C_.border}`,
        verticalAlign: "middle",
        whiteSpace: "nowrap",
        ...(width ? { width } : {}),
    };
}

function tdCell(C_: typeof C, align: "left" | "center" | "right"): React.CSSProperties {
    return {
        padding: "6px 8px",
        fontSize: "10.5px",
        color: C_.text,
        border: `0.5px solid ${C_.border}`,
        textAlign: align,
        verticalAlign: "top",
    };
}

function totalLabelCell(C_: typeof C): React.CSSProperties {
    return {
        padding: "6px 12px",
        fontSize: "10.5px",
        fontWeight: 600,
        color: C_.muted,
        textAlign: "right",
        border: `0.5px solid ${C_.border}`,
        background: C_.headerBg,
    };
}

function totalValueCell(C_: typeof C): React.CSSProperties {
    return {
        padding: "6px 12px",
        fontSize: "11px",
        fontFamily: "'JetBrains Mono', monospace",
        textAlign: "right",
        border: `0.5px solid ${C_.border}`,
        whiteSpace: "nowrap",
        color: C_.text,
    };
}
