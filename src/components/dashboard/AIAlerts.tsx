"use client";

import Link from "next/link";
import { useData } from "@/lib/data-context";

function daysBadgeColor(days: number | null): string {
    if (days === null) return "var(--warning-text)";
    if (days <= 7) return "var(--danger-text)";
    if (days <= 14) return "var(--warning-text)";
    return "var(--text-secondary)";
}

function daysBadgeBg(days: number | null): string {
    if (days === null) return "var(--warning-bg)";
    if (days <= 7) return "var(--danger-bg)";
    if (days <= 14) return "var(--warning-bg)";
    return "var(--bg-tertiary)";
}

export default function AIAlerts() {
    const { reorderSuggestions } = useData();

    // Sort by urgency DESC, then daysLeft ASC
    const sorted = [...reorderSuggestions].sort((a, b) => {
        const urgA = (1 - a.available_now / a.minStockLevel);
        const urgB = (1 - b.available_now / b.minStockLevel);
        if (urgB !== urgA) return urgB - urgA;
        const dA = a.dailyUsage ? a.available_now / a.dailyUsage : 999;
        const dB = b.dailyUsage ? b.available_now / b.dailyUsage : 999;
        return dA - dB;
    });

    const top4 = sorted.slice(0, 4);

    return (
        <div
            style={{
                background: "var(--bg-primary)",
                border: "0.5px solid var(--accent-border)",
                borderRadius: "6px",
                padding: "16px",
            }}
        >
            {/* Title row */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                }}
            >
                <div style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--accent-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                }}>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                        <path d="M6 3v3l2 1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                    </svg>
                    AI Stok Uyarıları
                </div>
                {reorderSuggestions.length > 0 && (
                    <span style={{
                        fontSize: "11px",
                        background: "var(--danger-bg)",
                        color: "var(--danger-text)",
                        padding: "2px 7px",
                        borderRadius: "8px",
                        fontWeight: 600,
                    }}>
                        {reorderSuggestions.length} kritik
                    </span>
                )}
            </div>

            {/* Empty state */}
            {reorderSuggestions.length === 0 && (
                <div style={{ fontSize: "13px", color: "var(--success-text)", padding: "8px 0" }}>
                    ✓ Tüm stoklar minimum seviyenin üstünde.
                </div>
            )}

            {/* Alert items */}
            {top4.map((p, i) => {
                const urgency = Math.round((1 - p.available_now / p.minStockLevel) * 100);
                const daysLeft = p.dailyUsage ? Math.round(p.available_now / p.dailyUsage) : null;
                const stockPct = Math.min(100, Math.round((p.available_now / p.minStockLevel) * 100));
                const isRaw = p.productType === "raw_material";
                const borderColor = isRaw ? "var(--danger)" : "var(--warning)";

                return (
                    <div
                        key={p.id}
                        style={{
                            borderLeft: `3px solid ${borderColor}`,
                            paddingLeft: "10px",
                            paddingTop: "8px",
                            paddingBottom: "8px",
                            marginBottom: i < top4.length - 1 ? "8px" : 0,
                            borderBottom: i < top4.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                        }}
                    >
                        {/* Top row: type chip + name + days badge */}
                        <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "5px" }}>
                            <span style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                background: isRaw ? "var(--danger-bg)" : "var(--warning-bg)",
                                color: isRaw ? "var(--danger-text)" : "var(--warning-text)",
                                padding: "1px 5px",
                                borderRadius: "3px",
                                flexShrink: 0,
                            }}>
                                {isRaw ? "Hammadde" : "Bitmiş"}
                            </span>
                            <span style={{
                                fontSize: "12px",
                                fontWeight: 500,
                                color: "var(--text-primary)",
                                flex: 1,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}>
                                {p.name}
                            </span>
                            {daysLeft !== null && (
                                <span style={{
                                    fontSize: "11px",
                                    fontWeight: 700,
                                    background: daysBadgeBg(daysLeft),
                                    color: daysBadgeColor(daysLeft),
                                    padding: "1px 6px",
                                    borderRadius: "4px",
                                    flexShrink: 0,
                                }}>
                                    {daysLeft} gün
                                </span>
                            )}
                        </div>

                        {/* Stock bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                            <div style={{
                                flex: 1,
                                height: "4px",
                                background: "var(--bg-tertiary)",
                                borderRadius: "2px",
                                overflow: "hidden",
                            }}>
                                <div style={{
                                    width: `${stockPct}%`,
                                    height: "100%",
                                    background: isRaw ? "var(--danger)" : "var(--warning)",
                                    borderRadius: "2px",
                                }} />
                            </div>
                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)", flexShrink: 0 }}>
                                {p.available_now}/{p.minStockLevel}
                            </span>
                        </div>

                        {/* Risk bar */}
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "10px", color: "var(--text-tertiary)", flexShrink: 0 }}>
                                Risk
                            </span>
                            <div style={{
                                flex: 1,
                                height: "3px",
                                background: "var(--bg-tertiary)",
                                borderRadius: "2px",
                                overflow: "hidden",
                            }}>
                                <div style={{
                                    width: `${urgency}%`,
                                    height: "100%",
                                    background: urgency >= 80 ? "var(--danger)" : urgency >= 50 ? "var(--warning)" : "var(--accent)",
                                    borderRadius: "2px",
                                }} />
                            </div>
                            <span style={{ fontSize: "10px", color: "var(--text-secondary)", flexShrink: 0, fontWeight: 600 }}>
                                {urgency}%
                            </span>
                        </div>
                    </div>
                );
            })}

            {/* Footer link */}
            {reorderSuggestions.length > 0 && (
                <Link
                    href="/dashboard/purchase/suggested"
                    style={{
                        display: "block",
                        marginTop: "12px",
                        fontSize: "12px",
                        color: "var(--accent-text)",
                        textDecoration: "none",
                        textAlign: "center",
                        padding: "6px",
                        borderTop: "0.5px solid var(--border-tertiary)",
                    }}
                >
                    Tümünü Gör → ({reorderSuggestions.length} kritik ürün)
                </Link>
            )}
        </div>
    );
}
