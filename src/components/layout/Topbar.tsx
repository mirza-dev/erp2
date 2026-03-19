"use client";

export default function Topbar() {
    return (
        <header
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0 20px",
                height: "52px",
                background: "var(--bg-primary)",
                borderBottom: "0.5px solid var(--border-tertiary)",
            }}
        >
            {/* Logo */}
            <div
                style={{
                    fontSize: "15px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                }}
            >
                KokpitERP
                <span
                    style={{
                        fontSize: "11px",
                        background: "var(--accent-bg)",
                        color: "var(--accent-text)",
                        padding: "2px 6px",
                        borderRadius: "4px",
                        border: "0.5px solid var(--accent-border)",
                    }}
                >
                    AI
                </span>
            </div>

            {/* Right */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Live indicator */}
                <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                    <span
                        className="animate-pulse-dot"
                        style={{
                            width: "6px",
                            height: "6px",
                            background: "var(--success)",
                            borderRadius: "50%",
                        }}
                    />
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        Realtime
                    </span>
                </div>

                {/* Alert button */}
                <button
                    style={{
                        fontSize: "12px",
                        padding: "5px 12px",
                        border: "0.5px solid var(--danger-border)",
                        borderRadius: "6px",
                        background: "var(--danger-bg)",
                        color: "var(--danger-text)",
                        cursor: "pointer",
                    }}
                >
                    3 Üretim Uyarısı
                </button>

                {/* User avatar */}
                <div
                    style={{
                        width: "30px",
                        height: "30px",
                        borderRadius: "50%",
                        background: "var(--accent-bg)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--accent-text)",
                    }}
                >
                    CS
                </div>
            </div>
        </header>
    );
}
