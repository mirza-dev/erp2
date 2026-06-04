import type {
    ProductTypeFieldRow,
    TechnicalExtractionEvidence,
    TechnicalFieldEvidence,
    AiEvidenceConfidence,
} from "@/lib/database.types";

const TURKISH_CHAR_MAP: Record<string, string> = {
    ç: "c",
    ğ: "g",
    ı: "i",
    ö: "o",
    ş: "s",
    ü: "u",
    Ç: "c",
    Ğ: "g",
    İ: "i",
    I: "i",
    Ö: "o",
    Ş: "s",
    Ü: "u",
};

export function generateTechnicalFieldKey(label: string): string {
    const normalized = label
        .split("")
        .map(ch => TURKISH_CHAR_MAP[ch] ?? ch)
        .join("")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .replace(/_{2,}/g, "_");

    if (!normalized) return "";
    if (/^[a-z]/.test(normalized)) return normalized.slice(0, 50);
    return `f_${normalized}`.slice(0, 50);
}

export function isBlankTechnicalValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

export function missingRequiredTechnicalFields(
    fields: ProductTypeFieldRow[],
    attributes: Record<string, unknown> | null | undefined,
): ProductTypeFieldRow[] {
    const attrs = attributes ?? {};
    return fields.filter(field =>
        field.is_active !== false
        && field.required
        && isBlankTechnicalValue(attrs[field.field_key])
    );
}

export function filterActiveTechnicalFields(fields: ProductTypeFieldRow[]): ProductTypeFieldRow[] {
    return fields.filter(field => field.is_active !== false);
}

export function confidenceLabel(confidence: AiEvidenceConfidence): string {
    if (confidence === "high") return "Yüksek";
    if (confidence === "medium") return "Orta";
    if (confidence === "low") return "Düşük";
    return "Bulunamadı";
}

export function normalizeEvidenceConfidence(raw: unknown): AiEvidenceConfidence {
    if (raw === "high" || raw === "medium" || raw === "low" || raw === "not_found") {
        return raw;
    }
    return "low";
}

export function normalizeTechnicalEvidence(
    raw: unknown,
    allowedKeys: Set<string>,
): TechnicalExtractionEvidence {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: TechnicalExtractionEvidence = {};

    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (!allowedKeys.has(key)) continue;
        if (!value || typeof value !== "object" || Array.isArray(value)) continue;

        const item = value as Record<string, unknown>;
        const evidenceText = typeof item.evidence_text === "string"
            ? item.evidence_text.slice(0, 500)
            : typeof item.evidenceText === "string"
                ? item.evidenceText.slice(0, 500)
                : null;
        let confidence = normalizeEvidenceConfidence(item.confidence);

        // Kanıt yoksa yüksek güven kabul edilmez.
        if (!evidenceText && confidence === "high") confidence = "medium";

        const normalized: TechnicalFieldEvidence = {
            confidence,
            evidence_text: evidenceText,
            normalization_note: typeof item.normalization_note === "string"
                ? item.normalization_note.slice(0, 300)
                : typeof item.normalizationNote === "string"
                    ? item.normalizationNote.slice(0, 300)
                    : null,
        };

        const location = item.evidence_location ?? item.evidenceLocation;
        if (location && typeof location === "object" && !Array.isArray(location)) {
            const loc = location as Record<string, unknown>;
            normalized.evidence_location = {
                page: typeof loc.page === "number" ? loc.page : undefined,
                row: typeof loc.row === "number" ? loc.row : undefined,
                column: typeof loc.column === "string" ? loc.column.slice(0, 80) : undefined,
            };
        }

        out[key] = normalized;
    }

    return out;
}
