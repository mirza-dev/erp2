import type { Metadata } from "next";

import { OfflineReason } from "./OfflineReason";

export const metadata: Metadata = {
    // Sekme başlığı dinamik OLAMAZ (sunucuda üretilir), o yüzden sebebi
    // iddia etmeyen hâli seçildi — bkz. OfflineReason.
    title: "Roven'a ulaşılamıyor",
    description: "Sunucuya bağlantı kurulamadı.",
};

/**
 * Service worker'ın gezinme hatasında döndürdüğü sabit yedek sayfa
 * (`public/sw.js` → OFFLINE_URL). Kurulum sırasında precache'lenir.
 *
 * Kasten sunucu verisi OKUMAZ: çevrimdışıyken çalışması gereken tek şey bu
 * sayfa. Renkler tema token'larından gelir, yani kullanıcının temasında doğru
 * görünür.
 *
 * 2026-09-12: metin artık SABİT DEĞİL. Tek parça istemci mantığı var
 * (`OfflineReason`) — çünkü SW bu sayfayı iki apayrı sebep için döndürüyor ve
 * koşulsuz "Bağlantı yok" demek, sinyali tam olan bir cihazda yanlış teşhisti.
 * Sayfanın yapısı (h1/paragraf/düz <a>) burada KALIYOR: dört kapı bu dosyayı
 * ölçüyor (pwa · form-consistency · touch-targets · surface-consistency) ve
 * yapıyı komşu dosyaya taşımak onları sessizce boş kümeye bakar hâle getirirdi.
 */
export default function OfflinePage() {
    return (
        <main
            style={{
                minHeight: "100dvh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
            }}
        >
            <div style={{ maxWidth: "420px", textAlign: "center" }}>
                <div aria-hidden="true" style={{ fontSize: "40px", lineHeight: 1, marginBottom: "16px" }}>
                    ⚡
                </div>
                <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 8px" }}>
                    <OfflineReason part="title" />
                </h1>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--text-secondary)", margin: "0 0 20px" }}>
                    <OfflineReason part="detail" />
                </p>
                {/* next/link DEĞİL, bilinçli: bu sayfa ağ ölüyken service worker
                    tarafından servis ediliyor. Link istemci-taraflı gezinme yapar ve
                    RSC yükü ister — çevrimdışıyken olmayan şey tam olarak bu. Düz <a>
                    tam bir belge isteği zorlar, yani "ağı tekrar dene" anlamına gelir. */}
                <a
                    href="/dashboard"
                    className="tap-44"
                    style={{
                        display: "inline-block",
                        padding: "8px 16px",
                        fontSize: "13px",
                        borderRadius: "6px",
                        border: "1px solid var(--accent-border)",
                        background: "var(--accent-bg)",
                        color: "var(--accent-text)",
                        textDecoration: "none",
                    }}
                >
                    Tekrar dene
                </a>
            </div>
        </main>
    );
}
