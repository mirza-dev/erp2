/**
 * Roven işaretinin RASTER üretim için tek kaynağı — **Akış Altıgeni**
 * (kullanıcı kararı 2026-09-16; docs/brand/roven-marka-rehberi.md §6).
 *
 * Geometri: yuvarlatılmış altıgen + içinden sol→sağ geçen, ortada bir kademe
 * yapan "akış kanalı". Kanal NEGATİF alandır (mask ile oyulur) — böylece işaret
 * tek renkle (`currentColor` / sabit) çalışır, ikinci renge ihtiyaç duymaz.
 *
 * `src/components/layout/RovenLogo.tsx` aynı geometriyi React'te `currentColor`
 * ile çizer; `src/app/icon.svg` favicon'da; `src/app/global-error.tsx` uygulama
 * bileşeni import edemediği için inline kopya taşır. Bu dört yer BİREBİR aynı
 * sayıları taşımak zorunda — `roven-logo.test.tsx` bunu kilitler.
 *
 * Tüketiciler: `build-pwa-icons.ts` (ikon + açılış ekranları), `build-og-image.ts`.
 */
export const MARK_VIEWBOX = 24;

/** Altıgen köşeleri — `RovenLogo.tsx` `<polygon points>` ile aynı. */
export const MARK_POINTS = "12,2.8 19.97,7.4 19.97,16.6 12,21.2 4.03,16.6 4.03,7.4";

/** Yuvarlatılmış köşe için eş renkli stroke; bileşenle aynı kalınlık. */
export const MARK_STROKE_WIDTH = 2.6;

/**
 * Akış kanalı: altıgenin dışından başlar, dışında biter (kenarları deler);
 * ortada 3.6 birimlik bir kademe. Round cap/join ile oyulur.
 */
export const MARK_CHANNEL_PATH = "M1.5 9.6 H10.2 L13.8 14.4 H22.5";
export const MARK_CHANNEL_WIDTH = 2.4;

/** Marka rehberi §4.4 — tema-muaf yüzeylerin sabitleri (koyu zemin + açık işaret). */
export const BRAND_DARK_BG = "#1a1d23";
export const BRAND_DARK_GROUND = "#131518";
export const BRAND_DARK_INK = "#e6edf3";
export const BRAND_DARK_INK_2 = "#aeb7c4";
export const BRAND_ACCENT_DARK = "#58a6ff";

/**
 * 24×24 koordinat uzayında, verilen renkle işaretin SVG gövdesi (mask dahil).
 * `maskId` aynı SVG belgesinde birden fazla işaret varsa ayrışmalı.
 */
export function markSvgInner(color: string, maskId = "roven-channel"): string {
    return (
        `<mask id="${maskId}" maskUnits="userSpaceOnUse" x="0" y="0" width="${MARK_VIEWBOX}" height="${MARK_VIEWBOX}">` +
        `<rect width="${MARK_VIEWBOX}" height="${MARK_VIEWBOX}" fill="white"/>` +
        `<path d="${MARK_CHANNEL_PATH}" fill="none" stroke="black" stroke-width="${MARK_CHANNEL_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>` +
        `</mask>` +
        `<polygon points="${MARK_POINTS}" fill="${color}" stroke="${color}" stroke-width="${MARK_STROKE_WIDTH}" stroke-linejoin="round" mask="url(#${maskId})"/>`
    );
}
