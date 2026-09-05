"use client";

import { useRef, type ReactNode } from "react";
import Button from "@/components/ui/Button";
import { DIALOG_BACKDROP, useDialogA11y } from "@/components/ui/dialog-a11y";

/**
 * Ortak modal çerçevesi — MERKEZÎ kutu. Sağa yaslı tam-boy panel için kardeşi
 * `Drawer`; ikisi de davranışını `dialog-a11y.ts`ten alır.
 *
 * 2026-08-29: repoda **20 elle yazılmış `role="dialog"`** yüzeyi vardı ve yalnız
 * 7'sinde Escape çalışıyordu — kalan 13'ü klavyeyle kapatılamıyordu. Yarı hazır
 * bir çerçeve (`alerts/NoteFormModal.tsx` içindeki `ModalFrame`) zaten vardı ama
 * eksikti: Escape ve focus-dönüşü onu KULLANANIN kendi `useEffect`'indeydi,
 * yani her çağıran tekrar yazmak zorundaydı ve çoğu yazmamıştı. Davranış
 * çerçevenin kendisine ait; buraya taşındı ve üstüne focus TUZAĞI eklendi
 * (hiçbir yüzeyde yoktu).
 *
 * 2026-09-05: davranış BİR ADIM DAHA çıkarıldı (`dialog-a11y.ts`). Sebep aynı
 * kusurun çekmecelerde tekrarlanmış olması — `Modal`'a taşınmayan yedi yan
 * çekmecenin dördünde Escape, altısında odak tuzağı yoktu. Buradaki davranış
 * değişmedi: `modal-ui.test.tsx`in 17 testi düzenlenmeden yeşil kalır.
 *
 * Stiller `ModalFrame`'in token'larıyla birebir — görsel regresyon yok.
 */

export interface ModalProps {
    onClose: () => void;
    /** Erişilebilir ad. `labelledBy` verilmediyse zorunlu. */
    ariaLabel?: string;
    /**
     * Başlık elemanının id'si. Verilirse `aria-labelledby` basılır ve
     * `ariaLabel`'ı yener — görünen başlık, uydurma bir etiketten iyidir.
     */
    labelledBy?: string;
    /** Örn. "min(560px, calc(100vw - 28px))". */
    width?: string;
    /**
     * false → Escape ve backdrop tıklaması kapatmaz. Yıkıcı bir işlem
     * sürerken kullanıcı yanlışlıkla kaçamasın diye (ResetDemoSection).
     */
    dismissible?: boolean;
    /**
     * false → çerçeve kendi iç boşluğunu ve `gap`'ini UYGULAMAZ.
     *
     * Kendi başlık/gövde/alt-bar düzeni (ayırıcı çizgileriyle birlikte) olan
     * yüzeyler için: onları buradaki 20px padding'e sokmak ya çift boşluk ya da
     * ayırıcıların içeri kaçması demekti. Bu kapıyla elle yazılmış modallar
     * GÖRÜNTÜLERİ DEĞİŞMEDEN Escape + focus tuzağı + odak dönüşü kazanıyor.
     */
    padded?: boolean;
    /**
     * Çerçevenin yüzey stilini (arka plan, kenarlık, köşe, gölge, genişlik…)
     * EZER. Elle yazılmış modalları taşırken görsel regresyon olmasın diye:
     * bazı yüzeylerin kendi kimliği var (ör. teklif onayı `variant`e göre
     * kırmızı/mavi kenarlık taşıyor). Konumlandırma, z-index ve erişilebilirlik
     * çerçevede kalır; yalnız görünüm çağırana açılır.
     */
    surfaceStyle?: React.CSSProperties;
    children: ReactNode;
}

export default function Modal({
    onClose,
    ariaLabel,
    labelledBy,
    width = "min(480px, calc(100vw - 28px))",
    dismissible = true,
    padded = true,
    surfaceStyle,
    children,
}: ModalProps) {
    const dialogRef = useRef<HTMLDivElement>(null);
    const { requestClose } = useDialogA11y(dialogRef, { onClose, dismissible });

    return (
        <>
            {/* Backdrop `Drawer` ile ortak — gerekçesi `dialog-a11y.ts`te.
                Testler onun İLK kardeş olmasına dayanıyor (modal-ui:24). */}
            <div onClick={requestClose} aria-hidden="true" style={DIALOG_BACKDROP} />
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                {...(labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": ariaLabel })}
                tabIndex={-1}
                style={{ ...modalStyle, width, ...(padded ? null : UNPADDED), ...surfaceStyle }}
            >
                {children}
            </div>
        </>
    );
}

export interface ConfirmModalProps {
    title: string;
    message: ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: "danger" | "default";
    /** İşlem sürüyor — butonlar kilitlenir, modal kapanmaz. */
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}

/**
 * Yıkıcı işlem onayı. `window.confirm`'ün yerine geçer: temalı, Escape'li ve
 * tarayıcıyı bloklamaz. Metinler çağıranda kalır — bu bileşen bir karar
 * vermez, yalnız sorar.
 */
export function ConfirmModal({
    title,
    message,
    confirmLabel = "Onayla",
    cancelLabel = "İptal",
    tone = "danger",
    busy = false,
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    return (
        <Modal onClose={onCancel} labelledBy="confirm-modal-title" dismissible={!busy}>
            <div
                id="confirm-modal-title"
                style={{ fontSize: "15px", fontWeight: 650, color: "var(--text-primary)" }}
            >
                {title}
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                {message}
            </div>
            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "6px" }}>
                <Button variant="secondary" onClick={onCancel} disabled={busy}>{cancelLabel}</Button>
                <Button
                    variant={tone === "danger" ? "danger" : "primary"}
                    onClick={onConfirm}
                    loading={busy}
                    disabled={busy}
                >
                    {confirmLabel}
                </Button>
            </div>
        </Modal>
    );
}

/** `padded={false}` — iç düzenini kendi taşıyan yüzeyler için. */
const UNPADDED: React.CSSProperties = { padding: 0, gap: 0, display: "block" };

const modalStyle: React.CSSProperties = {
    position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
    zIndex: 201, maxHeight: "calc(100vh - 28px)", overflowY: "auto",
    background: "var(--surface-raised)", border: "1px solid var(--border-secondary)",
    borderRadius: "10px", boxShadow: "0 20px 58px rgba(0,0,0,0.38)",
    padding: "20px", display: "flex", flexDirection: "column", gap: "11px",
};
