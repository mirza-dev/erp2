/**
 * Faz 3a/3b — Classifier queue helpers.
 * Extracted from ClassifierQueue.tsx so the component file exports only the component
 * (React Fast Refresh requirement).
 */
import type { DocumentType, DocumentClassification } from "@/lib/database.types";

// Faz 3b — hangi document_type'lar için "İncele" CTA enable olur.
const EXTRACTION_SUPPORTED_TYPES: ReadonlySet<DocumentType> = new Set([
    "product_catalog",
    "product_datasheet",
    "material_certificate",
    "compliance_doc",
    "test_report",
]);

export function isExtractionSupportedType(t: DocumentType): boolean {
    return EXTRACTION_SUPPORTED_TYPES.has(t);
}

export function isMigrationExcelType(t: DocumentType): boolean {
    return t === "migration_excel";
}

export function chunkBy<T>(arr: T[], size: number): T[][] {
    if (size <= 0) return [arr];
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        out.push(arr.slice(i, i + size));
    }
    return out;
}

export interface ConcurrencySelectableItem {
    id: string;
    started: boolean;
    status: "uploading" | "classifying" | "classified" | "error";
}

/**
 * Concurrency cap'i aşmadan, henüz fetch ateşlenmemiş ("started=false") ve
 * "uploading" durumundaki adayları döner. Returned slice <= cap.
 */
export function selectClassifyCandidates<T extends ConcurrencySelectableItem>(
    queue: T[],
    cap: number,
): T[] {
    if (cap <= 0) return [];
    const inFlight = queue.filter(q => q.status === "classifying").length;
    const free = Math.max(0, cap - inFlight);
    if (free === 0) return [];
    return queue.filter(q => !q.started && q.status === "uploading").slice(0, free);
}

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
    product_catalog: "Ürün Kataloğu",
    product_datasheet: "Veri Sayfası",
    material_certificate: "Sertifika",
    compliance_doc: "Uygunluk Belgesi",
    test_report: "Test Raporu",
    msds: "MSDS",
    vendor_profile: "Tedarikçi Profili",
    product_photo: "Ürün Fotoğrafı",
    migration_excel: "Migration Excel",
    unknown: "Belirsiz",
};

const DOCUMENT_TYPE_ICONS: Record<DocumentType, string> = {
    product_catalog: "📚",
    product_datasheet: "📄",
    material_certificate: "📜",
    compliance_doc: "✅",
    test_report: "🧪",
    msds: "⚠️",
    vendor_profile: "🏢",
    product_photo: "🖼️",
    migration_excel: "📊",
    unknown: "❓",
};

export function documentTypeLabel(t: DocumentType): string {
    return DOCUMENT_TYPE_LABELS[t] ?? "Belirsiz";
}

export function documentTypeIcon(t: DocumentType): string {
    return DOCUMENT_TYPE_ICONS[t] ?? "❓";
}

const LANG_LABELS: Record<string, string> = {
    tr: "Türkçe",
    en: "İngilizce",
    de: "Almanca",
    fr: "Fransızca",
    it: "İtalyanca",
    es: "İspanyolca",
    unknown: "Bilinmiyor",
};

export function formatLanguage(code: string): string {
    return LANG_LABELS[code?.toLowerCase()] ?? code ?? "Bilinmiyor";
}

export function confidenceColor(c: number): string {
    if (c >= 0.8) return "var(--success-text)";
    if (c >= 0.5) return "var(--warning-text)";
    return "var(--danger-text)";
}

export interface ClassifierBadge {
    label: string;
    color: string;
    background: string;
}

export function classifierResultBadge(c: DocumentClassification): ClassifierBadge {
    const pct = Math.round(c.confidence * 100);
    return {
        label: `${documentTypeLabel(c.document_type)} · %${pct}`,
        color: confidenceColor(c.confidence),
        background: c.confidence >= 0.8 ? "var(--success-bg)"
            : c.confidence >= 0.5 ? "var(--warning-bg)"
                : "var(--danger-bg)",
    };
}
