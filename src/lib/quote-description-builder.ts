import type { Product } from "@/lib/mock-data";

/**
 * Faz 4b (2026-05-25) — PMT brand auto-build description.
 *
 * Plan §484-488 (MODUL_REVIZE_PLAN.md): teklif satırında ürün seçilince
 * description otomatik oluşturulur. Şablon Vana-merkezli — PMT'nin sıkça
 * yazdığı kompozit description'ı otomatize eder.
 *
 * Şablon: `{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM`
 * Örnek (Vana): "GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM"
 *
 * Multi-type uyum: PMT'de Conta/Flans/Bağlantı Elemanı/... aynı katalogda
 * (project_pmt_multi_type). Bu key'ler yalnız Vana tipinde tanımlı; diğer
 * tiplerde attribute'lar mevcut değil → helper graceful degrade eder
 * (yalnız `name` kalır). Trailing " , TRİM" / fazla boşluk / yalnız "TRİM"
 * temizlenir (post-processing).
 *
 * Override semantiği: helper sadece string üretir. Per-row "user-edited"
 * dirty tracking QuoteForm tarafında (Set<rowId>); helper override
 * durumunda hiç çağrılmaz.
 */
export const QUOTE_DESCRIPTION_TEMPLATE =
    "{name} {body_material} {pn_class} {end_connection}, {trim_material} TRİM";

export function buildQuoteLineDescription(product: Product): string {
    const name = (product.name ?? "").trim();
    const attrs = (product.attributes ?? {}) as Record<string, unknown>;
    const get = (k: string): string => {
        const v = attrs[k];
        if (v == null) return "";
        if (typeof v === "string") return v.trim();
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        return ""; // array/object → şablona uygun değil
    };
    const trim = get("trim_material");
    const raw = QUOTE_DESCRIPTION_TEMPLATE
        .replace("{name}",           name)
        .replace("{body_material}",  get("body_material"))
        .replace("{pn_class}",       get("pn_class"))
        .replace("{end_connection}", get("end_connection"))
        .replace("{trim_material}",  trim);
    // trim_material boş ise trailing "TRİM" anlamsız → drop.
    // Sonra fazla boşluk / iki ardışık virgül / leading-trailing virgül-boşluk temizliği.
    const noTrim = trim ? raw : raw.replace(/,\s*TRİM\s*$/u, "");
    return noTrim
        .replace(/\s{2,}/g, " ")
        .replace(/\s*,\s*,/g, ",")
        .replace(/^[\s,]+|[\s,]+$/g, "")
        .trim();
}
