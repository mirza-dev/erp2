import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/marketing/site";

/**
 * Arama motoru kuralları.
 *
 * `/dashboard` ve `/api` zaten oturum kapısının arkasında (crawler `/login`e
 * düşer) — yine de AÇIKÇA yasaklanıyor: yönlendirilen bir yol Google'da
 * "Giriş · Roven" başlıklı yüzlerce kopya sayfa olarak görünebiliyor ve
 * markanın arama sonucunu kirletiyor. Yasak, tarayıcıyı hiç oraya sokmuyor.
 *
 * `/offline` de dışarıda: service worker'ın yedek sayfası, aranacak içerik değil.
 */
export default function robots(): MetadataRoute.Robots {
    return {
        rules: {
            userAgent: "*",
            allow: "/",
            disallow: ["/dashboard", "/api", "/login", "/auth", "/sifre-yenile", "/offline"],
        },
        sitemap: `${SITE_URL}/sitemap.xml`,
        host: SITE_URL,
    };
}
