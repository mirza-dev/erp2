"use client";

import { mockOrders } from "@/lib/mock-data";
import { formatCurrency } from "@/lib/utils";

const statusConfig: Record<string, { label: string; cls: string }> = {
    DRAFT:     { label: "Taslak",      cls: "badge-neutral" },
    PENDING:   { label: "Bekliyor",    cls: "badge-warning" },
    APPROVED:  { label: "Onaylı",      cls: "badge-accent"  },
    SHIPPED:   { label: "Sevk Edildi", cls: "badge-success" },
    CANCELLED: { label: "İptal",       cls: "badge-danger"  },
};

export default function RecentOrders() {
    return (
        <div
            style={{
                background: "var(--bg-primary)",
                border: "0.5px solid var(--border-tertiary)",
                borderRadius: "6px",
                padding: "16px",
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

            {mockOrders.slice(0, 3).map((order) => {
                const status = statusConfig[order.status];
                return (
                    <div
                        key={order.id}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "8px 0",
                            borderBottom: "0.5px solid var(--border-tertiary)",
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
                                {formatCurrency(order.grandTotal, order.currency)}
                            </div>
                            <span className={`badge ${status.cls}`}>{status.label}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
