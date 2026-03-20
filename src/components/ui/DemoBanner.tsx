"use client";

import { useState, ReactNode } from "react";

interface DemoBannerProps {
    children?: ReactNode;
    storageKey?: string;
}

export default function DemoBanner({
    children = "Bu sayfa demo verileriyle çalışmaktadır. Backend entegrasyonu yakında.",
    storageKey,
}: DemoBannerProps) {
    const [dismissed, setDismissed] = useState(() => {
        if (typeof window === "undefined" || !storageKey) return false;
        try { return sessionStorage.getItem(`demo-${storageKey}`) === "1"; } catch { return false; }
    });

    if (dismissed) return null;

    const handleDismiss = () => {
        setDismissed(true);
        if (storageKey) {
            try { sessionStorage.setItem(`demo-${storageKey}`, "1"); } catch { /* noop */ }
        }
    };

    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "7px 14px",
            background: "var(--accent-bg)",
            border: "0.5px solid var(--accent-border)",
            borderRadius: "6px",
            marginBottom: "16px",
            fontSize: "12px",
            color: "var(--accent-text)",
        }}>
            <span style={{ flexShrink: 0, fontSize: "13px" }}>&#8505;</span>
            <span style={{ flex: 1 }}>{children}</span>
            <button
                onClick={handleDismiss}
                style={{
                    background: "none",
                    border: "none",
                    color: "var(--accent-text)",
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "0 2px",
                    opacity: 0.6,
                    flexShrink: 0,
                    lineHeight: 1,
                }}
            >
                ×
            </button>
        </div>
    );
}
