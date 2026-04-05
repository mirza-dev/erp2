import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "KokpitERP — AI Destekli ERP",
    description: "PMT Endüstriyel için yapay zeka destekli ERP sistemi. Sipariş yönetimi, stok takibi, Paraşüt entegrasyonu.",
};

const features = [
    { title: "Sipariş Yönetimi", desc: "Onay akışı, rezervasyon, sevkiyat takibi" },
    { title: "Stok & Üretim", desc: "Gerçek zamanlı stok, BOM, üretim girişi" },
    { title: "AI İçe Aktarma", desc: "Claude ile PDF/Excel'den akıllı sipariş ayrıştırma" },
    { title: "Paraşüt Sync", desc: "Otomatik fatura gönderimi ve muhasebe entegrasyonu" },
    { title: "Satın Alma Önerileri", desc: "AI destekli yeniden sipariş analizi" },
    { title: "Uyarı Motoru", desc: "Kritik stok ve üretim uyarıları" },
];

const stack = ["Next.js 15", "TypeScript", "Supabase", "Claude AI (Anthropic)", "PostgreSQL"];

export default function LandingPage() {
    return (
        <div
            style={{
                minHeight: "100vh",
                background: "var(--bg-primary)",
                display: "flex",
                flexDirection: "column",
            }}
        >
            {/* Nav */}
            <nav
                style={{
                    padding: "16px 32px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}
            >
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                    KokpitERP
                </span>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <a
                        href="https://github.com/mirza-dev/erp2"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none" }}
                    >
                        GitHub
                    </a>
                    <Link
                        href="/login"
                        style={{
                            fontSize: "13px",
                            padding: "6px 16px",
                            background: "var(--accent)",
                            color: "#fff",
                            borderRadius: "6px",
                            textDecoration: "none",
                            fontWeight: 500,
                        }}
                    >
                        Giriş Yap
                    </Link>
                </div>
            </nav>

            {/* Hero */}
            <div
                style={{
                    padding: "72px 32px 56px",
                    maxWidth: "680px",
                    margin: "0 auto",
                    width: "100%",
                    textAlign: "center",
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        display: "inline-block",
                        fontSize: "11px",
                        padding: "3px 10px",
                        background: "var(--accent-bg)",
                        color: "var(--accent-text)",
                        borderRadius: "20px",
                        border: "0.5px solid var(--accent-border)",
                        marginBottom: "20px",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                    }}
                >
                    PMT Endüstriyel için
                </div>
                <h1
                    style={{
                        fontSize: "32px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        margin: "0 0 16px",
                        lineHeight: 1.25,
                    }}
                >
                    AI Destekli ERP Sistemi
                </h1>
                <p
                    style={{
                        fontSize: "14px",
                        color: "var(--text-secondary)",
                        margin: "0 0 36px",
                        lineHeight: 1.7,
                    }}
                >
                    Endüstriyel vana satışı için tasarlanmış, yapay zeka destekli ERP.
                    Sipariş yönetiminden Paraşüt muhasebe entegrasyonuna kadar
                    tüm operasyonlar tek ekranda.
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                    <Link
                        href="/login"
                        style={{
                            fontSize: "13px",
                            padding: "9px 22px",
                            background: "var(--accent)",
                            color: "#fff",
                            borderRadius: "7px",
                            textDecoration: "none",
                            fontWeight: 500,
                        }}
                    >
                        Giriş Yap →
                    </Link>
                    <a
                        href="https://github.com/mirza-dev/erp2"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            fontSize: "13px",
                            padding: "9px 22px",
                            border: "0.5px solid var(--border-secondary)",
                            color: "var(--text-secondary)",
                            borderRadius: "7px",
                            textDecoration: "none",
                        }}
                    >
                        Kaynak Kod
                    </a>
                </div>
            </div>

            {/* Features */}
            <div
                style={{
                    padding: "0 32px 64px",
                    maxWidth: "860px",
                    margin: "0 auto",
                    width: "100%",
                    boxSizing: "border-box",
                }}
            >
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "10px",
                    }}
                >
                    {features.map((f) => (
                        <div
                            key={f.title}
                            style={{
                                padding: "16px 18px",
                                background: "var(--bg-secondary)",
                                border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "8px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "var(--text-primary)",
                                    marginBottom: "4px",
                                }}
                            >
                                {f.title}
                            </div>
                            <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                {f.desc}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Footer / stack */}
            <div
                style={{
                    marginTop: "auto",
                    padding: "20px 32px",
                    borderTop: "0.5px solid var(--border-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    justifyContent: "center",
                    flexWrap: "wrap",
                }}
            >
                {stack.map((s) => (
                    <span
                        key={s}
                        style={{
                            fontSize: "11px",
                            padding: "2px 9px",
                            background: "var(--bg-secondary)",
                            color: "var(--text-tertiary)",
                            borderRadius: "4px",
                            border: "0.5px solid var(--border-tertiary)",
                        }}
                    >
                        {s}
                    </span>
                ))}
            </div>
        </div>
    );
}
