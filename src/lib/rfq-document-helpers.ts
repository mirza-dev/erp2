/**
 * RFQ (tedarikçi fiyat talebi) belgesi için saf yardımcılar + tipler.
 * Müşteri Teklif belgesi (quote-document-helpers) deseni; tek fark belge bir
 * TALEP — fiyat içermez, tedarikçiden fiyat istenir.
 */

export interface RfqDocLine {
    position: number;
    code: string;
    description: string;
    qty: string;
    unit: string;
    targetDate: string;
    notes: string;
}

export interface RfqDocData {
    rfqNo: string;
    title: string;
    rfqDate: string;
    dueDate: string;
    currency: string;
    notes: string;

    // Satıcı (talebi yapan firma) snapshot
    sellerName: string;
    sellerTel: string;
    sellerEmail: string;
    sellerAddr: string;
    sellerTaxId: string;
    sellerWeb: string;
    logoSrc: string | null;

    // Bu belgenin gönderildiği tedarikçi
    vendorName: string;
    vendorContact: string;
    vendorEmail: string;

    lines: RfqDocLine[];
}

/** ISO `YYYY-MM-DD` → `DD.MM.YYYY` (TZ kayması olmadan). Boş/geçersiz → "". */
export function fmtRfqDate(iso: string | null | undefined): string {
    if (!iso) return "";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return `${m[3]}.${m[2]}.${m[1]}`;
}

/** İki dilli (TR / EN) belge etiketleri. */
export const RFQ_LABELS = {
    title: "Fiyat Talebi / Request for Quotation",
    no: "Talep No / RFQ No",
    date: "Tarih / Date",
    due: "Yanıt Son Tarihi / Response Due",
    to: "Tedarikçi / Supplier",
    pos: "#",
    code: "Kod / Code",
    desc: "Açıklama / Description",
    qty: "Miktar / Qty",
    target: "İstenen Teslim / Required",
    notes: "Notlar / Notes",
    ask: "Lütfen yukarıdaki kalemler için birim fiyat, teslim süresi ve geçerlilik tarihi bildiriniz. / Please quote unit price, lead time and validity for the items above.",
} as const;
