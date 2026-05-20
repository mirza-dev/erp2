/**
 * Faz 3b — Product matcher.
 *
 * AI ekstraksiyonu ile çıkarılan adayları (name/sku/attributes)
 * mevcut katalogla skorlayıp top-3 candidate üretir.
 *
 * Skor formülü (max 100):
 *   exact SKU eşleşmesi              → +40, reason "sku_exact"
 *   pg_trgm benzerliği ≥0.8          → +30, reason "name_high"
 *   key attributes (dn + class) match → +20, reason "attr_match"
 *   partial name (similarity 0.4-0.8) → +10, reason "name_partial"
 *
 * Threshold:
 *   ≥85 → matched (auto-link)
 *   60-84 → review_required (top-3 prompt)
 *   <60 → new_product (yeni ürün önerisi)
 */
import type {
    ImportDocumentLineCandidate,
    ImportDocumentLineMatchAction,
    ProductRow,
} from "@/lib/database.types";
import { dbListAllActiveProducts } from "@/lib/supabase/products";

export interface MatchableProduct {
    id: string;
    sku: string;
    name: string;
    attributes: Record<string, unknown>;
}

export interface ExtractedRowInput {
    name?: string | null;
    sku?: string | null;
    attributes?: Record<string, unknown>;
}

const AUTO_MATCH_THRESHOLD = 85;
const REVIEW_THRESHOLD = 60;

// Key attribute GROUPS — DN ve PN ayrı eksenler; her gruptan bir key
// eşleşirse +20 puan. İki grup birden eşleşirse +40 (auto-link garantili
// olabilsin diye). Eski "flat list +20 bir kez" semantiği plan'ın
// "DN + sınıf + isim tam → auto" tarifini karşılamıyordu (Review 3b P2-B).
export const KEY_ATTR_GROUPS: ReadonlyArray<{ name: string; keys: ReadonlyArray<string> }> = [
    { name: "dn", keys: ["dn", "nominal_diameter"] },
    { name: "pn", keys: ["pn_class", "pressure_class"] },
];

export function decideMatchAction(score: number): Exclude<ImportDocumentLineMatchAction, "reviewed"> {
    if (score >= AUTO_MATCH_THRESHOLD) return "matched";
    if (score >= REVIEW_THRESHOLD) return "pending"; // user picks from top-3
    return "new_product";
}

/**
 * Trigram benzerliği (Jaccard üzerinden basitleştirilmiş). pg_trgm SQL-side
 * fonksiyonu birebir değil ama yakın behaviour üretir; in-memory matcher
 * için yeterli.
 */
export function trigramSimilarity(a: string, b: string): number {
    const normA = a.toLowerCase().trim();
    const normB = b.toLowerCase().trim();
    if (!normA || !normB) return 0;
    if (normA === normB) return 1;

    const padded = (s: string) => `  ${s}  `;
    const trigrams = (s: string): Set<string> => {
        const padded_s = padded(s);
        const out = new Set<string>();
        for (let i = 0; i < padded_s.length - 2; i++) {
            out.add(padded_s.slice(i, i + 3));
        }
        return out;
    };

    const tA = trigrams(normA);
    const tB = trigrams(normB);
    let intersection = 0;
    for (const t of tA) {
        if (tB.has(t)) intersection++;
    }
    const union = tA.size + tB.size - intersection;
    return union === 0 ? 0 : intersection / union;
}

function normalizeAttrValue(v: unknown): string {
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v.toLowerCase().trim();
    if (typeof v === "number" || typeof v === "boolean") return String(v).toLowerCase();
    return JSON.stringify(v).toLowerCase();
}

/**
 * Tek bir product ile extracted input arasında skor + reason listesi üretir.
 * Pure — test edilebilir.
 */
export function scoreProductMatch(
    product: MatchableProduct,
    input: ExtractedRowInput,
): { score: number; reasons: string[] } {
    let score = 0;
    const reasons: string[] = [];

    // SKU exact (case-insensitive) — +40
    if (input.sku && product.sku) {
        if (product.sku.toLowerCase().trim() === input.sku.toLowerCase().trim()) {
            score += 40;
            reasons.push("sku_exact");
        }
    }

    // Name similarity — high +45 / partial +15 (Review 3b P2-B weight bump
    // 30→45 so that SKU+name=85 reaches auto-link threshold for cert flow)
    if (input.name && product.name) {
        const sim = trigramSimilarity(input.name, product.name);
        if (sim >= 0.8) {
            score += 45;
            reasons.push("name_high");
        } else if (sim >= 0.4) {
            score += 15;
            reasons.push("name_partial");
        }
    }

    // Key attribute GROUPS — her grup'tan bir eşleşme +20 (max +40 toplam).
    // Plan tarifi: "DN + sınıf + isim tam eşleşme → auto-link" → 45+20+20=85.
    if (input.attributes && product.attributes) {
        for (const group of KEY_ATTR_GROUPS) {
            for (const key of group.keys) {
                const inV = normalizeAttrValue(input.attributes[key]);
                const prV = normalizeAttrValue(product.attributes[key]);
                if (inV && prV && inV === prV) {
                    score += 20;
                    reasons.push(`attr_${group.name}`);
                    break; // bir grup içinde sadece bir key sayılır
                }
            }
        }
    }

    return { score: Math.min(100, score), reasons };
}

/**
 * Aktif ürünleri in-memory matching için lite shape'e çevirir. Route bunu
 * extraction loop ÖNCESİ bir kez çağırıp `productsCache` olarak matcher'a
 * geçer → N satır × 1 fetch (eski: N fetch). Review 3b P2/P3-D fix.
 */
export async function loadActiveMatchables(): Promise<MatchableProduct[]> {
    const allProducts: ProductRow[] = await dbListAllActiveProducts();
    return allProducts.map(p => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        attributes: (p.attributes ?? {}) as Record<string, unknown>,
    }));
}

/**
 * Top-N candidate üretir. `productsCache` verilirse yeniden fetch etmez
 * (extraction loop performansı için kritik). undefined ise mevcut davranış
 * (her çağrıda fetch) — tek-satır kullanımlar için geriye uyumlu.
 */
export async function findProductMatchCandidates(
    input: ExtractedRowInput,
    limit = 3,
    productsCache?: MatchableProduct[],
): Promise<ImportDocumentLineCandidate[]> {
    if (!input.name && !input.sku && !input.attributes) return [];

    const matchables = productsCache ?? await loadActiveMatchables();
    return rankProductCandidates(matchables, input, limit);
}

/**
 * Pure ranking — test edilebilirlik için ayrı export.
 */
export function rankProductCandidates(
    products: MatchableProduct[],
    input: ExtractedRowInput,
    limit = 3,
): ImportDocumentLineCandidate[] {
    const scored = products
        .map(p => {
            const { score, reasons } = scoreProductMatch(p, input);
            return { id: p.id, sku: p.sku, name: p.name, score, reasons };
        })
        .filter(c => c.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return scored;
}
