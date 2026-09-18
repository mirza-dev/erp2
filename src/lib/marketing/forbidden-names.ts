/**
 * Pazarlama yüzeylerinde (landing metni, `public/shots/` ürün görselleri)
 * ASLA görünmemesi gereken gerçek firma adları.
 *
 * Kaynak: `src/lib/seed/seed-data.ts` gerçek firma adları taşıyor (Tüpraş,
 * Abdi İbrahim, Enerjisa…). O adların göründüğü bir vitrin, o firmaların
 * Roven müşterisi olduğu iddiası demektir. Liste burada ikinci kez yazılıyor,
 * bilerek: seed değişse bile bu bir DENETİM kaydıdır — "şu adlar bir kez
 * veritabanındaydı" bilgisini taşır.
 *
 * İki tüketici: `scripts/build-product-shots.ts` (çekim öncesi veritabanını
 * tarar, bulursa DURUR) ve `marketing-landing.test.ts` (sayfa metnine ve
 * görsel dosya adlarına karşı kilit). Ayrı modül çünkü script yüklenince
 * `main()`i koşturur — testten import edilemez.
 *
 * "PMT": pilot işletme. Vaka bloğu yalnız yazılı izinle isimli sürüme geçer
 * (landing-content.ts `proof.named`); o güne kadar ad vitrinde geçmez.
 */
export const FORBIDDEN_REAL_NAMES = [
    "Tüpraş",
    "Abdi İbrahim",
    "Enerjisa",
    "Ülker",
    "Star Rafineri",
    "Botaş",
    "Langge",
    "Bulonsan",
    "PMT",
    "pmtendustriyel",
    // ASCII yazımlar — e-posta ve alan adlarında diakritik düşer
    // (`malzeme@botas.example.com` ilk denetimden geçip görsele düşmüştü).
    "botas",
    "tupras",
    "ulker",
    "abdibrahim",
    "starrafineri",
] as const;

/** Yasak listesiyle karşılaştırma: büyük/küçük harften bağımsız. */
export function containsForbiddenName(text: string): boolean {
    const low = text.toLocaleLowerCase("tr-TR");
    return FORBIDDEN_REAL_NAMES.some((bad) => low.includes(bad.toLocaleLowerCase("tr-TR")));
}
