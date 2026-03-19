"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
    label: string;
    href: string;
    count?: number;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

const navGroups: NavGroup[] = [
    {
        label: "Operasyon",
        items: [
            { label: "Dashboard", href: "/dashboard" },
            { label: "Siparişler", href: "/dashboard/orders", count: 12 },
            { label: "Stok & Ürünler", href: "/dashboard/products" },
        ],
    },
    {
        label: "Üretim",
        items: [
            { label: "Üretim Girişi", href: "/dashboard/production" },
        ],
    },
    {
        label: "Otomasyon",
        items: [
            { label: "AI İçeri Aktar", href: "/dashboard/import" },
            { label: "Üretim Uyarıları", href: "/dashboard/alerts", count: 3 },
        ],
    },
    {
        label: "Muhasebe",
        items: [
            { label: "Paraşüt Sync", href: "/dashboard/parasut" },
            { label: "Cariler", href: "/dashboard/customers" },
        ],
    },
    {
        label: "Sistem",
        items: [
            { label: "Ayarlar", href: "/dashboard/settings" },
        ],
    },
];

export default function Sidebar() {
    const pathname = usePathname();

    const isActive = (href: string) =>
        href === "/dashboard"
            ? pathname === href
            : pathname.startsWith(href);

    return (
        <aside
            style={{
                background: "var(--bg-primary)",
                borderRight: "0.5px solid var(--border-tertiary)",
                padding: "12px 0",
                display: "flex",
                flexDirection: "column",
                gap: "1px",
                overflowY: "auto",
            }}
        >
            {navGroups.map((group) => (
                <div key={group.label}>
                    <div
                        style={{
                            padding: "14px 16px 5px",
                            fontSize: "11px",
                            color: "var(--text-tertiary)",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                        }}
                    >
                        {group.label}
                    </div>
                    {group.items.map((item) => {
                        const active = isActive(item.href);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    padding: "8px 16px",
                                    fontSize: "13px",
                                    color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                    background: active ? "var(--accent-bg)" : "transparent",
                                    textDecoration: "none",
                                    cursor: "pointer",
                                    transition: "background 0.1s, color 0.1s",
                                }}
                                onMouseEnter={(e) => {
                                    if (!active) {
                                        e.currentTarget.style.background = "var(--bg-secondary)";
                                        e.currentTarget.style.color = "var(--text-primary)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!active) {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = "var(--text-secondary)";
                                    }
                                }}
                            >
                                {/* Dot */}
                                <span
                                    style={{
                                        width: "6px",
                                        height: "6px",
                                        borderRadius: "50%",
                                        background: "currentColor",
                                        opacity: active ? 1 : 0.5,
                                        flexShrink: 0,
                                    }}
                                />
                                <span style={{ flex: 1 }}>{item.label}</span>
                                {item.count && item.count > 0 && (
                                    <span
                                        style={{
                                            marginLeft: "auto",
                                            fontSize: "11px",
                                            background: "var(--danger-bg)",
                                            color: "var(--danger-text)",
                                            padding: "1px 5px",
                                            borderRadius: "8px",
                                        }}
                                    >
                                        {item.count}
                                    </span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            ))}
        </aside>
    );
}
