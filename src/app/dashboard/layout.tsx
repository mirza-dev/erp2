"use client";

import Sidebar from "@/components/layout/Sidebar";
import Topbar from "@/components/layout/Topbar";
import { DataProvider } from "@/lib/data-context";

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <DataProvider>
            <div
                className="min-h-screen"
                style={{
                    display: "grid",
                    gridTemplateColumns: "200px 1fr",
                    gridTemplateRows: "52px 1fr",
                }}
            >
                {/* Topbar — spans full width */}
                <div style={{ gridColumn: "1 / -1" }}>
                    <Topbar />
                </div>

                {/* Sidebar */}
                <Sidebar />

                {/* Main content */}
                <main
                    className="overflow-auto"
                    style={{
                        padding: "18px",
                        background: "var(--bg-secondary)",
                    }}
                >
                    {children}
                </main>
            </div>
        </DataProvider>
    );
}
