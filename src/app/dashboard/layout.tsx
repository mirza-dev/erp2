"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { DataProvider } from "@/lib/data-context";
import { PermissionProvider } from "@/lib/auth/use-permissions";
import { ToastProvider } from "@/components/ui/Toast";
import { ServiceWorkerUpdatePrompt } from "@/components/ServiceWorkerUpdatePrompt";
import { ThemeProvider } from "@/lib/theme/use-theme";
import DemoBanner from "@/components/ui/DemoBanner";
import RealtimeSyncBridge from "@/components/layout/RealtimeSyncBridge";
import TelemetryBridge from "@/components/layout/TelemetryBridge";
import ForbiddenBanner from "@/components/ui/ForbiddenBanner";
import OfflineBanner from "@/components/ui/OfflineBanner";
import { isDemoMode, clearDemoMode } from "@/lib/demo-utils";
import { useRouter } from "next/navigation";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isDemo] = useState(() => isDemoMode());
    const { push } = useRouter();

    const handleLoginFromDemo = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();
        // Demo cookie'yi login öncesi temizle — login sayfasında auth flow başlasa da
        // ortada demo cookie kalmasın, kullanıcı vazgeçerse stale cookie kalmasın
        clearDemoMode();
        push("/login");
    };

    return (
        <ThemeProvider>
        <DataProvider>
            {/* Başka kullanıcıların değişikliklerini bu sekmeye canlı yansıtır.
                SWRConfig sınırının İÇİNDE olmak zorunda — hiçbir şey çizmez. */}
            <RealtimeSyncBridge />
            {/* Developer Console RUM toplayıcısı — global fetch'i sarar,
                hiçbir şey çizmez. Kapsam bilinçli olarak dashboard. */}
            <TelemetryBridge />
            <PermissionProvider>
            <ToastProvider>
                <ServiceWorkerUpdatePrompt />
                <div
                    className="dashboard-grid"
                    style={{
                        minHeight: "100vh",
                        display: "grid",
                        gridTemplateColumns: "var(--sidebar-width) 1fr",
                        gridTemplateRows: "52px 1fr",
                    }}
                >
                    {/* Topbar — spans full width */}
                    {/* 2026-09-04 (§A7): `minWidth: 0` — `<main>`dekiyle AYNI sebep ve
                        artık simetrik. Izgara kolonunun otomatik minimumu `auto`dur:
                        kolon, çocuklarının MIN-CONTENT'iyle taban alır. Üst bardaki
                        sayfa başlığı `white-space: nowrap` taşıyor ve `overflow: hidden`
                        min-content'i KÜÇÜLTMEZ → başlık ne kadar uzunsa kolon o kadar
                        genişliyordu ve üç noktalı kısaltma hiç devreye girmiyordu.
                        Ölçüm (390px): "Excel Aktarım Sihirbazı" → gövde 396px = 6px
                        taşma; 360px'te beş rota 371–396px. `min-width: 0` ile kolon
                        görüntü alanında kalıyor, başlık tasarlandığı gibi kısalıyor. */}
                    <div className="topbar-wrapper" style={{ gridColumn: "1 / -1", minWidth: 0 }}>
                        <Topbar onToggleSidebar={() => setSidebarOpen(prev => !prev)} />
                    </div>

                    {/* Sidebar — desktop (grid cell) */}
                    <div className="sidebar-desktop">
                        <Sidebar />
                    </div>

                    {/* Main content */}
                    <main
                        style={{
                            padding: "18px",
                            background: "var(--app-bg)",
                            overflowX: "auto",
                            minWidth: 0,
                        }}
                    >
                        {/* Çevrimdışı bandı demo bandının ÜSTÜNDE: bağlantı yoksa
                            kullanıcının önce bunu görmesi gerekir. */}
                        <OfflineBanner />
                        {isDemo && (
                            <DemoBanner storageKey="demo-readonly">
                                Demo modundasınız — değişiklik yapabilmek için{" "}
                                <Link
                                    href="/login"
                                    className="tap-44-v"
                                    onClick={handleLoginFromDemo}
                                    style={{ color: "var(--accent-text)", textDecoration: "underline" }}
                                >
                                    giriş yapın
                                </Link>.
                            </DemoBanner>
                        )}
                        <Suspense fallback={null}>
                            <ForbiddenBanner />
                        </Suspense>
                        {children}
                    </main>
                </div>

                {/* Sidebar — mobile drawer */}
                {sidebarOpen && (
                    <>
                        <button
                            type="button"
                            className="sidebar-mobile-backdrop"
                            aria-label="Menüyü kapat"
                            onClick={() => setSidebarOpen(false)}
                            style={{
                                position: "fixed",
                                inset: 0,
                                top: "52px",
                                background: "rgba(0,0,0,0.5)",
                                zIndex: 99,
                                border: 0,
                                padding: 0,
                                cursor: "pointer",
                            }}
                        />
                        <div
                            className="sidebar-mobile-drawer"
                            style={{
                                position: "fixed",
                                top: "52px",
                                left: 0,
                                bottom: 0,
                                width: "240px",
                                zIndex: 100,
                                background: "var(--shell-bg)",
                                borderRight: "var(--line-width) solid var(--shell-border)",
                                boxShadow: "var(--shell-shadow)",
                                overflowY: "auto",
                                // iOS standalone: çekmece bottom:0'a kadar iner ve son
                                // öğeler ana ekran çizgisinin altında kalırdı.
                                paddingBottom: "env(safe-area-inset-bottom)",
                                animation: "fade-in 0.15s ease-out",
                            }}
                        >
                            <Sidebar onNavigate={() => setSidebarOpen(false)} />
                        </div>
                    </>
                )}
            </ToastProvider>
            </PermissionProvider>
        </DataProvider>
        </ThemeProvider>
    );
}
