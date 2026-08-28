"use client";

import { useEffect, useState } from "react";

/**
 * Dar ekran (mobil/tablet dikey) tespiti.
 *
 * 2026-08-24: aynı `windowWidth` + resize dinleyicisi + `< 768` eşiği
 * `products/page.tsx`, `alerts/page.tsx` ve `orders/OrderForm.tsx`'te BİREBİR
 * kopyalanmıştı. Üretim Girişi'ni sahada telefondan kullanılabilir yaparken
 * dördüncü kopyayı yazmak yerine tek yere alındı.
 *
 * SSR-güvenli: sunucuda `window` yok → varsayılan masaüstü genişliği kullanılır
 * (kopyalanan hâlin davranışı birebir korunur; hydration'dan sonra gerçek
 * genişlikle güncellenir).
 */
export const MOBILE_BREAKPOINT = 768;

/** Sunucuda ve ilk render'da varsayılan genişlik — masaüstü kabul edilir. */
const SSR_FALLBACK_WIDTH = 1200;

export function useWindowWidth(): number {
    const [width, setWidth] = useState<number>(
        typeof window !== "undefined" ? window.innerWidth : SSR_FALLBACK_WIDTH,
    );

    useEffect(() => {
        function handleResize() { setWidth(window.innerWidth); }
        // Mount anında bir kez daha oku: SSR fallback ile gerçek genişlik
        // farklıysa (hydration) ilk paint'ten hemen sonra düzelir.
        handleResize();
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    return width;
}

export function useIsMobile(breakpoint: number = MOBILE_BREAKPOINT): boolean {
    return useWindowWidth() < breakpoint;
}
