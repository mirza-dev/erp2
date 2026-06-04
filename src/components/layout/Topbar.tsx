"use client";

import { memo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, Menu } from "lucide-react";
import ExchangeRatesTicker from "@/components/layout/ExchangeRatesTicker";
import SystemHealthIndicator from "@/components/layout/SystemHealthIndicator";
import UserAvatarLink from "@/components/layout/UserAvatarLink";
import { useData } from "@/lib/data-context";
import { getTopbarTitle } from "@/lib/topbar-title";

interface TopbarProps {
    onToggleSidebar?: () => void;
}

const Topbar = memo(function Topbar({ onToggleSidebar }: TopbarProps) {
    const { activeAlertCount } = useData();
    const pathname = usePathname();
    const alertCount = activeAlertCount;
    const title = getTopbarTitle(pathname);

    return (
        <header
            className="topbar-shell"
        >
            <div className="topbar-left">
                <button
                    className="hamburger-btn"
                    type="button"
                    aria-label="Menüyü aç"
                    onClick={onToggleSidebar}
                    style={{
                        display: "none",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "none",
                        border: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        padding: "5px",
                        borderRadius: "6px",
                    }}
                >
                    <Menu size={19} strokeWidth={1.8} aria-hidden />
                </button>

                <div
                    className="topbar-brand"
                    style={{
                        fontSize: "15.5px",
                        fontWeight: 700,
                        color: "var(--text-primary)",
                        display: "flex",
                        alignItems: "center",
                        letterSpacing: 0,
                    }}
                >
                    KokpitERP
                </div>
            </div>

            <div className="topbar-page-context" aria-label="Geçerli sayfa">
                <span className="topbar-page-title" title={title}>
                    {title}
                </span>
            </div>

            <div className="topbar-right">
                <div className="topbar-right-extras">
                    <ExchangeRatesTicker />
                    <SystemHealthIndicator />
                </div>
                {alertCount > 0 && (
                    <Link
                        href="/dashboard/alerts"
                        aria-label={`${alertCount} aktif uyarı`}
                        style={{
                            height: "30px",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "0 11px",
                            border: "0.5px solid var(--danger-border)",
                            borderRadius: "7px",
                            background: "var(--danger-bg)",
                            color: "var(--danger-text)",
                            fontSize: "12px",
                            fontWeight: 650,
                            lineHeight: 1,
                            textDecoration: "none",
                            whiteSpace: "nowrap",
                            boxSizing: "border-box",
                        }}
                    >
                        <AlertTriangle size={14} strokeWidth={1.9} aria-hidden />
                        <span>{alertCount} Uyarı</span>
                    </Link>
                )}
                <UserAvatarLink />
            </div>
        </header>
    );
});

export default Topbar;
