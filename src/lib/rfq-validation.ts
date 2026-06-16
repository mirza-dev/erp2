/**
 * RFQ (tedarikçi fiyat talebi) API-boundary doğrulayıcıları. PO validatePoLines
 * deseni: DB CHECK/cast hatalarını 500 yerine 400'e map etmek için saf string|null
 * dönen guard'lar. `Number("")===0`/`Number(null)===0` tuzakları için sayısal
 * alanlarda boş string reddedilir.
 */

const CURRENCY_WHITELIST = ["TRY", "USD", "EUR"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidRfqCurrency(c: unknown): c is (typeof CURRENCY_WHITELIST)[number] {
    return typeof c === "string" && (CURRENCY_WHITELIST as readonly string[]).includes(c);
}

/** RFQ kalemleri: product_id UUID + quantity pozitif tam sayı. Fiyat YOK (talep). */
export function validateRfqLines(raw: unknown): string | null {
    if (!Array.isArray(raw)) return "Kalem listesi geçerli değil.";
    if (raw.length === 0) return "En az 1 kalem gereklidir.";
    for (const [i, line] of raw.entries()) {
        if (!line || typeof line !== "object") return `Kalem ${i + 1}: geçersiz nesne.`;
        const l = line as Record<string, unknown>;
        if (typeof l.product_id !== "string" || !UUID_RE.test(l.product_id.trim()))
            return `Kalem ${i + 1}: ürün seçilmelidir.`;
        if (l.quantity === undefined || l.quantity === null || l.quantity === "")
            return `Kalem ${i + 1}: miktar zorunludur.`;
        const qty = Number(l.quantity);
        if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0)
            return `Kalem ${i + 1}: miktar pozitif tam sayı olmalıdır.`;
    }
    return null;
}

/** Davet edilen tedarikçi id listesi: ≥1, hepsi UUID. */
export function validateRfqVendorIds(raw: unknown): string | null {
    if (!Array.isArray(raw)) return "Tedarikçi listesi geçerli değil.";
    if (raw.length === 0) return "En az 1 tedarikçi seçilmelidir.";
    for (const [i, v] of raw.entries()) {
        if (typeof v !== "string" || !UUID_RE.test(v.trim()))
            return `Tedarikçi ${i + 1}: geçerli UUID olmalıdır.`;
    }
    return null;
}

/** Tedarikçi yanıtı fiyat hücreleri: her satır UUID; unit_price varsa ≥0 (boş=teklif yok). */
export function validateVendorPrices(raw: unknown): string | null {
    if (!Array.isArray(raw)) return "Fiyat listesi geçerli değil.";
    for (const [i, p] of raw.entries()) {
        if (!p || typeof p !== "object") return `Fiyat ${i + 1}: geçersiz nesne.`;
        const pr = p as Record<string, unknown>;
        if (typeof pr.rfq_line_id !== "string" || !UUID_RE.test(pr.rfq_line_id.trim()))
            return `Fiyat ${i + 1}: rfq_line_id geçerli UUID olmalıdır.`;
        if (pr.unit_price !== undefined && pr.unit_price !== null && pr.unit_price !== "") {
            const up = Number(pr.unit_price);
            if (!Number.isFinite(up) || up < 0) return `Fiyat ${i + 1}: birim fiyat negatif olamaz.`;
        }
        for (const k of ["lead_time_days", "moq"]) {
            if (pr[k] !== undefined && pr[k] !== null && pr[k] !== "") {
                const n = Number(pr[k]);
                if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n))
                    return `Fiyat ${i + 1}: ${k} negatif olmayan tam sayı olmalıdır.`;
            }
        }
    }
    return null;
}

/** Karar (award) girdisi: ≥1; her award {rfq_line_id, vendor_id} UUID + quantity>0 + unit_price≥0. */
export function validateRfqAwards(raw: unknown): string | null {
    if (!Array.isArray(raw)) return "Karar listesi geçerli değil.";
    if (raw.length === 0) return "En az 1 kazanan kalem seçilmelidir.";
    for (const [i, a] of raw.entries()) {
        if (!a || typeof a !== "object") return `Karar ${i + 1}: geçersiz nesne.`;
        const aw = a as Record<string, unknown>;
        for (const k of ["rfq_line_id", "vendor_id"]) {
            if (typeof aw[k] !== "string" || !UUID_RE.test((aw[k] as string).trim()))
                return `Karar ${i + 1}: ${k} geçerli UUID olmalıdır.`;
        }
        const qty = Number(aw.quantity);
        if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0)
            return `Karar ${i + 1}: miktar pozitif tam sayı olmalıdır.`;
        const price = Number(aw.unit_price);
        if (!Number.isFinite(price) || price < 0)
            return `Karar ${i + 1}: birim fiyat negatif olamaz.`;
    }
    return null;
}
