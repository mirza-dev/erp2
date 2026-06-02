"use client";

import { memo, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useData } from "@/lib/data-context";
import { isDemoMode, clearDemoMode } from "@/lib/demo-utils";
import { requiredPermissionForPath } from "@/lib/auth/page-access";
import { usePermissions } from "@/lib/auth/use-permissions";

interface NavItem {
    label: string;
    href: string;
    count?: number;
}

interface NavGroup {
    label: string;
    items: NavItem[];
}

interface SidebarProps {
    onNavigate?: () => void;
}

const Sidebar = memo(function Sidebar({ onNavigate }: SidebarProps) {
    const pathname = usePathname();
    const router = useRouter();
    const { reorderSuggestions, orders, activeAlertCount } = useData();

    const [isDemo] = useState(() => isDemoMode());

    // RBAC Faz 2 — permission'a göre menü filtresi (UX katmanı; gerçek koruma
    // proxy.ts page-gate'te). Faz 7: ad-hoc fetch yerine merkezi PermissionProvider.
    // perms === null = henüz yüklenmedi → tüm item'lar gösterilir (server gate korur).
    const { perms } = usePermissions();

    const handleLogout = async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push("/login");
    };

    const reorderCount = useMemo(() => reorderSuggestions.length, [reorderSuggestions]);
    const pendingOrderCount = useMemo(
        () => orders.filter(o => o.commercial_status === "pending_approval").length,
        [orders]
    );

    const navGroups: NavGroup[] = useMemo(() => [
        {
            label: "Operasyon",
            items: [
                { label: "Dashboard", href: "/dashboard" },
                { label: "Teklifler", href: "/dashboard/quotes" },
                { label: "Satış Siparişleri", href: "/dashboard/orders", count: pendingOrderCount || undefined },
                { label: "Stok & Ürünler", href: "/dashboard/products" },
            ],
        },
        {
            label: "Satın Alma",
            items: [
                { label: "Öneriler", href: "/dashboard/purchase/suggested", count: reorderCount || undefined },
                { label: "Satın Alma Siparişleri", href: "/dashboard/purchase/orders" },
                { label: "Tedarikçiler", href: "/dashboard/vendors" },
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
                { label: "Üretim & Stok Uyarıları", href: "/dashboard/alerts", count: activeAlertCount || undefined },
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
                { label: "Teknik Şablonlar", href: "/dashboard/settings/product-types" },
                { label: "Not Şablonları", href: "/dashboard/settings/note-templates" },
                { label: "Kullanıcılar", href: "/dashboard/settings/users" },
            ],
        },
    ], [reorderCount, pendingOrderCount, activeAlertCount]);

    // Permission filtresi — her item'ın gerekli permission'ı page-access matrisinden
    // türetilir (Sidebar'da ayrı liste YOK → gate ile garantili tutarlı). Filtrelenince
    // boş kalan grup başlığı da gizlenir.
    const visibleGroups = useMemo(() => {
        if (perms === null) return navGroups;
        return navGroups
            .map(g => ({
                ...g,
                items: g.items.filter(it => {
                    const req = requiredPermissionForPath(it.href);
                    return req === null || perms.has(req);
                }),
            }))
            .filter(g => g.items.length > 0);
    }, [navGroups, perms]);

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
                height: "100%",
            }}
        >
            {visibleGroups.map((group) => (
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
                                onClick={onNavigate}
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

            <div
                style={{
                    marginTop: "auto",
                    padding: "12px 16px",
                    borderTop: "0.5px solid var(--border-tertiary)",
                }}
            >
                {isDemo ? (
                    <Link
                        href="/login"
                        onClick={clearDemoMode}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "var(--accent-text)",
                            background: "var(--accent-bg)",
                            border: "0.5px solid var(--accent-border)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "6px",
                            textDecoration: "none",
                            boxSizing: "border-box",
                        }}
                    >
                        Giriş Yap
                    </Link>
                ) : (
                    <button
                        onClick={handleLogout}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "var(--text-tertiary)",
                            background: "transparent",
                            border: "0.5px solid var(--border-tertiary)",
                            borderRadius: "6px",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}
                    >
                        Çıkış Yap
                    </button>
                )}
            </div>
        </aside>
    );
});

export default Sidebar;
