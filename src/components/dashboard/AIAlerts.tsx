"use client";

interface AlertItem {
    type: "danger" | "warning";
    title: string;
    description: string;
}

const alerts: AlertItem[] = [
    {
        type: "danger",
        title: "Kauçuk Conta 12mm kritik seviyede",
        description: "Satış hızına göre 2 günde tükenecek. Öneri: 500 adet üretim emri.",
    },
    {
        type: "danger",
        title: "Galvanizli Bağlantı stoğu sıfır",
        description: "3 bekleyen sipariş bu ürünü kapsıyor. Acil üretim gerekiyor.",
    },
    {
        type: "warning",
        title: "Paslanmaz Vida M8 yüksek rezerve oranı",
        description: "%37'si kilitli. Önümüzdeki 7 günde tükenmesi bekleniyor.",
    },
];

export default function AIAlerts() {
    return (
        <div
            style={{
                background: "var(--bg-primary)",
                border: "0.5px solid var(--accent-border)",
                borderRadius: "6px",
                padding: "16px",
            }}
        >
            {/* Title */}
            <div
                style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--accent-text)",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                }}
            >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
                AI Üretim Uyarıları
            </div>

            {/* Items */}
            {alerts.map((alert, i) => (
                <div
                    key={i}
                    style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: "10px",
                        padding: "8px 0",
                        borderBottom: i < alerts.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                    }}
                >
                    {/* Icon */}
                    <div
                        style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "4px",
                            background: alert.type === "danger" ? "var(--danger-bg)" : "var(--warning-bg)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                            marginTop: "1px",
                        }}
                    >
                        {alert.type === "danger" ? (
                            <svg width="10" height="10" viewBox="0 0 10 10">
                                <path d="M5 1L9 9H1z" fill="var(--danger-text)" />
                            </svg>
                        ) : (
                            <svg width="10" height="10" viewBox="0 0 10 10">
                                <rect x="4" y="2" width="2" height="5" fill="var(--warning-text)" />
                                <rect x="4" y="8" width="2" height="2" fill="var(--warning-text)" />
                            </svg>
                        )}
                    </div>
                    <div>
                        <div style={{ fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.4 }}>
                            {alert.title}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.4, marginTop: "2px" }}>
                            {alert.description}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
