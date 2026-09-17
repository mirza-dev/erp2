import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/marketing/site";
import { ARTICLES } from "@/lib/marketing/articles";

/**
 * Site haritası — YALNIZ herkese açık sayfalar.
 *
 * Bugün iki sayfa var (açılış + gizlilik). Kısa olması kusur değil: site
 * haritası bir vitrin değil, tarayıcıya "indekslenecek olan bunlar" demenin
 * yolu. İçerik sayfaları eklendikçe buraya girer.
 *
 * `/login`, `/sifre-yenile`, `/offline` ve `/dashboard/**` bilerek DIŞARIDA —
 * ya oturum kapısının arkasındalar ya da arama sonucunda görünmeleri markaya
 * zarar verir (bkz. `robots.ts`).
 */
export default function sitemap(): MetadataRoute.Sitemap {
    const now = new Date();
    return [
        { url: `${SITE_URL}/`, lastModified: now, changeFrequency: "monthly", priority: 1 },
        { url: `${SITE_URL}/rehber`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
        // Yazının kendi `updated` alanı kullanılır — build tarihi DEĞİL. Aksi hâlde
        // her deploy tüm yazıları "güncellendi" diye bildirir ve tarayıcı sinyali
        // değersizleşir.
        ...ARTICLES.map((a) => ({
            url: `${SITE_URL}/rehber/${a.slug}`,
            lastModified: new Date(a.updated),
            changeFrequency: "yearly" as const,
            priority: 0.6,
        })),
        { url: `${SITE_URL}/gizlilik`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ];
}
