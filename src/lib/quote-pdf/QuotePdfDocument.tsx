/**
 * Teklif PDF belgesi — @react-pdf/renderer.
 *
 * QuoteDocument.tsx (HTML/print şablonu) görünümünün YAKIN KOPYASIDIR; aynı
 * `QuoteData` sözleşmesinden beslenir (buildQuoteDataFromDetail tek veri kaynağı)
 * ve aynı BILINGUAL_LABELS / format helper'larını kullanır → metin drift'i tek
 * noktadan yakalanır. Bilinen yakın-kopya sapmaları:
 *  - JetBrains Mono gömülmedi → mono hücreler (SKU/fiyat) Inter ile dizilir.
 *  - linear-gradient desteklenmez → başlık altı düz marka-mavisi çizgi.
 *  - İtalik TTF gömülmedi → EN alt-etiketler eğiksiz (register-fonts notu).
 *  - Sayfalama @page yerine react-pdf akışıyla; satırlar wrap={false} ile bölünmez.
 *
 * TEMA-MUAF: beyaz kağıt + PMT marka kimliği; sabit hex kasıtlı (QuoteDocument kuralı).
 * Ölçek: HTML şablon px değerleri × 0.75 = pt (96dpi→72dpi); 210mm ≈ 595pt korunur.
 */
import { Fragment } from "react";
import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import type { Style } from "@react-pdf/stylesheet";
import type { QuoteData, QuoteRow } from "@/app/dashboard/quotes/components/quote-types";
import {
    BILINGUAL_LABELS,
    CURRENCY_SYMBOLS,
    formatQuoteAmount as fmt,
    formatQuoteDate as fmtDate,
} from "@/lib/quote-document-helpers";

const L = BILINGUAL_LABELS;

/** HTML şablondaki px değerleri → pt (×0.75). */
const px = (n: number) => n * 0.75;

/**
 * react-pdf textTransform:uppercase Türkçe locale bilmez (i→I, "Müşteri"→"MÜŞTERI") —
 * TR metinler bu helper ile büyütülür (i→İ); EN alt-etiketler HTML'deki gibi
 * dönüştürülmeden (normal case, italik) basılır.
 */
const trUpper = (s: string) => s.toLocaleUpperCase("tr-TR");

const C = {
    brand: "#0072BC",
    brandBorder: "#cce3f2",
    text: "#1a1a2e",
    muted: "#64748b",
    subtle: "#94a3b8",
    border: "#d0d7de",
    borderLight: "#e8ecf0",
    zebraEven: "#f6f8fa",
    footerBg: "#f0f4f8",
    white: "#ffffff",
    whiteFaint: "rgba(255,255,255,0.7)",
};

const FONT = { heading: "Montserrat", body: "Inter" };

// Satır tablosu kolon genişlikleri (HTML px taban; desc kalan alanı doldurur).
// 0.92 ölçeği: HTML'de tablo 794px doc genişliğini kaplar, PDF'te sayfa padding'i
// (8mm×2) içerik alanını daraltır — fixed kolonlar küçültülmezse desc kolonu
// HTML'dekinden çok dar kalıyordu (görsel smoke bulgusu).
const COLSCALE = 0.92;
const COL = {
    rowNo: px(28 * COLSCALE), code: px(88 * COLSCALE), lead: px(80 * COLSCALE), size: px(60 * COLSCALE),
    qty: px(52 * COLSCALE), unit: px(100 * COLSCALE), total: px(110 * COLSCALE), hs: px(80 * COLSCALE), kg: px(62 * COLSCALE),
};

const S: Record<string, Style> = {
    page: {
        fontFamily: FONT.body,
        fontSize: px(11),
        color: C.text,
        padding: "8mm",
        backgroundColor: C.white,
    },
    // ── Header band ──
    headerBand: {
        flexDirection: "row",
        alignItems: "center",
        gap: px(20),
        padding: `${px(20)} ${px(28)}`,
        backgroundColor: C.brand,
        color: C.white,
    },
    logo: { width: px(96), height: px(96), objectFit: "contain", backgroundColor: C.white, borderRadius: px(6), padding: px(4) },
    logoPlaceholder: { width: px(96), height: px(96), backgroundColor: "rgba(255,255,255,0.15)", borderRadius: px(6) },
    sellerName: { fontFamily: FONT.heading, fontSize: px(17), fontWeight: 800, marginBottom: px(6), color: C.white },
    sellerInfoWrap: { flexDirection: "row", flexWrap: "wrap", gap: `${px(4)} ${px(16)}`, fontSize: px(9.5), color: "rgba(255,255,255,0.82)" },
    docRef: { alignItems: "flex-end" },
    quoteNoChip: { fontSize: px(12), fontWeight: 600, backgroundColor: "rgba(255,255,255,0.15)", padding: `${px(4)} ${px(10)}`, borderRadius: px(4), letterSpacing: 0.4, color: C.white },
    // ── Title band ──
    titleBand: { paddingTop: px(14), paddingBottom: px(12), paddingHorizontal: px(28), alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.border },
    titleText: { fontFamily: FONT.heading, fontSize: px(20), fontWeight: 800, letterSpacing: 1.2, color: C.brand },
    titleRule: { marginTop: px(8), height: px(2), width: "55%", backgroundColor: C.brand, borderRadius: 1, opacity: 0.55 },
    // ── Meta grid ──
    metaGrid: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
    metaCol: { flex: 1, padding: `${px(14)} ${px(20)}` },
    metaColRight: { borderLeftWidth: 1, borderLeftColor: C.border },
    metaSectionHead: { fontFamily: FONT.heading, fontSize: px(8), fontWeight: 700, color: C.brand, letterSpacing: 0.8, paddingBottom: px(6), borderBottomWidth: 1, borderBottomColor: C.brandBorder, marginBottom: px(8) },
    metaRow: { flexDirection: "row", gap: px(6), paddingBottom: px(5), borderBottomWidth: 0.5, borderBottomColor: C.borderLight, marginBottom: px(4) },
    metaLabelWrap: { width: px(110) },
    metaLabel: { fontSize: px(8.5), fontWeight: 600, color: C.muted, letterSpacing: 0.4 },
    metaLabelEn: { fontSize: px(7), fontWeight: 400, color: C.subtle, fontStyle: "italic" },
    metaValue: { flex: 1, fontSize: px(10), fontWeight: 500, color: C.text },
    // ── Items table ──
    tableLabel: { padding: `${px(8)} ${px(20)} ${px(6)}`, fontFamily: FONT.heading, fontSize: px(8), fontWeight: 700, color: C.brand, letterSpacing: 0.8, backgroundColor: C.zebraEven, borderBottomWidth: 1, borderBottomColor: C.border },
    // Kenarlık YOK: ince beyaz kenarlık mavi band üzerinde react-pdf'te yeşil/cyan
    // antialiasing saçağı veriyordu. Header düz mavi band + ortalı başlık.
    th: { padding: `${px(7)} ${px(6)}`, fontSize: px(8.5), fontFamily: FONT.heading, fontWeight: 700, color: C.white, letterSpacing: 0.4, justifyContent: "center" },
    thEn: { fontSize: px(7.5), opacity: 0.65, fontStyle: "italic", fontWeight: 400, marginTop: 1, textTransform: "none" },
    headRow: { flexDirection: "row", backgroundColor: C.brand },
    row: { flexDirection: "row" },
    td: { padding: `${px(5)} ${px(8)}`, fontSize: px(10), borderWidth: 0.5, borderColor: C.border, justifyContent: "center" },
    tableBottom: { borderBottomWidth: 1, borderBottomColor: C.border },
    // 098: satır bazlı not (ürün satırının altında tam genişlik)
    noteRow: { borderWidth: 0.5, borderTopWidth: 0, borderColor: C.border, borderLeftWidth: 2, borderLeftColor: C.brand, paddingVertical: px(3), paddingHorizontal: px(10) },
    noteText: { fontSize: px(9), color: C.muted, lineHeight: 1.4 },
    noteLabel: { fontWeight: 700, color: C.brand },
    // ── Totals ──
    totalsSection: { flexDirection: "row", justifyContent: "flex-end", padding: `${px(12)} ${px(20)}`, borderBottomWidth: 1, borderBottomColor: C.border },
    totalsTable: { width: px(300), borderWidth: 1, borderColor: C.border },
    totalRow: { flexDirection: "row" },
    totalLabelTd: { flex: 1, padding: `${px(6)} ${px(12)}`, fontSize: px(10), fontWeight: 600, color: C.muted, alignItems: "flex-end", borderWidth: 0.5, borderColor: C.border, backgroundColor: C.zebraEven },
    totalLabelEn: { fontSize: px(7.5), fontWeight: 400, color: C.subtle, fontStyle: "italic", marginTop: 1 },
    totalValueTd: { width: px(120), padding: `${px(6)} ${px(12)}`, fontSize: px(10), fontWeight: 500, color: C.text, alignItems: "flex-end", justifyContent: "center", borderWidth: 0.5, borderColor: C.border },
    // ── Sections ──
    section: { padding: `${px(14)} ${px(20)}`, borderBottomWidth: 1, borderBottomColor: C.border },
    sectionHead: { fontFamily: FONT.heading, fontSize: px(8), fontWeight: 700, color: C.brand, letterSpacing: 0.8, marginBottom: px(10) },
    sectionHeadEn: { fontWeight: 400, fontStyle: "italic", opacity: 0.7, textTransform: "none" },
    termsGrid: { flexDirection: "row", borderWidth: 0.5, borderColor: C.border, backgroundColor: C.zebraEven },
    termsCol: { flex: 1, padding: `${px(10)} ${px(12)}` },
    termsLabel: { fontFamily: FONT.heading, fontSize: px(9), fontWeight: 700, color: C.text, letterSpacing: 0.4 },
    termsLabelEn: { fontSize: px(7.5), fontWeight: 400, fontStyle: "italic", color: C.subtle, marginTop: 1 },
    termsValue: { fontSize: px(10), color: C.text, marginTop: px(2) },
    notesBox: { fontSize: px(10), color: C.text, lineHeight: 1.7, padding: `${px(10)} ${px(14)}`, backgroundColor: C.zebraEven, borderWidth: 0.5, borderColor: C.border, borderRadius: px(3) },
    // ── Signatures ──
    sigGrid: { flexDirection: "row", gap: px(24) },
    sigCol: { flex: 1 },
    sigLine: { height: px(44), borderBottomWidth: 1, borderBottomColor: C.border },
    // ── Footer band ──
    footerBand: { padding: `${px(10)} ${px(20)}`, backgroundColor: C.footerBg, borderTopWidth: 1, borderTopColor: C.border },
    footerInfo: { flexDirection: "row", flexWrap: "wrap", gap: `${px(4)} ${px(14)}`, fontSize: px(8.5), color: C.muted },
    footerMeta: { flexDirection: "row", justifyContent: "space-between", marginTop: px(6), fontSize: px(7.5), color: C.subtle },
};

function MetaRow({ label, value }: { label: { tr: string; en: string }; value: string }) {
    if (!value) return null;
    return (
        <View style={S.metaRow}>
            <View style={S.metaLabelWrap}>
                <Text style={S.metaLabel}>{trUpper(label.tr)}</Text>
                <Text style={S.metaLabelEn}>{label.en}</Text>
            </View>
            <Text style={S.metaValue}>{value}</Text>
        </View>
    );
}

function Th({ label, width, grow }: { label: { tr: string; en: string }; width?: number; grow?: boolean }) {
    // Tüm başlıklar ORTALI (kullanıcı isteği). textAlign hem yatay merkez hem
    // çok-satıra sarılan uzun başlıkları (TESLİM SÜRESİ) düzgün hizalar.
    return (
        <View style={{ ...S.th, ...(grow ? { flex: 1 } : { width }), alignItems: "center" }}>
            <Text style={{ textAlign: "center" }}>{trUpper(label.tr)}</Text>
            <Text style={{ ...S.thEn, textAlign: "center" }}>{label.en}</Text>
        </View>
    );
}

function Td({ children, width, align, grow, bg, style }: {
    children: string; width?: number; align?: "center" | "right"; grow?: boolean; bg: string; style?: Style;
}) {
    const alignItems = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
    return (
        <View style={{ ...S.td, ...(grow ? { flex: 1 } : { width }), alignItems, backgroundColor: bg }}>
            <Text style={style}>{children}</Text>
        </View>
    );
}

function ItemRow({ row, idx, sym }: { row: QuoteRow; idx: number; sym: string }) {
    const qty = parseFloat(row.qty) || 0;
    const price = parseFloat(row.price) || 0;
    const lineTotal = qty * price;
    // V3-B6 (QuoteDocument ile aynı kural): gerçek satırda 0 fiyat "0.00", boş filler "—".
    const isRealRow = !!(row.code || row.desc || row.qty || row.size || row.lead || row.hs || row.kg);
    const bg = idx % 2 === 1 ? C.zebraEven : C.white;
    // 098: satır bazlı not (varsa) ürün satırının altında gösterilir.
    const lineNote = (row.note || "").trim();
    return (
        <Fragment>
        <View style={S.row} wrap={false}>
            <Td width={COL.rowNo} align="center" bg={bg} style={{ color: C.muted, fontSize: px(9) }}>{String(idx + 1)}</Td>
            {/* Uzun kodda font bir tık küçülür → tire-kırılması 3 yerine 2 satırda kalır */}
            <Td width={COL.code} bg={bg} style={{ fontSize: row.code.length > 12 ? px(8.5) : px(9.5) }}>{row.code || "—"}</Td>
            <Td width={COL.lead} bg={bg}>{row.lead || "—"}</Td>
            <Td width={COL.size} bg={bg}>{row.size || "—"}</Td>
            <Td grow bg={bg}>{row.desc || "—"}</Td>
            <Td width={COL.qty} align="center" bg={bg}>{row.qty || "—"}</Td>
            <Td width={COL.unit} align="right" bg={bg}>{isRealRow ? `${sym} ${fmt(price)}` : "—"}</Td>
            <Td width={COL.total} align="right" bg={bg} style={{ fontWeight: 600 }}>{isRealRow ? `${sym} ${fmt(lineTotal)}` : "—"}</Td>
            <Td width={COL.hs} bg={bg} style={{ fontSize: px(9.5) }}>{row.hs || "—"}</Td>
            <Td width={COL.kg} align="right" bg={bg}>{row.kg || "—"}</Td>
        </View>
        {!!lineNote && (
            // 098: wrap=false YOK → uzun not sayfalara akar (kırpılmaz). Ürün
            // satırı (S.row) wrap={false} kalır = ürün satırı bütün durur.
            <View style={{ ...S.noteRow, backgroundColor: bg }}>
                <Text style={S.noteText}>
                    <Text style={S.noteLabel}>{L.lineNote.tr} / {L.lineNote.en}: </Text>
                    {lineNote}
                </Text>
            </View>
        )}
        </Fragment>
    );
}

function TotalRow({ label, value, mutedLabel, grand }: {
    label: { tr: string; en: string }; value: string; mutedLabel?: boolean; grand?: boolean;
}) {
    return (
        <View style={S.totalRow} wrap={false}>
            <View style={{
                ...S.totalLabelTd,
                ...(mutedLabel ? { color: C.subtle, fontWeight: 400 } : {}),
                ...(grand ? { backgroundColor: C.brand, color: C.white, fontFamily: FONT.heading, fontWeight: 700, fontSize: px(11), letterSpacing: 0.3 } : {}),
            }}>
                <Text>{label.tr}</Text>
                <Text style={{ ...S.totalLabelEn, ...(grand ? { color: C.whiteFaint } : {}) }}>{label.en}</Text>
            </View>
            <View style={{
                ...S.totalValueTd,
                ...(mutedLabel ? { color: C.muted } : {}),
                ...(grand ? { backgroundColor: C.brand, color: C.white, fontSize: px(13), fontWeight: 700 } : {}),
            }}>
                <Text>{value}</Text>
            </View>
        </View>
    );
}

export default function QuotePdfDocument({ data }: { data: QuoteData }) {
    const sym = CURRENCY_SYMBOLS[data.currency] ?? "₺";
    const title = `${data.quoteNo || "Teklif"} — ${L.title.tr}`;

    return (
        <Document title={title} author={data.sellerName || "Roven"} language="tr">
            <Page size="A4" style={S.page}>

                {/* ── Header band ── */}
                <View style={S.headerBand} wrap={false}>
                    {data.logoSrc
                        // react-pdf Image'inde alt prop'u yoktur (PDF çıktısı, DOM değil)
                        // eslint-disable-next-line jsx-a11y/alt-text
                        ? <Image src={data.logoSrc} style={S.logo} />
                        : <View style={S.logoPlaceholder} />}
                    <View style={{ flex: 1 }}>
                        <Text style={S.sellerName}>{data.sellerName || "Firma Adı"}</Text>
                        <View style={S.sellerInfoWrap}>
                            {!!data.sellerTel && <Text>Tel: {data.sellerTel}</Text>}
                            {!!data.sellerEmail && <Text>E: {data.sellerEmail}</Text>}
                            {!!data.sellerWeb && <Text>Web: {data.sellerWeb}</Text>}
                            {!!data.sellerTaxId && <Text>VKN: {data.sellerTaxId}</Text>}
                            {!!data.sellerAddr && <Text style={{ width: "100%" }}>{data.sellerAddr}</Text>}
                        </View>
                    </View>
                    <View style={S.docRef}>
                        <Text style={S.quoteNoChip}>{data.quoteNo || "TKL-—"}</Text>
                        <Text style={{ fontSize: px(9), color: C.whiteFaint, marginTop: px(6) }}>{fmtDate(data.quoteDate)}</Text>
                        {!!data.validUntil && (
                            <Text style={{ fontSize: px(9), color: "rgba(255,255,255,0.6)", marginTop: px(2) }}>
                                {L.validity.tr}: {fmtDate(data.validUntil)}
                            </Text>
                        )}
                    </View>
                </View>

                {/* ── Title band ── */}
                <View style={S.titleBand} wrap={false}>
                    <Text style={S.titleText}>
                        {L.title.tr}
                        <Text style={{ color: C.border, fontWeight: 600 }}>   |   </Text>
                        <Text style={{ fontStyle: "italic", fontWeight: 600, letterSpacing: 0.6 }}>{L.title.en}</Text>
                    </Text>
                    <View style={S.titleRule} />
                </View>

                {/* ── Meta grid ── */}
                <View style={S.metaGrid} wrap={false}>
                    <View style={S.metaCol}>
                        <Text style={S.metaSectionHead}>{trUpper(L.customer.tr)} <Text style={S.sectionHeadEn}>/ {L.customer.en}</Text></Text>
                        <MetaRow label={L.company} value={data.custCompany} />
                        <MetaRow label={L.contact} value={data.custContact} />
                        <MetaRow label={L.phone} value={data.custPhone} />
                        <MetaRow label={L.email} value={data.custEmail} />
                        <MetaRow label={L.address} value={data.custAddress} />
                    </View>
                    <View style={{ ...S.metaCol, ...S.metaColRight }}>
                        <Text style={S.metaSectionHead}>{trUpper(L.quoteDetails.tr)} <Text style={S.sectionHeadEn}>/ {L.quoteDetails.en}</Text></Text>
                        <MetaRow label={L.salesRep} value={data.salesRep} />
                        <MetaRow label={L.phone} value={data.salesPhone} />
                        <MetaRow label={L.email} value={data.salesEmail} />
                        <MetaRow label={L.quoteNo} value={data.quoteNo} />
                        <MetaRow label={L.date} value={fmtDate(data.quoteDate)} />
                        <MetaRow label={L.validity} value={data.validUntil ? fmtDate(data.validUntil) : ""} />
                        <MetaRow label={L.currency} value={data.currency} />
                    </View>
                </View>

                {/* ── Items table ── */}
                <Text style={S.tableLabel}>{trUpper(L.lineItems.tr)} <Text style={S.sectionHeadEn}>/ {L.lineItems.en}</Text></Text>
                <View style={S.tableBottom}>
                    <View style={S.headRow} wrap={false}>
                        <Th label={L.rowNo} width={COL.rowNo} />
                        <Th label={L.productCode} width={COL.code} />
                        <Th label={L.leadTime} width={COL.lead} />
                        <Th label={L.size} width={COL.size} />
                        <Th label={L.description} grow />
                        <Th label={L.qty} width={COL.qty} />
                        <Th label={L.unitPrice} width={COL.unit} />
                        <Th label={L.totalPrice} width={COL.total} />
                        <Th label={L.hsCode} width={COL.hs} />
                        <Th label={L.weight} width={COL.kg} />
                    </View>
                    {data.rows.map((row, idx) => <ItemRow key={idx} row={row} idx={idx} sym={sym} />)}
                    {data.rows.length === 0 && (
                        <View style={S.row} wrap={false}>
                            <View style={{ ...S.td, flex: 1, alignItems: "center", padding: px(20) }}>
                                <Text style={{ color: C.subtle }}>— {L.emptyRows.tr} / {L.emptyRows.en} —</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* ── Totals ── */}
                <View style={S.totalsSection} wrap={false}>
                    <View style={S.totalsTable}>
                        <TotalRow label={L.subtotal} value={`${sym} ${fmt(data.subtotal)}`} />
                        {data.discountAmount > 0 && (
                            <TotalRow label={L.discount} value={`−${sym} ${fmt(data.discountAmount)}`} />
                        )}
                        <TotalRow
                            label={{ tr: `${L.vat.tr} (${data.vatRate}%)`, en: L.vat.en }}
                            value={`${sym} ${fmt(data.vatTotal)}`}
                        />
                        {data.totalKg > 0 && (
                            <TotalRow label={L.totalWeight} value={`${fmt(data.totalKg)} kg`} mutedLabel />
                        )}
                        <TotalRow label={L.grandTotal} value={`${sym} ${fmt(data.grandTotal)}`} grand />
                    </View>
                </View>

                {/* ── Terms band (Teslimat | Geçerlilik | Ödeme) ── */}
                {!!(data.deliveryMethod || data.validUntil || data.paymentMethod) && (
                    <View style={S.section} wrap={false}>
                        <Text style={S.sectionHead}>{trUpper(L.termsTitle.tr)} <Text style={S.sectionHeadEn}>/ {L.termsTitle.en}</Text></Text>
                        <View style={S.termsGrid}>
                            {[
                                { label: L.delivery, value: data.deliveryMethod || "—", left: false },
                                { label: L.validity, value: data.validUntil ? fmtDate(data.validUntil) : "—", left: true },
                                { label: L.payment, value: data.paymentMethod || "—", left: true },
                            ].map((cell) => (
                                <View key={cell.label.tr} style={{ ...S.termsCol, ...(cell.left ? { borderLeftWidth: 0.5, borderLeftColor: C.border } : {}) }}>
                                    <Text style={S.termsLabel}>{trUpper(cell.label.tr)}</Text>
                                    <Text style={S.termsLabelEn}>{cell.label.en}</Text>
                                    <Text style={S.termsValue}>{cell.value}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                {/* ── Notes ── */}
                {!!data.notes && (
                    <View style={S.section} wrap={false}>
                        <Text style={S.sectionHead}>{trUpper(L.notes.tr)} <Text style={S.sectionHeadEn}>/ {L.notes.en}</Text></Text>
                        <View style={S.notesBox}>
                            <Text>{data.notes}</Text>
                        </View>
                    </View>
                )}

                {/* ── Signatures ── */}
                <View style={{ ...S.section, paddingBottom: px(22) }} wrap={false}>
                    <Text style={S.sectionHead}>{trUpper(L.signatures.tr)} <Text style={S.sectionHeadEn}>/ {L.signatures.en}</Text></Text>
                    <View style={S.sigGrid}>
                        {data.signatures.map((sig, i) => (
                            <View key={i} style={S.sigCol}>
                                <Text style={{ fontSize: px(10), fontWeight: 700, fontFamily: FONT.heading, color: C.text, marginBottom: px(2) }}>{sig.roleTr}</Text>
                                <Text style={{ fontSize: px(8.5), color: C.muted, fontStyle: "italic", marginBottom: px(6) }}>{sig.role}</Text>
                                <Text style={{ fontSize: px(10.5), fontWeight: 600, color: C.text, minHeight: px(16) }}>{sig.name || " "}</Text>
                                <Text style={{ fontSize: px(9.5), color: C.muted, minHeight: px(14), marginBottom: px(6) }}>{sig.title || " "}</Text>
                                <View style={S.sigLine} />
                            </View>
                        ))}
                    </View>
                </View>

                {/* ── Footer band ── */}
                <View style={S.footerBand} wrap={false}>
                    <View style={S.footerInfo}>
                        {!!data.sellerAddr && (
                            <Text>
                                <Text style={{ color: C.text, fontWeight: 600 }}>{L.hq.tr} / {L.hq.en}: </Text>
                                {data.sellerAddr}
                            </Text>
                        )}
                        {!!data.sellerTel && (
                            <Text>
                                <Text style={{ color: C.text, fontWeight: 600 }}>{L.tel.tr}: </Text>
                                {data.sellerTel}
                            </Text>
                        )}
                        {!!data.sellerWeb && (
                            <Text>
                                <Text style={{ color: C.text, fontWeight: 600 }}>{L.web.tr}: </Text>
                                {data.sellerWeb}
                            </Text>
                        )}
                    </View>
                    <View style={S.footerMeta}>
                        <Text style={{ fontFamily: FONT.heading, fontWeight: 600, color: C.muted }}>{data.sellerName}</Text>
                        <Text>{L.confidential.tr} / {L.confidential.en}</Text>
                        <Text>{data.validUntil ? `${L.validity.tr}: ${fmtDate(data.validUntil)}` : " "}</Text>
                    </View>
                </View>

            </Page>
        </Document>
    );
}
