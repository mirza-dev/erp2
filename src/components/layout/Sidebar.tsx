"use client";

import { memo, useState, useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    Boxes,
    Building2,
    ClipboardList,
    Factory,
    FileText,
    LayoutDashboard,
    NotebookText,
    RefreshCw,
    Settings,
    ShoppingBag,
    SlidersHorizontal,
    TrendingUp,
    TriangleAlert,
    Truck,
    UploadCloud,
    Users,
    type LucideIcon,
} from "lucide-react";
import { useData } from "@/lib/data-context";
import { isDemoMode, clearDemoMode } from "@/lib/demo-utils";
import { requiredPermissionForPath } from "@/lib/auth/page-access";
import { usePermissions } from "@/lib/auth/use-permissions";

interface NavItem {
    label: string;
    href: string;
    icon: LucideIcon;
    count?: number;
    countTone?: "info" | "warning" | "danger";
    exact?: boolean;
}

interface NavGroup {
    id: string;
    label?: string;
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
            id: "home",
            items: [
                { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, exact: true },
            ],
        },
        {
            id: "sales",
            label: "Satış",
            items: [
                { label: "Teklifler", href: "/dashboard/quotes", icon: FileText },
                { label: "Satış Siparişleri", href: "/dashboard/orders", icon: ClipboardList, count: pendingOrderCount || undefined, countTone: "info" },
                { label: "Cariler", href: "/dashboard/customers", icon: Building2 },
            ],
        },
        {
            id: "purchase",
            label: "Satın Alma",
            items: [
                { label: "Öneriler", href: "/dashboard/purchase/suggested", icon: TrendingUp, count: reorderCount || undefined, countTone: "warning" },
                { label: "Satın Alma Siparişleri", href: "/dashboard/purchase/orders", icon: ShoppingBag },
                { label: "Tedarikçiler", href: "/dashboard/vendors", icon: Truck },
            ],
        },
        {
            id: "stock-production",
            label: "Stok & Üretim",
            items: [
                { label: "Stok & Ürünler", href: "/dashboard/products", icon: Boxes },
                { label: "Üretim Girişi", href: "/dashboard/production", icon: Factory },
                { label: "Uyarılar", href: "/dashboard/alerts", icon: TriangleAlert, count: activeAlertCount || undefined, countTone: "danger" },
            ],
        },
        {
            id: "data",
            label: "Veri",
            items: [
                { label: "Veri Aktarım Merkezi", href: "/dashboard/import", icon: UploadCloud },
            ],
        },
        {
            id: "finance",
            label: "Finans",
            items: [
                { label: "Paraşüt Sync", href: "/dashboard/parasut", icon: RefreshCw },
            ],
        },
        {
            id: "system",
            label: "Sistem",
            items: [
                { label: "Ayarlar", href: "/dashboard/settings", icon: Settings, exact: true },
                { label: "Teknik Şablonlar", href: "/dashboard/settings/product-types", icon: SlidersHorizontal },
                { label: "Not Şablonları", href: "/dashboard/settings/note-templates", icon: NotebookText },
                { label: "Kullanıcılar", href: "/dashboard/settings/users", icon: Users },
            ],
        },
    ], [reorderCount, pendingOrderCount, activeAlertCount]);

    // Permission filtresi — her item'ın gerekli permission'ı page-access matrisinden
    // türetilir (Sidebar'da ayrı liste YOK → gate ile garantili tutarlı). Filtrelenince
    // boş kalan grup başlığı da gizlenir.
    const visibleGroups = useMemo(() => {
        if (perms === null) return navGroups;
        return navGroups.reduce<NavGroup[]>((groups, group) => {
            const items = group.items.filter(item => {
                const req = requiredPermissionForPath(item.href);
                return req === null || perms.has(req);
            });
            if (items.length > 0) {
                groups.push({ ...group, items });
            }
            return groups;
        }, []);
    }, [navGroups, perms]);

    const isActive = (item: NavItem) =>
        item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(item.href + "/");

    const badgeColors = (tone: NavItem["countTone"] = "danger") => {
        if (tone === "info") {
            return { background: "var(--accent-bg)", color: "var(--accent-text)", border: "var(--accent-border)" };
        }
        if (tone === "warning") {
            return { background: "var(--warning-bg)", color: "var(--warning-text)", border: "var(--warning-border)" };
        }
        return { background: "var(--danger-bg)", color: "var(--danger-text)", border: "var(--danger-border)" };
    };

    return (
        <aside
            style={{
                background: "var(--shell-bg)",
                borderRight: "var(--line-width) solid var(--shell-border)",
                boxShadow: "var(--shell-shadow)",
                padding: "10px 8px 12px",
                display: "flex",
                flexDirection: "column",
                gap: "2px",
                overflowY: "auto",
                height: "100%",
                boxSizing: "border-box",
            }}
        >
            {visibleGroups.map((group) => (
                <div key={group.id} style={{ marginTop: group.label ? "7px" : 0 }}>
                    {group.label && (
                        <div
                            style={{
                                padding: "10px 10px 5px",
                                fontSize: "10px",
                                color: "var(--text-tertiary)",
                                letterSpacing: 0,
                                textTransform: "uppercase",
                                fontWeight: "var(--font-heading-weight)",
                            }}
                        >
                            {group.label}
                        </div>
                    )}
                    {group.items.map((item) => {
                        const active = isActive(item);
                        const Icon = item.icon;
                        const badge = badgeColors(item.countTone);
                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                onClick={onNavigate}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "10px",
                                    minHeight: "36px",
                                    padding: "0 9px 0 10px",
                                    fontSize: "13px",
                                    fontWeight: active ? "var(--font-heading-weight)" : "var(--font-ui-weight)",
                                    color: active ? "var(--accent-text)" : "var(--text-secondary)",
                                    background: active ? "var(--nav-active-bg)" : "transparent",
                                    textDecoration: "none",
                                    cursor: "pointer",
                                    transition: "background 0.14s ease, color 0.14s ease, border-color 0.14s ease",
                                    borderRadius: "7px",
                                    position: "relative",
                                    border: `var(--line-width) solid ${active ? "var(--nav-active-border)" : "transparent"}`,
                                    boxSizing: "border-box",
                                }}
                                onMouseEnter={(e) => {
                                    if (!active) {
                                        e.currentTarget.style.background = "var(--nav-hover-bg)";
                                        e.currentTarget.style.color = "var(--text-primary)";
                                        e.currentTarget.style.borderColor = "var(--shell-border)";
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!active) {
                                        e.currentTarget.style.background = "transparent";
                                        e.currentTarget.style.color = "var(--text-secondary)";
                                        e.currentTarget.style.borderColor = "transparent";
                                    }
                                }}
                            >
                                <span
                                    aria-hidden
                                    style={{
                                        position: "absolute",
                                        left: 0,
                                        top: "7px",
                                        bottom: "7px",
                                        width: "2px",
                                        borderRadius: "999px",
                                        background: active ? "var(--accent)" : "transparent",
                                    }}
                                />
                                <Icon
                                    size={17}
                                    strokeWidth={1.75}
                                    aria-hidden
                                    style={{
                                        flexShrink: 0,
                                        color: "currentColor",
                                        opacity: active ? 1 : 0.72,
                                    }}
                                />
                                <span
                                    style={{
                                        flex: 1,
                                        minWidth: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                    title={item.label}
                                >
                                    {item.label}
                                </span>
                                {item.count && item.count > 0 && (
                                    <span
                                        style={{
                                            marginLeft: "auto",
                                            minWidth: "22px",
                                            height: "22px",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "11px",
                                            lineHeight: 1,
                                            fontWeight: 700,
                                            background: badge.background,
                                            color: badge.color,
                                            border: `var(--line-width) solid ${badge.border}`,
                                            padding: "0 6px",
                                            borderRadius: "999px",
                                            boxSizing: "border-box",
                                            flexShrink: 0,
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
                    borderTop: "var(--line-width) solid var(--shell-border)",
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
                            border: "var(--line-width) solid var(--accent-border)",
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
                        type="button"
                        onClick={handleLogout}
                        style={{
                            width: "100%",
                            padding: "8px 12px",
                            fontSize: "12px",
                            color: "var(--text-tertiary)",
                            background: "transparent",
                            border: "var(--line-width) solid var(--border-tertiary)",
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
