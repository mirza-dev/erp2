"use client";

import type { CSSProperties } from "react";

interface AiUnavailableBannerProps {
    message: string;
    onRetry?: () => void;
    retryDisabled?: boolean;
    onClose?: () => void;
    style?: CSSProperties;
}

export function AiUnavailableBanner({ message, onRetry, retryDisabled, onClose, style }: AiUnavailableBannerProps) {
    return (
        <div
            role="status"
            style={{
                padding: "10px 14px",
                border: "0.5px solid var(--warning-border)",
                borderRadius: "6px",
                background: "var(--warning-bg)",
                color: "var(--warning-text)",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "12px",
                ...style,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "14px", flexShrink: 0 }}>⚠</span>
                <span>{message}</span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexShrink: 0 }}>
                {onRetry && (
                    <button
                        onClick={onRetry}
                        disabled={retryDisabled}
                        style={{
                            fontSize: "11px",
                            padding: "4px 10px",
                            border: "0.5px solid var(--warning-border)",
                            borderRadius: "4px",
                            background: "transparent",
                            color: "var(--warning-text)",
                            cursor: retryDisabled ? "not-allowed" : "pointer",
                            opacity: retryDisabled ? 0.6 : 1,
                            whiteSpace: "nowrap",
                        }}
                    >
                        Yeniden dene
                    </button>
                )}
                {onClose && (
                    <button
                        onClick={onClose}
                        aria-label="Banner'ı kapat"
                        style={{
                            fontSize: "14px",
                            padding: "0 6px",
                            border: "none",
                            background: "transparent",
                            color: "var(--warning-text)",
                            cursor: "pointer",
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                )}
            </div>
        </div>
    );
}
