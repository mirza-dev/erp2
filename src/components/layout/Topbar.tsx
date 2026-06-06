"use client";

import { memo } from "react";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import ExchangeRatesTicker from "@/components/layout/ExchangeRatesTicker";
import SystemHealthIndicator from "@/components/layout/SystemHealthIndicator";
import ThemeToggle from "@/components/layout/ThemeToggle";
import UserAvatarLink from "@/components/layout/UserAvatarLink";
import RovenLogo from "@/components/layout/RovenLogo";
import { getTopbarTitle } from "@/lib/topbar-title";

interface TopbarProps {
    onToggleSidebar?: () => void;
}

const Topbar = memo(function Topbar({ onToggleSidebar }: TopbarProps) {
    const pathname = usePathname();
    const title = getTopbarTitle(pathname);

    return (
        <header className="topbar-shell">
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
                    <RovenLogo size={22} wordmarkSize={19} />
                </div>

                <span className="topbar-divider" aria-hidden="true" />

                <span className="topbar-page-title" title={title}>
                    {title}
                </span>
            </div>

            <div className="topbar-right">
                <div className="topbar-right-extras">
                    <ExchangeRatesTicker />
                    <SystemHealthIndicator />
                </div>
                <ThemeToggle />
                <UserAvatarLink />
            </div>
        </header>
    );
});

export default Topbar;
