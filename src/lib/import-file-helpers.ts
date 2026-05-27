/**
 * Faz 3a — File upload helpers for AI import.
 * Extracted from DropZone.tsx so the component file exports only the component
 * (React Fast Refresh requirement).
 */

export const CLASSIFIER_ACCEPT =
    "image/png,image/jpeg,image/webp,application/pdf," +
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
    "application/vnd.ms-excel,text/csv";

const MAX_BYTES = 10 * 1024 * 1024;

export const CLASSIFIER_ALLOWED_MIMES = new Set([
    "image/png", "image/jpeg", "image/webp", "application/pdf",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel", "text/csv",
]);

export interface UploadValidation {
    ok: boolean;
    reason?: string;
}

export function validateClassifyUpload(file: File): UploadValidation {
    if (!file) return { ok: false, reason: "Dosya yok." };
    if (file.size <= 0) return { ok: false, reason: "Dosya boş." };
    if (file.size > MAX_BYTES) {
        return { ok: false, reason: `Dosya 10 MB sınırını aşıyor (${formatBytes(file.size)}).` };
    }
    if (!CLASSIFIER_ALLOWED_MIMES.has(file.type)) {
        return { ok: false, reason: `Desteklenmeyen dosya türü: ${file.type || "bilinmiyor"}.` };
    }
    return { ok: true };
}

export function pickAcceptForMime(mime: string): string | null {
    return CLASSIFIER_ALLOWED_MIMES.has(mime) ? mime : null;
}

export function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
