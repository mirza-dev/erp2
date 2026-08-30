/**
 * Roven service worker — KASTEN APTAL.
 *
 * Bir ERP bayat veri servis edemez: önbellekten dönen eski bir sipariş listesi
 * ya da eski bir stok bakiyesi, olmayan bir hatadan daha kötüdür. Bu yüzden bu
 * service worker YALNIZCA `/_next/static/` altındaki hash'li (dolayısıyla
 * değişmez) dosyaları önbelleğe alır. API yanıtları, navigasyonlar ve diğer her
 * şey doğrudan ağa gider — hiç dokunulmaz.
 *
 * Varlık sebebi işlevsel değil, kurulabilirlik: tarayıcının "ana ekrana ekle"
 * akışı bir fetch dinleyicisi ister.
 *
 * ── KILL SWITCH ────────────────────────────────────────────────────────────
 * Bir service worker, bir web uygulamasını kalıcı olarak bayat HTML'e
 * kilitleyebilecek tek bileşendir. Bir şey ters giderse:
 *   1) `/sw.js` rotasını 404 döndürün (dosyayı silin ve deploy edin)
 *   2) Kullanıcılara: DevTools → Application → Service Workers → Unregister,
 *      ya da tarayıcı ayarlarından site verisini temizlemek
 * Aşağıdaki `activate` kolu kendi sürümü dışındaki tüm cache'leri sildiği için
 * yeni bir CACHE sürümü yayınlamak da eski önbelleği temizler.
 */
const CACHE = "roven-static-v1";
const STATIC_PREFIX = "/_next/static/";

self.addEventListener("install", () => {
    // Yeni sürüm beklemeye geçmesin — kullanıcı eski build'e kilitlenmemeli.
    self.skipWaiting();
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

self.addEventListener("fetch", (event) => {
    const req = event.request;
    if (req.method !== "GET") return;

    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    // API ve navigasyonlar ASLA önbelleğe alınmaz — bayat sipariş/stok yasak.
    if (url.pathname.startsWith("/api/")) return;
    if (req.mode === "navigate") return;

    // Yalnız hash'li, değişmez statik varlıklar.
    if (!url.pathname.startsWith(STATIC_PREFIX)) return;

    event.respondWith(
        (async () => {
            const hit = await caches.match(req);
            if (hit) return hit;
            const res = await fetch(req);
            if (res.ok) {
                const cache = await caches.open(CACHE);
                cache.put(req, res.clone());
            }
            return res;
        })(),
    );
});
