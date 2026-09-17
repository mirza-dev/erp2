/**
 * Pazarlama yüzeylerinin ortak site bilgisi.
 *
 * `SITE_URL` tek kaynak: `layout.tsx` metadataBase, robots, sitemap ve
 * yapılandırılmış veri aynı adresi kullanmak ZORUNDA — ayrışırsa Google iki
 * ayrı site görür, kanonik adres belirsizleşir ve sıralama bölünür.
 *
 * Yedek adres (`erp.getmedspace.com`) marka rehberi §9 gereği domain canlıya
 * alınana kadar BİLEREK değişmez; `NEXT_PUBLIC_APP_URL` set edilince
 * kendiliğinden `https://rovenerp.com` olur.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://erp.getmedspace.com").replace(/\/+$/, "");

/** Marka adı — yapılandırılmış veri ve OG'de aynı yazım. */
export const SITE_NAME = "Roven";
