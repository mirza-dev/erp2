"use client";

import { useEffect, useState } from "react";
import { isBrowserOffline } from "@/lib/network-status";

/**
 * Tarayıcının çevrimdışı olup olmadığını izler (madde #10).
 *
 * SSR-güvenli: sunucuda ve ilk render'da `false` döner (hydration uyuşmazlığı
 * olmasın), gerçek değer mount'tan sonra okunur. Çevrimdışı bir yükleme zaten
 * SW'nin `/offline` sayfasına düşer; bu hook oturum SIRASINDA kopan bağlantı
 * içindir.
 */
export function useOnlineStatus(): { offline: boolean } {
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        const sync = () => setOffline(isBrowserOffline());
        sync();
        window.addEventListener("online", sync);
        window.addEventListener("offline", sync);
        return () => {
            window.removeEventListener("online", sync);
            window.removeEventListener("offline", sync);
        };
    }, []);

    return { offline };
}
