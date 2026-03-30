"use client";

import { useEffect, useRef } from "react";

interface AIDetailDrawerProps {
    open: boolean;
    onClose: () => void;
    title?: string;
    children: React.ReactNode;
}

/**
 * Generic AI detail drawer — slides in from right.
 * Handles: ESC key, backdrop click, focus management (store → restore).
 * Used by: products, purchase/suggested, orders/[id]
 */
export default function AIDetailDrawer({
    open,
    onClose,
    title = "AI Analizi",
    children,
}: AIDetailDrawerProps) {
    const closeBtnRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    // ESC to close + Tab focus trap
    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") { onClose(); return; }
            if (e.key === "Tab") {
                const panel = panelRef.current;
                if (!panel) return;
                const focusable = panel.querySelectorAll<HTMLElement>(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey) {
                    if (document.activeElement === first) { e.preventDefault(); last.focus(); }
                } else {
                    if (document.activeElement === last) { e.preventDefault(); first.focus(); }
                }
            }
        }
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    // Focus close button on open; restore previous focus on close
    useEffect(() => {
        if (!open) return;
        const prev = document.activeElement;
        closeBtnRef.current?.focus();
        return () => {
            if (prev instanceof HTMLElement) prev.focus();
        };
    }, [open]);

    if (!open) return null;

    return (
        <>
            {/* Backdrop */}
            <div
                aria-hidden="true"
                onClick={onClose}
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 200,
                    background: "rgba(0,0,0,0.45)",
                }}
            />

            {/* Drawer panel */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                style={{
                    position: "fixed",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 201,
                    width: "min(400px, 100vw)",
                    background: "var(--bg-primary)",
                    borderLeft: "0.5px solid var(--border-secondary)",
                    boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
                    display: "flex",
                    flexDirection: "column",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "16px 20px",
                        borderBottom: "0.5px solid var(--border-tertiary)",
                        flexShrink: 0,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span
                            style={{
                                fontSize: "9px",
                                fontWeight: 700,
                                letterSpacing: "0.06em",
                                textTransform: "uppercase",
                                background: "var(--accent-bg)",
                                color: "var(--accent-text)",
                                padding: "2px 6px",
                                borderRadius: "3px",
                            }}
                        >
                            ✦ AI
                        </span>
                        <span
                            style={{
                                fontSize: "14px",
                                fontWeight: 600,
                                color: "var(--text-primary)",
                            }}
                        >
                            {title}
                        </span>
                    </div>
                    <button
                        ref={closeBtnRef}
                        onClick={onClose}
                        aria-label="Kapat"
                        style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            color: "var(--text-tertiary)",
                            fontSize: "20px",
                            lineHeight: 1,
                            padding: "4px 8px",
                            borderRadius: "4px",
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Scrollable content */}
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "20px",
                    }}
                >
                    {children}
                </div>
            </div>
        </>
    );
}
