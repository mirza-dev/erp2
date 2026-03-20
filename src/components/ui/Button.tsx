"use client";

import { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";
type Size = "sm" | "md";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    fullWidth?: boolean;
    children: ReactNode;
}

const VARIANT_STYLES: Record<Variant, { bg: string; border: string; color: string; hoverBg: string }> = {
    primary: {
        bg: "var(--accent-bg)",
        border: "var(--accent-border)",
        color: "var(--accent-text)",
        hoverBg: "rgba(56, 139, 253, 0.25)",
    },
    secondary: {
        bg: "transparent",
        border: "var(--border-secondary)",
        color: "var(--text-secondary)",
        hoverBg: "var(--bg-tertiary)",
    },
    danger: {
        bg: "var(--danger-bg)",
        border: "var(--danger-border)",
        color: "var(--danger-text)",
        hoverBg: "rgba(248, 81, 73, 0.25)",
    },
    ghost: {
        bg: "transparent",
        border: "transparent",
        color: "var(--text-secondary)",
        hoverBg: "var(--bg-tertiary)",
    },
};

const SIZE_STYLES: Record<Size, { fontSize: string; padding: string }> = {
    sm: { fontSize: "12px", padding: "6px 14px" },
    md: { fontSize: "13px", padding: "8px 18px" },
};

export default function Button({
    variant = "primary",
    size = "sm",
    loading = false,
    fullWidth = false,
    disabled = false,
    children,
    style,
    onMouseEnter,
    onMouseLeave,
    ...rest
}: ButtonProps) {
    const v = VARIANT_STYLES[variant];
    const s = SIZE_STYLES[size];
    const isDisabled = disabled || loading;

    return (
        <button
            disabled={isDisabled}
            style={{
                fontSize: s.fontSize,
                padding: s.padding,
                border: `0.5px solid ${v.border}`,
                borderRadius: "6px",
                background: v.bg,
                color: v.color,
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.5 : 1,
                fontWeight: 500,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                whiteSpace: "nowrap",
                width: fullWidth ? "100%" : undefined,
                transition: "background 0.1s",
                ...style,
            }}
            onMouseEnter={(e) => {
                if (!isDisabled) {
                    e.currentTarget.style.background = v.hoverBg;
                }
                onMouseEnter?.(e);
            }}
            onMouseLeave={(e) => {
                if (!isDisabled) {
                    e.currentTarget.style.background = v.bg;
                }
                onMouseLeave?.(e);
            }}
            {...rest}
        >
            {loading && <span className="spinner" style={{ width: "12px", height: "12px", borderWidth: "1.5px" }} />}
            {children}
        </button>
    );
}
