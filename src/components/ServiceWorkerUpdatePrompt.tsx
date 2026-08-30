"use client";

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";

/**
 * Yeni bir sürüm deploy edildiğinde kullanıcıya "yenile" der.
 *
 * `public/sw.js` `install`'da bilerek `skipWaiting()` ÇAĞIRMIYOR — yeni worker
 * "waiting" durumunda bekler. Böylece sorulacak bir an oluşur: kullanıcı
 * onaylayınca `SKIP_WAITING` mesajı gider, worker aktive olur, `controllerchange`
 * tetiklenir ve sayfa yenilenir. Kullanıcı yok sayarsa eski worker'da kalır —
 * o worker yalnız statik varlık önbelleklediği için **içerik yine tazedir**;
 * bir sonraki tam sayfa yüklemesinde kendiliğinden geçer.
 *
 * Kök layout'ta değil dashboard layout'ta mount edilir: `ToastProvider` orada.
 */
export function ServiceWorkerUpdatePrompt() {
    const { toast } = useToast();

    useEffect(() => {
        if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
        if (process.env.NODE_ENV !== "production") return;

        let reloading = false;
        const onControllerChange = () => {
            // Yalnız BİZİM tetiklediğimiz aktivasyonda yenile — ilk kurulumda
            // controller değişimi de olur ve orada yenilemek gereksiz sıçrama olurdu.
            if (!reloading) return;
            window.location.reload();
        };
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

        const offer = (waiting: ServiceWorker) => {
            toast({
                type: "info",
                message: "Yeni sürüm hazır.",
                // duration: 0 → kalıcı. 3 saniyede kaybolan bir güncelleme istemi
                // sorulmamış sayılır; kullanıcı kendi zamanında karar vermeli.
                duration: 0,
                action: {
                    label: "Yenile",
                    onClick: () => {
                        reloading = true;
                        waiting.postMessage({ type: "SKIP_WAITING" });
                    },
                },
            });
        };

        void navigator.serviceWorker.ready.then((reg) => {
            if (reg.waiting) offer(reg.waiting);
            reg.addEventListener("updatefound", () => {
                const installing = reg.installing;
                if (!installing) return;
                installing.addEventListener("statechange", () => {
                    // "installed" + mevcut bir controller varsa: bu bir GÜNCELLEME
                    // (ilk kurulumda controller yoktur, orada sorulacak bir şey yok).
                    if (installing.state === "installed" && navigator.serviceWorker.controller) {
                        offer(installing);
                    }
                });
            });
        });

        return () => {
            navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
        };
    }, [toast]);

    return null;
}
