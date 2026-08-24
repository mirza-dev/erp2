/**
 * Satır bazlı stok yeterlilik durumu — teklif ve sipariş formlarının ORTAK dili.
 *
 * A1 (2026-08-24): OrderForm satır satır "Stok yetersiz — N verilebilir" uyarısı
 * gösteriyordu ama QuoteForm'da HİÇ stok farkındalığı yoktu. Uyarı huninin
 * yanlış ucundaydı: satışçı 3 adetlik valften 100 adet teklif edip müşteriye söz
 * veriyor, uyarı ancak teklif kabul edilip siparişe dönüşürken çıkıyordu.
 *
 * `promisable` (= on_hand − reserved − quoted) NEGATİF olabilir; bu bozuk veri
 * değil, "verdiğimiz sözler eldekini aştı" sinyalidir. Rezervasyon RPC'si
 * (mig.008 `least(available, shortage)`) asla aşırı rezerve etmez.
 *
 * Saf tutulur (React/DB import etmez) → birim testi kolay, iki form da aynı
 * kuralı paylaşır.
 */

export type StockLevel = "insufficient" | "low" | "ok";

/** Uyarı için gereken minimum ürün alanları. */
export interface StockCheckProduct {
    on_hand: number;
    quoted: number;
    promisable: number;
    minStockLevel: number;
    unit: string;
}

export interface StockHint {
    level: StockLevel;
    /** Kullanıcıya gösterilecek tek satırlık metin. */
    text: string;
    /** Verilebilir miktar (negatif olabilir — aşırı taahhüt). */
    promisable: number;
}

/**
 * Satır miktarını ürünün verilebilir stoğuyla karşılaştırır.
 *
 * `quantity` 0/boşsa da hesaplanır: kullanıcı ürünü seçer seçmez eldeki durumu
 * görmeli, miktar girmesini beklememeli.
 *
 * OrderForm'daki mevcut metin BİREBİR korunur — iki form aynı cümleyi kurar.
 */
export function stockHintForLine(
    product: StockCheckProduct | null | undefined,
    quantity: number,
): StockHint | null {
    if (!product) return null;
    const { promisable, on_hand, quoted, unit, minStockLevel } = product;

    const insufficient = quantity > promisable;
    if (insufficient) {
        return {
            level: "insufficient",
            promisable,
            text: `Stok yetersiz — ${promisable} ${unit} verilebilir (Stokta ${on_hand}, Tekliflerde ${quoted})`,
        };
    }
    const low = promisable <= minStockLevel;
    return {
        level: low ? "low" : "ok",
        promisable,
        text: `Stokta: ${on_hand} | Tekliflerde: ${quoted} | Verilebilir: ${promisable} ${unit}${low ? " — Düşük" : ""}`,
    };
}

/** Uyarı seviyesine karşılık gelen tema rengi (CSS değişkeni). */
export function stockHintColor(level: StockLevel): string {
    if (level === "insufficient") return "var(--danger-text)";
    if (level === "low") return "var(--warning-text)";
    return "var(--text-tertiary)";
}
