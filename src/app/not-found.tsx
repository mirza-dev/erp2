import Link from "next/link";

/**
 * 404 sayfası.
 *
 * 2026-08-31 denetimi (madde #9): bu dosya YOKTU — bulunamayan her rota Next'in
 * stilsiz, İngilizce, tema-bilmez varsayılanına düşüyordu. Bir ERP'de en sık 404
 * kaynağı silinmiş bir kayda giden eski bir yer imi ya da paylaşılmış bir link;
 * kullanıcı orada "bozuk" değil "artık yok" mesajı görmeli.
 *
 * Sunucu bileşeni ve İSTEMCİ MANTIĞI YOK: 404 kabuğun bozulduğu durumlarda da
 * render edilebilmeli. Renkler tema token'larından gelir.
 */
export default function NotFound() {
    return (
        <main
            style={{
                minHeight: "100dvh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                background: "var(--bg-secondary)",
            }}
        >
            <div style={{ textAlign: "center", maxWidth: "380px" }}>
                <div
                    style={{
                        fontSize: "34px",
                        fontWeight: 600,
                        color: "var(--text-tertiary)",
                        letterSpacing: "0.02em",
                        marginBottom: "10px",
                    }}
                >
                    404
                </div>
                <h1 style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 8px" }}>
                    Sayfa bulunamadı
                </h1>
                <p style={{ fontSize: "13px", color: "var(--text-tertiary)", lineHeight: 1.6, margin: "0 0 22px" }}>
                    Aradığınız sayfa taşınmış, silinmiş ya da adresi yanlış yazılmış olabilir.
                </p>
                <Link
                    href="/dashboard"
                    style={{
                        display: "inline-block",
                        fontSize: "13px",
                        fontWeight: 500,
                        padding: "9px 22px",
                        background: "var(--accent)",
                        color: "#fff",
                        borderRadius: "var(--radius-md)",
                        textDecoration: "none",
                    }}
                >
                    Panoya dön
                </Link>
            </div>
        </main>
    );
}
