"use client";

import { WifiOff } from "lucide-react";
import { useOnlineStatus } from "@/lib/use-online-status";

/**
 * Çevrimdışı bandı (madde #10).
 *
 * KAPATILAMAZ — `DemoBanner`'dan bilinçli farkı bu. Demo bandı bir bilgi notu;
 * bu bir DURUM göstergesi. Kapatılabilseydi kullanıcı bandı kapatır, bağlantısı
 * kopuk hâlde çalışmaya devam eder ve kaydettiğini sandığı işi kaybederdi.
 * Bağlantı gelince kendiliğinden kaybolur.
 */
export default function OfflineBanner() {
    const { offline } = useOnlineStatus();
    if (!offline) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                padding: "7px 14px",
                background: "var(--danger-bg)",
                border: "var(--line-width) solid var(--danger-border)",
                borderRadius: "6px",
                marginBottom: "16px",
                fontSize: "12px",
                color: "var(--danger-text)",
            }}
        >
            <WifiOff size={14} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
                İnternet bağlantısı yok. Gördüğünüz veriler güncel olmayabilir ve
                yaptığınız değişiklikler kaydedilmez.
            </span>
        </div>
    );
}
