/**
 * Faz 3b — Extraction review screen helpers.
 * Extracted from ExtractionReview.tsx so the component file exports only the component
 * (React Fast Refresh requirement).
 */
import type { ImportDocumentLineMatchAction } from "@/lib/database.types";

export function formatMatchAction(action: ImportDocumentLineMatchAction): string {
    switch (action) {
        case "pending": return "İnceleme bekliyor";
        case "matched": return "Eşleştirildi";
        case "new_product": return "Yeni ürün";
        case "skipped": return "Atlandı";
        case "reviewed": return "Onaylandı";
    }
}

export function getMatchActionColor(action: ImportDocumentLineMatchAction): { bg: string; text: string; border: string } {
    switch (action) {
        case "matched":
        case "reviewed":
            return { bg: "var(--success-bg)", text: "var(--success-text)", border: "var(--success-border)" };
        case "new_product":
            return { bg: "var(--accent-bg)", text: "var(--accent-text)", border: "var(--accent-border)" };
        case "skipped":
            return { bg: "var(--bg-tertiary)", text: "var(--text-tertiary)", border: "var(--border-tertiary)" };
        case "pending":
        default:
            return { bg: "var(--warning-bg)", text: "var(--warning-text)", border: "var(--warning-border)" };
    }
}

export function pickSuggestedAction(topScore: number | null): ImportDocumentLineMatchAction {
    if (topScore === null) return "new_product";
    if (topScore >= 85) return "matched";
    if (topScore >= 60) return "pending";
    return "new_product";
}

export function formatProductTypeName(
    id: string | null,
    productTypes: ReadonlyArray<{ id: string; name: string }>,
): string {
    if (!id) return "—";
    return productTypes.find(t => t.id === id)?.name ?? "—";
}

// Faz 3c — apply route ApplyResult shape (import-apply-service.ts ile aynı)
export interface ApplyResultSummary {
    products_created: number;
    products_updated: number;
    attachments_created: number;
    attachments_superseded: number;
    technical_fields_applied?: number;
    // Faz D — katalog PDF'inden render edilip eklenen ürün görseli sayısı.
    images_extracted?: number;
    skipped: number;
    errors: string[];
    untyped_products: number;
    status_update_failed?: boolean;
}

// Review 3b 5.tur P2: dosya-ekleme flow'larında product_type_id kullanılmaz.
const CERT_FLOW_TYPES: ReadonlySet<string> = new Set([
    "material_certificate", "compliance_doc", "test_report", "product_photo",
]);

export function isCertFlowDocumentType(t: string | null | undefined): boolean {
    return typeof t === "string" && CERT_FLOW_TYPES.has(t);
}
