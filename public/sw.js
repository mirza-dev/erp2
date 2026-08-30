/**
 * Roven service worker — KASTEN APTAL.
 *
 * Bir ERP bayat veri servis edemez: önbellekten dönen eski bir sipariş listesi
 * ya da eski bir stok bakiyesi, olmayan bir hatadan daha kötüdür — yanlış veri
 * "çalışıyor" gibi görünür. Bu yüzden önbelleğe YALNIZCA `/_next/static/`
 * altındaki hash'li (dolayısıyla değişmez) dosyalar ve çevrimdışı yedek sayfa
 * girer. API yanıtları ve sayfa gezinmeleri ASLA önbelleğe yazılmaz.
 *
 * ── KILL SWITCH ────────────────────────────────────────────────────────────
 * Bir service worker, bir web uygulamasını kalıcı olarak bayat HTML'e
 * kilitleyebilecek tek bileşendir. Bir şey ters giderse:
 *   1) `/sw.js` rotasını 404 döndürün (dosyayı silin ve deploy edin)
 *   2) Kullanıcılara: DevTools → Application → Service Workers → Unregister,
 *      ya da tarayıcı ayarlarından site verisini temizlemek
 * `activate` kolu kendi sürümü dışındaki tüm cache'leri sildiği için yeni bir
 * CACHE sürümü yayınlamak da eski önbelleği temizler.
 */
const CACHE = "roven-static-v3";
const STATIC_PREFIX = "/_next/static/";
const OFFLINE_URL = "/offline";

/**
 * Önbellek tavanı. Her deploy yeni hash'li chunk üretir ve eskiler bir daha
 * istenmez; tavan olmazsa önbellek aylar içinde sınırsız büyür. Hash'li
 * dosyalar değişmez olduğu için hangisinin atıldığı önemli değil — FIFO yeter.
 */
const MAX_ENTRIES = 200;

self.addEventListener("install", (event) => {
    // skipWaiting() BİLEREK YOK: yeni sürüm "waiting" durumunda beklesin ki
    // ServiceWorkerUpdatePrompt kullanıcıya sorabilsin. Anında aktive etseydik
    // sorulacak bir an olmazdı. Kullanıcı onaylayınca SKIP_WAITING mesajı gelir.
    event.waitUntil(
        (async () => {
            const cache = await caches.open(CACHE);
            const res = await fetch(OFFLINE_URL, { cache: "reload" });
            // `cache.add` YETMEZ — yönlendirilmiş yanıtı da yazar. Yönlendirilmiş bir
            // yanıt ise bir GEZİNME isteğini karşılayamaz (SW spec); respondWith
            // TypeError atar ve kullanıcı yedek sayfa yerine tarayıcının ağ hatası
            // ekranını görür. 2026-08-31'de tam olarak bu oldu: /offline auth kapısının
            // arkasındaydı, önbelleğe giriş sayfası yazıldı, yedek hiç çalışmadı.
            // (v3: v2 önbelleğindeki zehirli /offline girdisi activate'te düşsün.)
            if (res.ok && !res.redirected) await cache.put(OFFLINE_URL, res);
        })().catch(() => {
            /* çevrimdışı yedek yazılamadıysa kurulum yine de sürsün */
        }),
    );
});

self.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
    event.waitUntil(
        (async () => {
            const names = await caches.keys();
            await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
            await self.clients.claim();
        })(),
    );
});

/** Tavanı aşarsa en eski girdileri atar (Cache API insert sırasını korur). */
async function trim(cache) {
    const keys = await cache.keys();
    if (keys.length <= MAX_ENTRIES) return;
    for (const key of keys.slice(0, keys.length - MAX_ENTRIES)) await cache.delete(key);
}

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // API ASLA önbelleğe alınmaz — bayat sipariş/stok yasak.
    if (url.pathname.startsWith("/api/")) return;

    // Gezinmeler de önbelleğe ALINMAZ. Ağa gider; ağ ölürse önceden yazılmış
    // sabit çevrimdışı sayfa döner. Bu bir yanıt önbelleklemesi DEĞİL, yakalama.
    if (req.mode === "navigate") {
        event.respondWith(
            fetch(req).catch(async () => {
                const fallback = await caches.match(OFFLINE_URL);
                return fallback ?? Response.error();
            }),
        );
        return;
    }

    // Yalnız hash'li, değişmez statik varlıklar.
    if (!url.pathname.startsWith(STATIC_PREFIX)) return;

    event.respondWith(
        (async () => {
            const hit = await caches.match(req);
            if (hit) return hit;
            const res = await fetch(req);
            if (res.ok) {
                const cache = await caches.open(CACHE);
                await cache.put(req, res.clone());
                void trim(cache);
            }
            return res;
        })(),
    );
});
