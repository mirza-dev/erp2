/**
 * Roven işaretinin RASTER üretim için tek kaynağı.
 *
 * `src/components/layout/RovenLogo.tsx` uygulamanın içinde `currentColor` ile
 * çizer; raster yüzeyler (PWA ikonları, OG görseli) sabit renk ister ve React
 * render edemez. İşaretin geometrisi burada, 24×24 viewBox'ta, raster
 * üreticilerin ortak kaynağı olarak durur — logo değişince yalnız bu dosya +
 * `RovenLogo.tsx` + `icon.svg` değişir.
 *
 * Bugün tüketici: `build-og-image.ts`. `build-pwa-icons.ts` hâlâ kendi
 * `HEX` sabitini taşıyor (2.6/21.4 + 3.8/20.2 — bileşenden ~%3 büyük) ve
 * commit'li PNG'ler o geometriyle üretildi; logo seçimi uygulanırken buraya
 * bağlanıp ikonlar bir kez yeniden üretilecek (iki ayrı binary churn yerine tek).
 *
 * Noktalar `RovenLogo.tsx`'teki polygon ile BİREBİR (2.8/21.2 düşey,
 * 4.03/19.97 yatay).
 */
export const MARK_VIEWBOX = 24;

/** Altıgen köşeleri — `RovenLogo.tsx` `<polygon points>` ile aynı. */
export const MARK_POINTS = "12,2.8 19.97,7.4 19.97,16.6 12,21.2 4.03,16.6 4.03,7.4";

/** Yuvarlatılmış köşe için eş renkli stroke; bileşenle aynı kalınlık. */
export const MARK_STROKE_WIDTH = 2.6;

/** Marka rehberi §4.4 — tema-muaf yüzeylerin sabitleri (koyu zemin + açık işaret). */
export const BRAND_DARK_BG = "#1a1d23";
export const BRAND_DARK_GROUND = "#131518";
export const BRAND_DARK_INK = "#e6edf3";
export const BRAND_DARK_INK_2 = "#aeb7c4";
export const BRAND_ACCENT_DARK = "#58a6ff";

/** 24×24 koordinat uzayında, verilen renkle işaretin SVG gövdesi. */
export function markSvgInner(color: string): string {
    return `<polygon points="${MARK_POINTS}" fill="${color}" stroke="${color}" stroke-width="${MARK_STROKE_WIDTH}" stroke-linejoin="round"/>`;
}
