"use client";

import { useEffect } from "react";

/**
 * `/sw.js`'i kaydeder — PWA "ana ekrana ekle" akışı bir service worker ister.
 *
 * Service worker'ın kendisi kasten aptal: yalnız `/_next/static/` önbelleğe
 * alınır, API ve navigasyonlar ağa gider (bkz. `public/sw.js`). Kayıt hatası
 * sessizce yutulur — PWA kurulabilirliği bir kolaylık, uygulamanın çalışması
 * buna bağlı değil.
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
        void navigator.serviceWorker.register("/sw.js").catch(() => {
            /* kurulabilirlik kaybı kabul edilir; uygulama etkilenmez */
        });
    }, []);

    return null;
}
