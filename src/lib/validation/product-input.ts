import { validateStringLengths } from "@/lib/validation/string-lengths";
import type { CreateProductInput } from "@/lib/supabase/products";

// Ürün gövdesi ortak doğrulaması — POST + PATCH route'ları paylaşır.
// Ayrı dosyada (products.ts'te DEĞİL): 60+ test `@/lib/supabase/products`'ı
// tam mock'luyor; helper orada olsa route'lar bu testlerde `undefined`
// çağırıp patlardı. `validateStringLengths` de saf modülden import edilir
// (api-error.ts'ten DEĞİL — o modül bazı testlerde mock'lanıyor). Burası
// hiçbir testte mock'lanmaz.

const MAX_PRODUCT_NUM = 999_999_999;
const NUMERIC_PRODUCT_FIELDS: { key: keyof CreateProductInput; label: string }[] = [
    { key: "price",           label: "Fiyat" },
    { key: "on_hand",         label: "Stok miktarı" },
    { key: "min_stock_level", label: "Minimum stok seviyesi" },
    { key: "cost_price",      label: "Maliyet fiyatı" },
    { key: "reorder_qty",     label: "Yeniden sipariş adedi" },
    { key: "daily_usage",     label: "Günlük tüketim" },
    { key: "lead_time_days",  label: "Tedarik süresi" },
    { key: "weight_kg",       label: "Ağırlık" },
];

/**
 * Ürün gövdesi için ortak doğrulama — POST (`requireCore: true`) ve
 * PATCH (`requireCore: false`, partial) aynı kuralları paylaşır.
 * Hata mesajı (string) veya geçerliyse null döner.
 * - String uzunluğu (validateStringLengths, recursive) — her iki yol
 * - name/sku/unit zorunlu — yalnız requireCore (POST)
 * - Numeric sınır: negatif YASAK + üst sınır (MAX_PRODUCT_NUM) — her iki yol.
 *   (Number ile coerce; non-finite değer sessizce atlanır = mevcut davranış
 *    korunur, DB tarafı reddeder. Negatif guard hem number hem numeric-string'i
 *    kapsar; eski POST yalnız `> MAX` kontrol ediyordu, PATCH'te hiç yoktu.)
 */
export function validateProductInput(
    body: Partial<CreateProductInput>,
    opts: { requireCore: boolean }
): string | null {
    const lengthErr = validateStringLengths(body as unknown as Record<string, unknown>);
    if (lengthErr) return lengthErr;

    if (opts.requireCore) {
        if (!body.name?.trim()) return "Ürün adı zorunludur.";
        if (!body.sku?.trim()) return "SKU zorunludur.";
        if (!body.unit?.trim()) return "Birim zorunludur.";
    }

    for (const { key, label } of NUMERIC_PRODUCT_FIELDS) {
        const raw = body[key];
        if (raw === undefined || raw === null || raw === "") continue;
        const n = Number(raw);
        if (!Number.isFinite(n)) continue; // sayısal olmayan → DB reddeder (mevcut davranış)
        if (n < 0) return `${label} negatif olamaz.`;
        if (n > MAX_PRODUCT_NUM) return `${label} çok büyük.`;
    }
    return null;
}
