"use client";

import { useEffect } from "react";

/**
 * `/sw.js`'i YALNIZ ÜRETİMDE kaydeder; development'ta aktif olarak SÖKER.
 *
 * Guard koymak yetmezdi: service worker kaydı kalıcıdır. Bir kez development'ta
 * koşmuş bir geliştiricinin tarayıcısında SW kayıtlı kalır ve `/_next/static/`
 * chunk'larını cache-first servis etmeye devam eder — yani kod değiştiği halde
 * eski JS çalışır. Bu yüzden dev'de sessizce atlamak değil, temizlemek gerekiyor.
 *
 * Güncelleme bildirimi burada DEĞİL: `ToastProvider` kök layout'ta değil
 * (`src/app/dashboard/layout.tsx`), bu yüzden `useToast()` buradan çağrılamaz.
 * O iş `ServiceWorkerUpdatePrompt`'ta.
 */
export function ServiceWorkerRegister() {
    useEffect(() => {
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

        if (process.env.NODE_ENV !== "production") {
            void (async () => {
                const regs = await navigator.serviceWorker.getRegistrations();
                await Promise.all(regs.map((r) => r.unregister()));
                if (typeof caches !== "undefined") {
                    const names = await caches.keys();
                    await Promise.all(
                        names.filter((n) => n.startsWith("roven-")).map((n) => caches.delete(n)),
                    );
                }
            })().catch(() => {
                /* temizlik başarısızsa dev akışı yine sürsün */
            });
            return;
        }

        void navigator.serviceWorker.register("/sw.js").catch(() => {
            /* kurulabilirlik kaybı kabul edilir; uygulama etkilenmez */
        });
    }, []);

    return null;
}
