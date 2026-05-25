import type { Product } from "@/lib/mock-data";

/**
 * Faz 4b (2026-05-25, Review 1 — 2026-05-25) — PMT brand auto-build description.
 *
 * Plan §484-488 (MODUL_REVIZE_PLAN.md):
 *   - Şablon (doc):  `{name} {body_material}, {pn_class} {end_connection}, {trim_material} TRİM`
 *   - Örnek (Vana):  `GATE VALVE A105 GÖVDE, CLASS 600 SW, SS TRİM`
 *
 * Review 1 düzeltmesi (P3): İlk implementasyon literal template substitution
 * yapıyordu ve plan'ın örnekteki virgül yerleşimiyle çelişiyordu (örnek
 * body_material'dan sonra virgül istiyor, şablonda yoktu). PMT teklif diline
 * uygun noktalama için **örnek authoritative kabul edildi** ve helper
 * parts-join paterniyle yeniden yazıldı:
 *
 *   part1 = name + body_material         (boşlukla)
 *   part2 = pn_class + end_connection    (boşlukla)
 *   part3 = trim_material + "TRİM"       (boşlukla; trim_material yoksa drop)
 *   sonuç = parts.filter(Boolean).join(", ")
 *
 * Multi-type uyum (project_pmt_multi_type): PMT'de Conta/Flans/Bağlantı
 * Elemanı/... aynı katalogda. Vana key'leri (`body_material`/`pn_class`/
 * `end_connection`/`trim_material`) yalnız Vana tipinde tanımlı — diğer
 * tiplerde attribute'lar mevcut değil → yalnız `name` kalır (graceful).
 *
 * Override semantiği: helper sadece string üretir. Per-row "user-edited"
 * dirty tracking QuoteForm tarafında (Set<rowId>); helper override
 * durumunda hiç çağrılmaz. Faz 4b Review P2: dirty Set artık localStorage
 * ile persist edilir (`teklif_v3.descDirty` boolean[] index-aligned).
 */
export const QUOTE_DESCRIPTION_TEMPLATE =
    "{name} {body_material}, {pn_class} {end_connection}, {trim_material} TRİM";

export function buildQuoteLineDescription(product: Product): string {
    const name = (product.name ?? "").trim();
    const attrs = (product.attributes ?? {}) as Record<string, unknown>;
    const get = (k: string): string => {
        const v = attrs[k];
        if (v == null) return "";
        if (typeof v === "string") return v.trim();
        if (typeof v === "number" || typeof v === "boolean") return String(v);
        return ""; // array/object — şablona uygun değil
    };
    const body = get("body_material");
    const pn   = get("pn_class");
    const end  = get("end_connection");
    const trim = get("trim_material");

    const part1 = [name, body].filter(Boolean).join(" ");
    const part2 = [pn,   end ].filter(Boolean).join(" ");
    const part3 = trim ? `${trim} TRİM` : "";

    return [part1, part2, part3]
        .filter(Boolean)
        .join(", ")
        .replace(/\s{2,}/g, " ")
        .trim();
}
