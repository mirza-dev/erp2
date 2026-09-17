import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/marketing/site";

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
        { url: `${SITE_URL}/gizlilik`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ];
}
