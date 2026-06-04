"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { DataProvider } from "@/lib/data-context";
import { PermissionProvider } from "@/lib/auth/use-permissions";
import { ToastProvider } from "@/components/ui/Toast";
import DemoBanner from "@/components/ui/DemoBanner";
import ForbiddenBanner from "@/components/ui/ForbiddenBanner";
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
        <DataProvider>
            <PermissionProvider>
            <ToastProvider>
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
                    <div className="topbar-wrapper" style={{ gridColumn: "1 / -1" }}>
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
                            background: "var(--bg-secondary)",
                            overflowX: "auto",
                            minWidth: 0,
                        }}
                    >
                        {isDemo && (
                            <DemoBanner storageKey="demo-readonly">
                                Demo modundasınız — değişiklik yapabilmek için{" "}
                                <Link
                                    href="/login"
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
                                background: "var(--bg-primary)",
                                borderRight: "0.5px solid var(--border-tertiary)",
                                overflowY: "auto",
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
    );
}
