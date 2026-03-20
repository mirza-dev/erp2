"use client";

import { ReactNode } from "react";
import Button from "./Button";

/* ============================================
   EmptyState
   ============================================ */

interface EmptyStateProps {
    title: string;
    description?: string;
    action?: { label: string; onClick: () => void };
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            textAlign: "center",
        }}>
            <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--bg-tertiary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "12px",
                fontSize: "20px",
                color: "var(--text-tertiary)",
            }}>
                &#9776;
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                {title}
            </div>
            {description && (
                <div style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "320px" }}>
                    {description}
                </div>
            )}
            {action && (
                <div style={{ marginTop: "16px" }}>
                    <Button variant="primary" onClick={action.onClick}>{action.label}</Button>
                </div>
            )}
        </div>
    );
}

/* ============================================
   LoadingState
   ============================================ */

interface LoadingStateProps {
    message?: string;
}

export function LoadingState({ message = "Yükleniyor..." }: LoadingStateProps) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            gap: "12px",
        }}>
            <span className="spinner" style={{ width: "24px", height: "24px", borderWidth: "2.5px" }} />
            <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                {message}
            </div>
        </div>
    );
}

/* ============================================
   ErrorState
   ============================================ */

interface ErrorStateProps {
    message?: string;
    onRetry?: () => void;
}

export function ErrorState({ message = "Bir hata oluştu.", onRetry }: ErrorStateProps) {
    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 24px",
            textAlign: "center",
        }}>
            <div style={{
                width: "48px",
                height: "48px",
                borderRadius: "50%",
                background: "var(--danger-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "12px",
                fontSize: "20px",
                color: "var(--danger-text)",
            }}>
                !
            </div>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--danger-text)", marginBottom: "4px" }}>
                Hata
            </div>
            <div style={{ fontSize: "13px", color: "var(--text-tertiary)", maxWidth: "320px", marginBottom: "16px" }}>
                {message}
            </div>
            {onRetry && (
                <Button variant="secondary" onClick={onRetry}>Tekrar Dene</Button>
            )}
        </div>
    );
}
