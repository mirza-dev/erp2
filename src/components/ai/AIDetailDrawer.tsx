"use client";

import Drawer from "@/components/ui/Drawer";

interface AIDetailDrawerProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    /** Set to false to hide the "✦ AI" header badge. Default: true. */
    showAiBadge?: boolean;
    children: React.ReactNode;
}

/**
 * AI analiz çekmecesi — ürün detayı, purchase/suggested ve orders/[id] kullanır.
 *
 * 2026-09-05: çerçeve `ui/Drawer`'a taşındı. Bu dosya çekmece davranışının
 * repodaki EN İYİ kopyasıydı (Escape + Tab tuzağı + odak dönüşü hepsi vardı) —
 * ama kopyaydı: aynı mantığın ikinci ve `Modal`'ınkinden biraz farklı bir
 * sürümü. İki yerde şaşıyordu: odak panelin DIŞINDAYKEN Shift+Tab tuzağa
 * dönmüyordu, ve odaklanabilir öğe yokken Tab dışarı kaçıyordu. Ortak
 * çekirdek ikisini de kapatıyor.
 *
 * `open` propu KORUNDU — üç çağıran onu geçiriyor ve bu tur çerçeve turu,
 * çağıran sözleşmesi turu değil.
 */
export default function AIDetailDrawer({
    open,
    onClose,
    title = "AI Analizi",
    showAiBadge = true,
    children,
}: AIDetailDrawerProps) {
    if (!open) return null;

    return (
        <Drawer onClose={onClose} ariaLabel={title} width="min(400px, 100vw)" padded={false}>
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    flexShrink: 0,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {showAiBadge && (
                        <span
                            style={{
                                fontSize: "9px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                background: "var(--accent-bg)",
                                color: "var(--accent-text)",
                                padding: "2px 6px",
                                borderRadius: "3px",
                            }}
                        >
                            ✦ AI
                        </span>
                    )}
                    <span
                        style={{
                            fontSize: "14px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                        }}
                    >
                        {title}
                    </span>
                </div>
                {/* Açılışta odağı bu buton alır: çerçeve İLK odaklanabilir öğeye
                    odaklanıyor ve DOM sırasında ilk o. Eskiden `closeBtnRef` ile
                    elle yapılıyordu — sonuç aynı, ref gereksizleşti. */}
                <button
                    onClick={onClose}
                    aria-label="Kapat"
                    style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        color: "var(--text-tertiary)",
                        fontSize: "20px",
                        lineHeight: 1,
                        padding: "4px 8px",
                        borderRadius: "4px",
                    }}
                >
                    ✕
                </button>
            </div>

            {/* Scrollable content */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "20px",
                }}
            >
                {children}
            </div>
        </Drawer>
    );
}
