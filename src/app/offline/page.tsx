import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Bağlantı yok — Roven",
    description: "İnternet bağlantısı kurulamadı.",
};

/**
 * Service worker'ın gezinme hatasında döndürdüğü sabit yedek sayfa
 * (`public/sw.js` → OFFLINE_URL). Kurulum sırasında precache'lenir.
 *
 * Kasten sunucu verisi OKUMAZ ve istemci mantığı İÇERMEZ: çevrimdışıyken
 * çalışması gereken tek şey bu sayfa. Renkler tema token'larından gelir, yani
 * kullanıcının temasında doğru görünür.
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
                <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 8px" }}>Bağlantı yok</h1>
                <p style={{ fontSize: "14px", lineHeight: 1.6, color: "var(--text-secondary)", margin: "0 0 20px" }}>
                    Roven çalışmak için sunucuya bağlanmak zorunda — sipariş, stok ve teklif
                    verileri anlık okunur. Bağlantı gelince sayfayı yenileyin.
                </p>
                {/* next/link DEĞİL, bilinçli: bu sayfa ağ ölüyken service worker
                    tarafından servis ediliyor. Link istemci-taraflı gezinme yapar ve
                    RSC yükü ister — çevrimdışıyken olmayan şey tam olarak bu. Düz <a>
                    tam bir belge isteği zorlar, yani "ağı tekrar dene" anlamına gelir. */}
                <a
                    href="/dashboard"
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
