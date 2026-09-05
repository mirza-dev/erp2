"use client";

import { useCallback, useEffect, useRef, type RefObject } from "react";

/**
 * Diyalog davranışının TEK kaynağı: açılışta odak · Escape · Tab tuzağı ·
 * kapanışta odak dönüşü.
 *
 * 2026-08-30'da bu mantık `Modal`'a yazıldı ve 9 diyalog oraya taşındı; yan
 * çekmeceler o turda "Modal yanlış yüzey" gerekçesiyle kapsam dışı bırakıldı.
 * Gerekçe doğruydu — merkezî bir kutu ile sağa yaslı tam-boy bir panel aynı
 * yerleşim değil — ama DAVRANIŞ ikisinde de aynı. Sonuç 2026-09-05 ölçümünde
 * görüldü: yedi çekmecenin dördünde Escape, altısında odak tuzağı, altısında
 * odak dönüşü yoktu; `AIDetailDrawer` ise mantığın eksik bir KOPYASINI kendi
 * içinde taşıyordu.
 *
 * Bu yüzden davranış bileşenden çıkarıldı: `Modal` ve `Drawer` aynı çekirdeği
 * sürüyor, yerleşimlerinde ayrışıyorlar. Kopyalanmış kuralın tehlikesi
 * ayrışmadır — parola politikasının dört kopyaya dağılıp dördünün de
 * `length >= 8`de kalması bu depoda zaten yaşandı.
 */

/** Focus tuzağının tarayacağı odaklanabilir öğeler. */
export const FOCUSABLE = [
    "a[href]", "button:not([disabled])", "input:not([disabled])",
    "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
].join(",");

export interface DialogA11yOptions {
    onClose: () => void;
    /**
     * false → Escape ve backdrop tıklaması kapatmaz. Yıkıcı bir işlem
     * sürerken kullanıcı yanlışlıkla kaçamasın diye (ResetDemoSection).
     */
    dismissible: boolean;
}

export function useDialogA11y(
    dialogRef: RefObject<HTMLElement | null>,
    { onClose, dismissible }: DialogA11yOptions,
): { requestClose: () => void } {
    // Prop yerine ref: dismissible değişince effect'i yeniden kurmayalım,
    // yoksa kapanış sırasında odak dönüşü tetiklenirdi.
    const dismissibleRef = useRef(dismissible);
    dismissibleRef.current = dismissible;

    const requestClose = useCallback(() => {
        if (dismissibleRef.current) onClose();
    }, [onClose]);

    useEffect(() => {
        const previouslyFocused = document.activeElement as HTMLElement | null;

        // Açılışta ilk odaklanabilir öğeye geç (yoksa dialog'un kendisine).
        const node = dialogRef.current;
        const first = node?.querySelector<HTMLElement>(FOCUSABLE);
        (first ?? node)?.focus();

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                if (dismissibleRef.current) onClose();
                return;
            }
            if (event.key !== "Tab" || !dialogRef.current) return;

            // Focus tuzağı — odak dialog dışına kaçmasın.
            // Görünürlük süzgeci (`offsetParent`) BİLİNÇLİ olarak yok: layout'a
            // bağlı, `position: fixed` ve test ortamlarında yanıltıyor — süzgeç
            // tuzağı komple devre dışı bırakabiliyordu. Gizli-ama-odaklanabilir
            // öğenin bedeli fazladan bir durak; tuzağın kırılmasının bedeli
            // odağın arkadaki sayfaya kaçması.
            const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (items.length === 0) {
                event.preventDefault();
                return;
            }
            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            const active = document.activeElement;
            if (event.shiftKey && (active === firstItem || !dialogRef.current.contains(active))) {
                event.preventDefault();
                lastItem.focus();
            } else if (!event.shiftKey && active === lastItem) {
                event.preventDefault();
                firstItem.focus();
            }
        };

        window.addEventListener("keydown", onKeyDown);
        return () => {
            window.removeEventListener("keydown", onKeyDown);
            previouslyFocused?.focus?.();
        };
    }, [onClose, dialogRef]);

    return { requestClose };
}

/**
 * Backdrop — `Modal` ve `Drawer` aynı zemini kullanır.
 *
 * `aria-hidden` + yalnız tıklama: buraya `role="button"` + tabIndex koymak daha
 * kötü olurdu — dialog'un tab sırasına anlamsız bir durak ve ekran okuyucuya
 * anlamsız bir buton eklerdi. Klavye yolu Escape.
 */
export const DIALOG_BACKDROP: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.54)",
    backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)", animation: "fade-in 0.18s ease-out",
};
