"use client";

import Link from "next/link";
import { useData } from "@/lib/data-context";

interface TopbarProps {
    onToggleSidebar?: () => void;
}

export default function Topbar({ onToggleSidebar }: TopbarProps) {
    const { activeAlertCount } = useData();
    const alertCount = activeAlertCount;
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
            {/* Left */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {/* Hamburger — mobile only */}
                <button
                    className="hamburger-btn"
                    onClick={onToggleSidebar}
                    style={{
                        display: "none",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "none",
                        border: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        padding: "4px",
                    }}
                >
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    </svg>
                </button>

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
            </div>

            {/* Right */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Live indicator — hide on mobile */}
                <div className="topbar-right-extras" style={{ display: "flex", alignItems: "center", gap: "5px" }}>
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
                        Bağlı
                    </span>
                </div>

                {/* Alert button */}
                {alertCount > 0 && (
                    <Link href="/dashboard/alerts" style={{ textDecoration: "none" }}>
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
                            {alertCount} Uyarı
                        </button>
                    </Link>
                )}

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
