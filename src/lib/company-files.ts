/**
 * Ayarlar → Dosyalar (şirket dosya arşivi) — paylaşılan saf yardımcılar.
 *
 * Client (DosyalarTab) + server (API route, DB helper) aynı kaynağı kullanır;
 * bu dosya bilinçli olarak React/Next/Supabase import ETMEZ.
 */
import type { CompanyFileCategory } from "@/lib/database.types";

export const FILE_CATEGORIES: { key: CompanyFileCategory; label: string }[] = [
    { key: "sozlesme", label: "Sözleşmeler" },
    { key: "belge", label: "Sertifikalar & Belgeler" },
    { key: "teklif-eki", label: "Teklif Ekleri" },
    { key: "kurumsal", label: "Kurumsal Kimlik" },
    { key: "diger", label: "Diğer" },
];

export function isCompanyFileCategory(v: unknown): v is CompanyFileCategory {
    return typeof v === "string" && FILE_CATEGORIES.some(c => c.key === v);
}

export function catLabel(key: string): string {
    return FILE_CATEGORIES.find(c => c.key === key)?.label ?? key;
}

/** "Rapor.final.PDF" → { base: "Rapor.final", ext: "pdf" }. Uzantısız ad → ext "". */
export function splitName(filename: string): { base: string; ext: string } {
    const i = filename.lastIndexOf(".");
    if (i <= 0) return { base: filename, ext: "" };
    return { base: filename.slice(0, i), ext: filename.slice(i + 1).toLowerCase() };
}

/** TR biçimli boyut: 2,3 MB · 456 KB · 84 B. */
export function formatFileSize(bytes: number): string {
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
    if (bytes >= 1024) return Math.round(bytes / 1024) + " KB";
    return bytes + " B";
}

/** Uzantı etiketi metin rengi — çerçeve/arka plan nötr kalır, renk yalnız metinde. */
export const EXT_TEXT_COLORS: Record<string, string> = {
    PDF: "var(--danger-text)",
    XLSX: "var(--success-text)",
    XLS: "var(--success-text)",
    DOCX: "var(--accent-text)",
    DOC: "var(--accent-text)",
};

export function extTextColor(ext: string): string {
    return EXT_TEXT_COLORS[ext.toUpperCase()] ?? "var(--text-secondary)";
}

/** Depolama kotası (gösterge limiti) — 5 GB. */
export const COMPANY_FILES_STORAGE_LIMIT_MB = 5120;

export const MAX_COMPANY_FILE_SIZE = 25 * 1024 * 1024; // 25 MB — bucket limitiyle aynı

/**
 * Uzantı allowlist + uzantı→MIME haritası. contentType uzantıdan türetilir:
 * tarayıcı `file.type`'ı bilinmeyen uzantılarda boş bırakabilir → bucket'ın
 * allowed_mime_types reddini yememek için tek kaynak burasıdır (091 ile eş).
 */
export const ALLOWED_COMPANY_FILE_EXT_MIME: Record<string, string> = {
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ppt: "application/vnd.ms-powerpoint",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    svg: "image/svg+xml",
    zip: "application/zip",
    csv: "text/csv",
    txt: "text/plain",
};

export function isAllowedCompanyFileExt(ext: string): boolean {
    return Object.prototype.hasOwnProperty.call(ALLOWED_COMPANY_FILE_EXT_MIME, ext.toLowerCase());
}

export function contentTypeForExt(ext: string): string | null {
    return ALLOWED_COMPANY_FILE_EXT_MIME[ext.toLowerCase()] ?? null;
}

/** Kullanıcıya gösterilen kabul listesi (hata mesajı + input accept). */
export const ALLOWED_COMPANY_FILE_EXT_LABEL = Object.keys(ALLOWED_COMPANY_FILE_EXT_MIME)
    .map(e => e.toUpperCase())
    .join(", ");
