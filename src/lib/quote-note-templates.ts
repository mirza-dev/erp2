import type { NoteTemplate, NoteTemplateKind } from "@/lib/mock-data";

/**
 * Teklif formunun bir serbest-metin alanına not şablonu uygular.
 * Sessiz üzerine-yazma YOK: alan boşsa şablonla doldurur; doluysa sonuna
 * yeni satır + şablon ekler (append).
 */
export function applyTemplateToField(current: string, body: string): string {
    if (!current || current.trim().length === 0) return body;
    return `${current}\n${body}`;
}

/**
 * Bir alan türü (notes/delivery/payment) için gösterilecek şablonlar:
 * o türe ait olanlar + her alanda görünen "general" şablonlar, sort_order'a göre.
 * fieldKind="general" verilirse yalnız general döner.
 */
export function templatesForField(
    templates: NoteTemplate[],
    fieldKind: Exclude<NoteTemplateKind, "general"> | "general",
): NoteTemplate[] {
    return templates
        .filter((t) => t.kind === fieldKind || t.kind === "general")
        .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, "tr"));
}
