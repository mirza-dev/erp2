"use client";

import type { CSSProperties } from "react";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";

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
                    <Button variant="secondary" size="xs" onClick={onRetry} disabled={retryDisabled}>
                        Yeniden dene
                    </Button>
                )}
                {onClose && (
                    <Button variant="ghost" size="xs" iconOnly onClick={onClose} aria-label="Banner'ı kapat">
                        <X size={14} aria-hidden />
                    </Button>
                )}
            </div>
        </div>
    );
}
