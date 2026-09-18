/**
 * Belge vurgu rengi — dışarı giden belgelerin (teklif, satın alma siparişi, fiyat
 * talebi; HTML + baskı + PDF) başlık bandı, tablo başlığı ve bölüm başlıklarının
 * rengi. Kaynak: `company_settings.document_accent_color` (mig.112), Ayarlar ›
 * Firma › Belge Rengi.
 *
 * 2026-09-18'e kadar bu renk 8 dosyada sabit `#0072BC` idi (PMT'nin kurumsal
 * mavisi): teslim modeli müşteri başına ayrı kurulum olduğu için ikinci bir
 * müşterinin teklifleri de PMT mavisiyle çıkacaktı. Varsayılan bilerek AYNI renk:
 * migration uygulanınca PMT'nin belgelerinde tek piksel değişmez.
 *
 * Saf modül (istemci + sunucu). Renk `<style>` metnine ve react-pdf stiline
 * gömülür → dışarıdan gelen her değer `resolveDocumentAccent`ten geçer; yalnız
 * `#RRGGBB` geçer, gerisi varsayılana düşer (CSS/HTML enjeksiyonu kapısı).
 */

export const DEFAULT_DOCUMENT_ACCENT = "#0072BC";

/**
 * Beyaz yazının vurgu zemininde asgari kontrastı. Belgede başlık bandı, tablo
 * başlığı ve genel toplam hücresi vurgu rengi üstüne BEYAZ yazı basar; açık bir
 * renk (sarı, pastel) seçilirse o yazılar okunmaz. 3:1 = WCAG'nin büyük/kalın
 * metin eşiği: doygun kurumsal renklerin çoğu (kırmızı, lacivert, koyu yeşil)
 * geçer, yalnız gerçekten okunmaz açık tonlar reddedilir. Varsayılan ≈ 5,1:1.
 */
export const MIN_ACCENT_CONTRAST = 3;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function isHexColor(value: unknown): value is string {
    return typeof value === "string" && HEX_RE.test(value);
}

/** Geçerli `#RRGGBB` → büyük harfli aynı renk; geçersiz/eksik → varsayılan. */
export function resolveDocumentAccent(value: unknown): string {
    return isHexColor(value) ? value.toUpperCase() : DEFAULT_DOCUMENT_ACCENT;
}

function channels(hex: string): [number, number, number] {
    const h = resolveDocumentAccent(hex).slice(1);
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** `rgba(r,g,b,a)` — boşluksuz biçim, 2026-09-18 öncesi sabit dizelerle birebir. */
export function accentRgba(hex: string, alpha: number): string {
    const [r, g, b] = channels(hex);
    return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Rengin beyaz üstünde `alpha` oranında karışmış DÜZ hex'i. react-pdf ve e-posta
 * istemcileri yarı saydamlığı güvenilir işlemez; varsayılan renkte 0.2 →
 * `#cce3f2` (PDF'teki eski sabit) çıkar.
 */
export function accentTint(hex: string, alpha: number): string {
    const mix = (c: number) => Math.round(c * alpha + 255 * (1 - alpha)).toString(16).padStart(2, "0");
    const [r, g, b] = channels(hex);
    return `#${mix(r)}${mix(g)}${mix(b)}`;
}

function luminance(hex: string): number {
    const lin = (c: number) => {
        const s = c / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const [r, g, b] = channels(hex);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Beyaz yazı ile bu zemin arasındaki WCAG kontrast oranı (1–21). */
export function contrastWithWhite(hex: string): number {
    return 1.05 / (luminance(hex) + 0.05);
}

/**
 * API + form doğrulaması (ikisi aynı kuralı okur). Hata metni döner; geçerliyse null.
 * Biçim hatası ile okunabilirlik hatası ayrı mesaj: kullanıcı neyi düzelteceğini bilsin.
 */
export function validateDocumentAccent(value: unknown): string | null {
    if (!isHexColor(value)) {
        return "Belge rengi #RRGGBB biçiminde olmalı (ör. #0072BC).";
    }
    if (contrastWithWhite(value) < MIN_ACCENT_CONTRAST) {
        return "Bu renk çok açık: belge başlıklarındaki beyaz yazı okunmaz. Daha koyu bir ton seçin.";
    }
    return null;
}
