"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

interface ToastItem {
    id: number;
    type: ToastType;
    message: string;
    leaving?: boolean;
}

interface ToastContextValue {
    toast: (opts: { type: ToastType; message: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

const ICONS: Record<ToastType, string> = {
    success: "\u2713",
    error: "\u2717",
    warning: "\u26A0",
    info: "\u2139",
};

const COLORS: Record<ToastType, { bg: string; border: string; text: string }> = {
    success: { bg: "var(--success-bg)", border: "var(--success)", text: "var(--success-text)" },
    error: { bg: "var(--danger-bg)", border: "var(--danger)", text: "var(--danger-text)" },
    warning: { bg: "var(--warning-bg)", border: "var(--warning)", text: "var(--warning-text)" },
    info: { bg: "var(--accent-bg)", border: "var(--accent)", text: "var(--accent-text)" },
};

const DURATIONS: Record<ToastType, number> = {
    success: 3000,
    info: 3000,
    warning: 5000,
    error: 5000,
};

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    const removeToast = useCallback((id: number) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, leaving: true } : t));
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 200);
    }, []);

    const toast = useCallback(({ type, message }: { type: ToastType; message: string }) => {
        const id = ++nextId;
        setToasts(prev => {
            const next = [...prev, { id, type, message }];
            return next.length > 3 ? next.slice(-3) : next;
        });
        setTimeout(() => removeToast(id), DURATIONS[type]);
    }, [removeToast]);

    return (
        <ToastContext.Provider value={{ toast }}>
            {children}
            <ToastContainer toasts={toasts} onDismiss={removeToast} />
        </ToastContext.Provider>
    );
}

function ToastContainer({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
    if (toasts.length === 0) return null;

    return (
        <div style={{
            position: "fixed",
            top: "64px",
            right: "16px",
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            maxWidth: "360px",
            width: "100%",
            pointerEvents: "none",
        }}>
            {toasts.map(t => (
                <ToastItem key={t.id} item={t} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: number) => void }) {
    const colors = COLORS[item.type];

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                background: colors.bg,
                borderLeft: `3px solid ${colors.border}`,
                borderRadius: "6px",
                border: `0.5px solid ${colors.border}`,
                borderLeftWidth: "3px",
                animation: item.leaving ? "toast-out 0.2s ease-in forwards" : "toast-in 0.2s ease-out",
                pointerEvents: "auto",
                backdropFilter: "blur(8px)",
            }}
        >
            <span style={{
                fontSize: "14px",
                color: colors.text,
                flexShrink: 0,
                fontWeight: 700,
            }}>
                {ICONS[item.type]}
            </span>
            <span style={{
                fontSize: "13px",
                color: colors.text,
                flex: 1,
                lineHeight: 1.4,
            }}>
                {item.message}
            </span>
            <button
                onClick={() => onDismiss(item.id)}
                style={{
                    background: "none",
                    border: "none",
                    color: colors.text,
                    cursor: "pointer",
                    fontSize: "14px",
                    padding: "2px",
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

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within ToastProvider");
    return ctx;
}
