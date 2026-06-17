"use client";

import { memo } from "react";
import { useData } from "@/lib/data-context";
import type { CommercialStatus, FulfillmentStatus } from "@/lib/data-context";
import { maskCurrency } from "@/lib/utils";
import { usePermissions } from "@/lib/auth/use-permissions";

const commercialStatusConfig: Record<CommercialStatus, { label: string; cls: string }> = {
    draft:            { label: "Taslak",   cls: "badge-neutral" },
    pending_approval: { label: "Bekliyor", cls: "badge-warning" },
    approved:         { label: "Onaylı",   cls: "badge-accent"  },
    cancelled:        { label: "İptal",    cls: "badge-danger"  },
};

const fulfillmentStatusConfig: Record<FulfillmentStatus, { label: string; cls: string }> = {
    unallocated:         { label: "Rezervesiz",    cls: "badge-neutral"  },
    partially_allocated: { label: "Kısmi Rezerve", cls: "badge-warning"  },
    allocated:           { label: "Rezerveli",     cls: "badge-warning"  },
    shipped:             { label: "Sevk Edildi",   cls: "badge-success"  },
};

const RecentOrders = memo(function RecentOrders() {
    const { orders, loading } = useData();
    const { canViewSalesPrices } = usePermissions();

    if (loading) {
        return (
            <div
                style={{
                    background: "var(--surface-raised)",
                    border: "var(--line-width) solid var(--surface-border)",
                    borderRadius: "6px",
                    padding: "16px",
                    boxShadow: "var(--surface-shadow-sm)",
                }}
            >
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "12px" }}>
                    Son Siparişler
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            borderBottom: "var(--line-width) solid var(--border-tertiary)",
                        }}
                    >
                        <div>
                            <div style={{ height: "13px", width: "80px", background: "var(--bg-tertiary)", borderRadius: "4px", marginBottom: "4px", animation: "pulse 1.5s ease-in-out infinite" }} />
                            <div style={{ height: "11px", width: "110px", background: "var(--bg-tertiary)", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.15s" }} />
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ height: "13px", width: "60px", background: "var(--bg-tertiary)", borderRadius: "4px", marginBottom: "4px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.1s" }} />
                            <div style={{ height: "16px", width: "50px", background: "var(--bg-tertiary)", borderRadius: "4px", animation: "pulse 1.5s ease-in-out infinite", animationDelay: "0.25s" }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div
            style={{
                background: "var(--surface-raised)",
                border: "var(--line-width) solid var(--surface-border)",
                borderRadius: "6px",
                padding: "16px",
                boxShadow: "var(--surface-shadow-sm)",
            }}
        >
            <div
                style={{
                    fontSize: "13px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    marginBottom: "12px",
                }}
            >
                Son Siparişler
            </div>

            {orders.slice(0, 3).map((order) => {
                const commercial = commercialStatusConfig[order.commercial_status];
                const fulfillment = fulfillmentStatusConfig[order.fulfillment_status];
                const isShipped = order.fulfillment_status === "shipped";
                const showFulfillment = order.commercial_status === "approved" && order.fulfillment_status !== "unallocated";
                return (
                    <div
                        key={order.id}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            borderBottom: "var(--line-width) solid var(--border-tertiary)",
                        }}
                    >
                        <div>
                            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                                {order.orderNumber}
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "1px" }}>
                                {order.customerName}
                            </div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                                {maskCurrency(order.grandTotal, order.currency, canViewSalesPrices)}
                            </div>
                            {isShipped ? (
                                <span className={`badge ${fulfillment.cls}`}>{fulfillment.label}</span>
                            ) : (
                                <span style={{ display: "inline-flex", gap: "4px", alignItems: "center" }}>
                                    <span className={`badge ${commercial.cls}`}>{commercial.label}</span>
                                    {showFulfillment && (
                                        <span
                                            className={`badge ${fulfillment.cls}`}
                                            style={{ fontSize: "10px", padding: "2px 6px" }}
                                        >
                                            {fulfillment.label}
                                        </span>
                                    )}
                                </span>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
});

export default RecentOrders;
