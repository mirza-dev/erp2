"use client";

import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { DataProvider } from "@/lib/data-context";
import { ToastProvider } from "@/components/ui/Toast";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const [sidebarOpen, setSidebarOpen] = useState(false);

    return (
        <DataProvider>
            <ToastProvider>
                <div
                    className="dashboard-grid"
                    style={{
                        minHeight: "100vh",
                        display: "grid",
                        gridTemplateColumns: "200px 1fr",
                        gridTemplateRows: "52px 1fr",
                    }}
                >
                    {/* Topbar — spans full width */}
                    <div style={{ gridColumn: "1 / -1" }}>
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
                        {children}
                    </main>
                </div>

                {/* Sidebar — mobile drawer */}
                {sidebarOpen && (
                    <>
                        <div
                            className="sidebar-mobile-backdrop"
                            onClick={() => setSidebarOpen(false)}
                            style={{
                                position: "fixed",
                                inset: 0,
                                top: "52px",
                                background: "rgba(0,0,0,0.5)",
                                zIndex: 99,
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
        </DataProvider>
    );
}
