/**
 * RFQ belgesi — @react-pdf/renderer (gerçek PDF eki). QuotePdfDocument deseni ama
 * FİYATSIZ (talep): satıcı + tedarikçi blok + kalem tablosu (fiyat YOK) + "fiyat
 * bildiriniz" notu. Fontlar quote-pdf register'ı ile paylaşılır (Montserrat/Inter).
 */
import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import { RFQ_LABELS, fmtRfqDate, type RfqDocData } from "@/lib/rfq-document-helpers";

const BRAND = "#0072BC";
const INK = "#1a2230";
const MUTED = "#5b6573";
const BORDER = "#d0d5dd";

const s = {
    page: { padding: 34, fontFamily: "Inter", fontSize: 9, color: INK } as const,
    headerRow: { flexDirection: "row" as const, justifyContent: "space-between" as const, marginBottom: 16 },
    sellerName: { fontFamily: "Montserrat", fontWeight: 800 as const, fontSize: 15, color: BRAND, marginBottom: 4 },
    muted: { color: MUTED, fontSize: 8, lineHeight: 1.4 },
    title: { fontFamily: "Montserrat", fontWeight: 700 as const, fontSize: 14, color: BRAND, textAlign: "right" as const, marginBottom: 6 },
    metaRow: { flexDirection: "row" as const, justifyContent: "flex-end" as const, gap: 6 },
    vendorBox: { backgroundColor: "#f6f8fb", borderWidth: 1, borderColor: BORDER, borderRadius: 4, padding: 8, marginBottom: 14 },
    th: { backgroundColor: BRAND, color: "#ffffff", fontWeight: 600 as const, padding: 5, fontSize: 8 },
    td: { borderWidth: 0.5, borderColor: BORDER, padding: 5, fontSize: 8 },
    ask: { marginTop: 14, fontSize: 9, lineHeight: 1.5, color: INK },
};

export default function RfqPdfDocument({ data }: { data: RfqDocData }) {
    return (
        <Document>
            <Page size="A4" style={s.page}>
                <View style={s.headerRow}>
                    <View>
                        {data.logoSrc ? (
                            // react-pdf Image'inde alt prop'u yoktur (PDF çıktısı, DOM değil)
                            // eslint-disable-next-line jsx-a11y/alt-text
                            <Image src={data.logoSrc} style={{ maxHeight: 40, marginBottom: 4 }} />
                        ) : (
                            <Text style={s.sellerName}>{data.sellerName || "—"}</Text>
                        )}
                        {!!data.sellerAddr && <Text style={s.muted}>{data.sellerAddr}</Text>}
                        {!!data.sellerTel && <Text style={s.muted}>Tel: {data.sellerTel}</Text>}
                        {!!data.sellerEmail && <Text style={s.muted}>{data.sellerEmail}</Text>}
                        {!!data.sellerTaxId && <Text style={s.muted}>VKN: {data.sellerTaxId}</Text>}
                    </View>
                    <View>
                        <Text style={s.title}>{RFQ_LABELS.title}</Text>
                        <View style={s.metaRow}><Text style={s.muted}>{RFQ_LABELS.no}: </Text><Text style={{ fontSize: 8, fontWeight: 600 }}>{data.rfqNo}</Text></View>
                        <View style={s.metaRow}><Text style={s.muted}>{RFQ_LABELS.date}: </Text><Text style={{ fontSize: 8 }}>{fmtRfqDate(data.rfqDate)}</Text></View>
                        {!!data.dueDate && <View style={s.metaRow}><Text style={s.muted}>{RFQ_LABELS.due}: </Text><Text style={{ fontSize: 8, fontWeight: 600 }}>{fmtRfqDate(data.dueDate)}</Text></View>}
                    </View>
                </View>

                <View style={s.vendorBox}>
                    <Text style={{ fontSize: 7, color: MUTED }}>{RFQ_LABELS.to}</Text>
                    <Text style={{ fontWeight: 600, fontSize: 11 }}>{data.vendorName}</Text>
                    {!!data.vendorEmail && <Text style={s.muted}>{data.vendorEmail}</Text>}
                    {!!data.title && <Text style={{ marginTop: 3, fontSize: 9 }}>{data.title}</Text>}
                </View>

                <View style={{ flexDirection: "row" }}>
                    <Text style={[s.th, { width: 24 }]}>{RFQ_LABELS.pos}</Text>
                    <Text style={[s.th, { width: 90 }]}>{RFQ_LABELS.code}</Text>
                    <Text style={[s.th, { flexGrow: 1 }]}>{RFQ_LABELS.desc}</Text>
                    <Text style={[s.th, { width: 80 }]}>{RFQ_LABELS.qty}</Text>
                    <Text style={[s.th, { width: 80 }]}>{RFQ_LABELS.target}</Text>
                </View>
                {data.lines.map((l, i) => (
                    <View key={i} style={{ flexDirection: "row" }} wrap={false}>
                        <Text style={[s.td, { width: 24 }]}>{l.position}</Text>
                        <Text style={[s.td, { width: 90 }]}>{l.code || "—"}</Text>
                        <Text style={[s.td, { flexGrow: 1 }]}>{l.description || "—"}{l.notes ? `\n${l.notes}` : ""}</Text>
                        <Text style={[s.td, { width: 80 }]}>{l.qty}{l.unit ? ` ${l.unit}` : ""}</Text>
                        <Text style={[s.td, { width: 80 }]}>{fmtRfqDate(l.targetDate) || "—"}</Text>
                    </View>
                ))}

                <Text style={s.ask}>{RFQ_LABELS.ask}</Text>
                {!!data.notes && (
                    <View style={{ marginTop: 8 }}>
                        <Text style={{ fontWeight: 600, color: MUTED, fontSize: 8 }}>{RFQ_LABELS.notes}</Text>
                        <Text style={{ fontSize: 9 }}>{data.notes}</Text>
                    </View>
                )}
            </Page>
        </Document>
    );
}
