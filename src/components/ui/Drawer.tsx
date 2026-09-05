"use client";

import { useRef, type ReactNode } from "react";
import { DIALOG_BACKDROP, useDialogA11y } from "@/components/ui/dialog-a11y";

/**
 * Ortak YAN ÇEKMECE çerçevesi — sağa yaslı, tam boy. `Modal`'ın kardeşi:
 * davranış ikisinde de `dialog-a11y.ts`ten gelir, yalnız yerleşim ayrışır.
 *
 * 2026-08-30 Modal turu çekmeceleri "Modal yanlış yüzey" diye kapsam dışı
 * bırakmıştı; gerekçe doğruydu ama boşluk kapatılmadı ve 2026-09-05 ölçümü
 * bedeli gösterdi — YEDİ çekmece, dört z-index katmanı, üç dikey teknik,
 * iki yüzey token'ı, yedi ayrı erişilebilirlik seviyesi.
 *
 * Üç karar ölçüme dayanıyor:
 *
 * 1. **`height` HİÇ yazılmaz** — dikey uzanım `top: 0` + `bottom: 0` ile
 *    kurulur. Üç çekmece zaten böyleydi, üçü `height: 100vh` kullanıyordu ve
 *    biri `100dvh`. `100vh` iOS Safari'de görüntü alanından BÜYÜKTÜR (tarayıcı
 *    çubuğu hesaba katılmaz): panelin dibi çubuğun altında kalır ve oraya
 *    kaydırılamaz. `bottom: 0` bu tartışmayı komple ortadan kaldırır —
 *    `100dvh`ten de iyi, çünkü birim seçimi kalmaz.
 * 2. **Katman 200/201** — `Modal` ile birebir. Eski hâlde iki çekmece 50'deydi,
 *    yani kabuğun kendi mobil menüsünün (z=99/100) ALTINDA kalıyorlardı;
 *    biri 80/81'deydi.
 * 3. **Yüzey `--surface-raised` + `--surface-border`** — `Card`'ın kanonik
 *    ikilisi. Ölçüldü: `--bg-primary` ile `--surface-raised` bugün iki temada
 *    da BİREBİR aynı (`#1a1d23` / `#ffffff`), yani dört çekmecenin yüzey
 *    değişimi sıfır piksel. Ayrışma görünmezdi ama token'lardan biri
 *    ayarlandığı an ortaya çıkardı.
 */

export interface DrawerProps {
    onClose: () => void;
    /** Erişilebilir ad. `labelledBy` verilmediyse zorunlu. */
    ariaLabel?: string;
    /**
     * Başlık elemanının id'si. Verilirse `aria-labelledby` basılır ve
     * `ariaLabel`'ı yener — görünen başlık, uydurma bir etiketten iyidir.
     */
    labelledBy?: string;
    /** Örn. "min(520px, 100vw)". */
    width?: string;
    /**
     * false → Escape ve backdrop tıklaması kapatmaz. Yıkıcı ya da yarım kalmış
     * bir işlem sürerken kullanıcı yanlışlıkla kaçamasın diye.
     */
    dismissible?: boolean;
    /**
     * false → çerçeve kendi iç boşluğunu ve `gap`'ini UYGULAMAZ.
     *
     * Çekmecelerin ÇOĞU bu durumda: kendi başlık şeridi (ayırıcı çizgisiyle,
     * `flexShrink: 0`) ve kendi kaydırılan gövdesi var. `Modal`'ın aynı
     * kapısından bir farkla — orada `padded={false}` `display: block`a
     * düşüyor, burada **flex sütun korunur**: çekmecenin dikey iskeleti
     * (sabit başlık + esneyen gövde) ona bağlı.
     */
    padded?: boolean;
    /**
     * Çerçevenin yüzey stilini (arka plan, kenarlık, gölge, taşma…) EZER.
     * Konumlandırma, z-index ve erişilebilirlik çerçevede kalır.
     */
    surfaceStyle?: React.CSSProperties;
    children: ReactNode;
}

export default function Drawer({
    onClose,
    ariaLabel,
    labelledBy,
    width = "min(480px, 100vw)",
    dismissible = true,
    padded = true,
    surfaceStyle,
    children,
}: DrawerProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const { requestClose } = useDialogA11y(dialogRef, { onClose, dismissible });

    return (
        <>
            {/* Backdrop `Modal` ile ortak — gerekçesi `dialog-a11y.ts`te. */}
            <div onClick={requestClose} aria-hidden="true" style={DIALOG_BACKDROP} />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                {...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": ariaLabel })}
                tabIndex={-1}
                style={{ ...panelStyle, width, ...(padded ? PADDED : null), ...surfaceStyle }}
            >
                {children}
            </div>
        </>
    );
}

const panelStyle: React.CSSProperties = {
    // `height` YOK — bkz. bileşen başlığındaki 1. karar.
    position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201,
    maxWidth: "100vw",
    background: "var(--surface-raised)",
    borderLeft: "var(--line-width) solid var(--surface-border)",
    // Yönlü gölge: panel sağdan geliyor, ışığı sola düşürür. `--surface-shadow`
    // kart gölgesidir (aşağı yönlü) ve burada yanlış olurdu. `Modal` da kendi
    // diyalog gölgesini böyle yazıyor.
    boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
    display: "flex", flexDirection: "column",
    // Kayma animasyonu ortak: CLAUDE.md "animasyon sadece gerekli yerde" diyor
    // ve kenara yaslı bir panelin nereden geldiğini göstermesi tam o durum —
    // `Modal`'ın backdrop `fade-in`'iyle aynı gerekçe. İki çekmecede (müşteri /
    // tedarikçi detayı) zaten vardı, beşinde yoktu. `prefers-reduced-motion`
    // globals.css:649'daki genel kuralla zaten susturuluyor.
    animation: "slide-in-right 0.2s ease-out",
};

/** Kendi iç düzeni olmayan çekmeceler için varsayılan boşluk + kaydırma. */
const PADDED: React.CSSProperties = { padding: "18px", gap: "12px", overflowY: "auto" };
