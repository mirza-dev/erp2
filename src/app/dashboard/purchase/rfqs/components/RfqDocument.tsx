/**
 * RFQ belgesi — yazdırılabilir / arşivlenebilir HTML (server component, "use client" YOK).
 * renderToStaticMarkup ile server graph'te render edilir (quote-archive-html deseni).
 * Renkler concrete hex (self-contained); fiyat YOK — bu bir taleptir.
 */
import { RFQ_LABELS, fmtRfqDate, type RfqDocData } from "@/lib/rfq-document-helpers";

const BRAND = "#0072BC";
const INK = "#1a2230";
const MUTED = "#5b6573";
const BORDER = "#d0d5dd";

export const RFQ_PAGE_CSS = `
@page { size: A4 portrait; margin: 14mm; }
.rfq-doc { font-family: var(--font-doc-body, 'Inter'), system-ui, sans-serif; color: ${INK}; max-width: 794px; margin: 0 auto; background: #fff; padding: 28px; }
.rfq-doc h1, .rfq-doc h2 { font-family: var(--font-doc-heading, 'Montserrat'), system-ui, sans-serif; }
.rfq-doc table { width: 100%; border-collapse: collapse; }
.rfq-doc th, .rfq-doc td { border: 1px solid ${BORDER}; padding: 7px 9px; font-size: 12px; text-align: left; vertical-align: top; }
.rfq-doc th { background: ${BRAND}; color: #fff; font-weight: 600; }
.rfq-doc tr:nth-child(even) td { background: #f6f8fb; }
@media print { .rfq-doc { padding: 0; } .rfq-doc tr { break-inside: avoid; } }
`;

export default function RfqDocument({ data }: { data: RfqDocData }) {
    return (
        <div className="rfq-doc">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 }}>
                <div>
                    {data.logoSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={data.logoSrc} alt={data.sellerName} style={{ maxHeight: 46, marginBottom: 6 }} />
                    ) : (
                        <div style={{ fontFamily: "var(--font-doc-heading, 'Montserrat')", fontWeight: 800, fontSize: 20, color: BRAND }}>
                            {data.sellerName || "—"}
                        </div>
                    )}
                    <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.5 }}>
                        {data.sellerAddr && <div>{data.sellerAddr}</div>}
                        {data.sellerTel && <div>Tel: {data.sellerTel}</div>}
                        {data.sellerEmail && <div>{data.sellerEmail}</div>}
                        {data.sellerTaxId && <div>VKN: {data.sellerTaxId}</div>}
                    </div>
                </div>
                <div style={{ textAlign: "right" }}>
                    <h1 style={{ fontSize: 18, color: BRAND, margin: "0 0 8px" }}>{RFQ_LABELS.title}</h1>
                    <table style={{ width: "auto", fontSize: 11 }}>
                        <tbody>
                            <tr><td style={{ border: "none", padding: "1px 8px", color: MUTED }}>{RFQ_LABELS.no}</td><td style={{ border: "none", padding: "1px 8px", fontWeight: 600 }}>{data.rfqNo}</td></tr>
                            <tr><td style={{ border: "none", padding: "1px 8px", color: MUTED }}>{RFQ_LABELS.date}</td><td style={{ border: "none", padding: "1px 8px" }}>{fmtRfqDate(data.rfqDate)}</td></tr>
                            {data.dueDate && <tr><td style={{ border: "none", padding: "1px 8px", color: MUTED }}>{RFQ_LABELS.due}</td><td style={{ border: "none", padding: "1px 8px", fontWeight: 600 }}>{fmtRfqDate(data.dueDate)}</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>

            <div style={{ background: "#f6f8fb", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "10px 12px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, textTransform: "uppercase", color: MUTED, letterSpacing: 0.4 }}>{RFQ_LABELS.to}</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{data.vendorName}</div>
                {data.vendorContact && <div style={{ fontSize: 12, color: MUTED }}>{data.vendorContact}</div>}
                {data.vendorEmail && <div style={{ fontSize: 12, color: MUTED }}>{data.vendorEmail}</div>}
                {data.title && <div style={{ marginTop: 6, fontSize: 12 }}>{data.title}</div>}
            </div>

            <table>
                <thead>
                    <tr>
                        <th style={{ width: 34 }}>{RFQ_LABELS.pos}</th>
                        <th style={{ width: 110 }}>{RFQ_LABELS.code}</th>
                        <th>{RFQ_LABELS.desc}</th>
                        <th style={{ width: 110 }}>{RFQ_LABELS.qty}</th>
                        <th style={{ width: 110 }}>{RFQ_LABELS.target}</th>
                    </tr>
                </thead>
                <tbody>
                    {data.lines.map((l, i) => (
                        <tr key={i}>
                            <td>{l.position}</td>
                            <td>{l.code || "—"}</td>
                            <td>
                                {l.description || "—"}
                                {l.notes && <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{l.notes}</div>}
                            </td>
                            <td>{l.qty}{l.unit ? ` ${l.unit}` : ""}</td>
                            <td>{fmtRfqDate(l.targetDate) || "—"}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <p style={{ fontSize: 12, color: INK, marginTop: 16, lineHeight: 1.6 }}>{RFQ_LABELS.ask}</p>
            {data.notes && (
                <div style={{ marginTop: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: MUTED, marginBottom: 3 }}>{RFQ_LABELS.notes}</div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{data.notes}</div>
                </div>
            )}
        </div>
    );
}
