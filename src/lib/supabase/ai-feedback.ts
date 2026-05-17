import { createServiceClient } from "./service";
import { sanitizeFeedbackForPrompt } from "@/lib/ai-guards";

/**
 * Faz 8 — Bulk fetch sanitized rejection notes per product.
 *
 * Tek RPC çağrısı (`get_recent_rejections_for_products`) ile her ürün için
 * son N (default 3) rejection notunu çeker. RPC içinde ROW_NUMBER PARTITION
 * BY entity_id + 90-gün cutoff + entity_type='product' + recommendation_type=
 * 'purchase_suggestion' + feedback_type='rejected' filtreleri uygulanır.
 *
 * JS-side: her not `sanitizeFeedbackForPrompt` ile temizlenir; sanitize sonucu
 * boşalan kayıtlar atılır. Empty `productIds` → boş Map (RPC çağrılmaz).
 */
export async function dbGetRecentRejectionsForProducts(
    productIds: string[],
    limitPerProduct = 3,
): Promise<Map<string, string[]>> {
    if (productIds.length === 0) return new Map();

    const sb = createServiceClient();
    const { data, error } = await sb.rpc("get_recent_rejections_for_products", {
        p_product_ids: productIds,
        p_limit: limitPerProduct,
    });
    if (error) throw new Error(error.message);

    const map = new Map<string, string[]>();
    for (const row of (data ?? []) as Array<{ entity_id: string; feedback_note: string }>) {
        const sanitized = sanitizeFeedbackForPrompt(row.feedback_note);
        if (!sanitized) continue;
        const arr = map.get(row.entity_id) ?? [];
        arr.push(sanitized);
        map.set(row.entity_id, arr);
    }
    return map;
}
