"use client";

import Link from "next/link";
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes, type CSSProperties, type ComponentProps, type ReactNode } from "react";

type Variant = "primary" | "secondary" | "dangerSoft" | "danger" | "success" | "ghost" | "toolbar" | "icon";
type Size = "xs" | "sm" | "md" | "lg" | "cta";

type ButtonBaseProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    variant?: Variant;
    size?: Size;
    loading?: boolean;
    fullWidth?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
};

type TextButtonProps = ButtonBaseProps & {
    iconOnly?: false;
    children: ReactNode;
};

type IconOnlyButtonProps = ButtonBaseProps & {
    iconOnly: true;
    "aria-label": string;
    children?: ReactNode;
};

export type ButtonProps = TextButtonProps | IconOnlyButtonProps;

type ButtonLinkBaseProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "href"> & {
    href: ComponentProps<typeof Link>["href"];
    variant?: Variant;
    size?: Size;
    fullWidth?: boolean;
    leftIcon?: ReactNode;
    rightIcon?: ReactNode;
    disabled?: boolean;
};

type TextButtonLinkProps = ButtonLinkBaseProps & {
    iconOnly?: false;
    children: ReactNode;
};

type IconOnlyButtonLinkProps = ButtonLinkBaseProps & {
    iconOnly: true;
    "aria-label": string;
    children?: ReactNode;
};

export type ButtonLinkProps = TextButtonLinkProps | IconOnlyButtonLinkProps;

type VariantStyle = {
    bg: string;
    border: string;
    color: string;
    hoverBg: string;
    hoverBorder?: string;
    hoverColor?: string;
    shadow?: string;
    hoverShadow?: string;
};

const VARIANT_STYLES: Record<Variant, VariantStyle> = {
    primary: {
        bg: "var(--button-primary-bg)",
        border: "var(--button-primary-border)",
        color: "#ffffff",
        hoverBg: "var(--button-primary-bg-hover)",
        hoverBorder: "var(--button-primary-border-hover)",
        shadow: "var(--button-primary-shadow)",
        hoverShadow: "var(--button-primary-shadow-hover)",
    },
    secondary: {
        bg: "var(--button-secondary-bg)",
        border: "var(--button-secondary-border)",
        color: "var(--text-primary)",
        hoverBg: "var(--button-secondary-bg-hover)",
        hoverBorder: "var(--button-secondary-border-hover)",
        shadow: "var(--button-secondary-shadow)",
        hoverShadow: "var(--button-secondary-shadow-hover)",
    },
    dangerSoft: {
        bg: "var(--button-danger-soft-bg)",
        border: "var(--button-danger-soft-border)",
        color: "var(--button-danger-soft-text)",
        hoverBg: "var(--button-danger-soft-bg-hover)",
        hoverBorder: "var(--button-danger-soft-border-hover)",
        shadow: "var(--button-danger-soft-shadow)",
        hoverShadow: "var(--button-danger-soft-shadow-hover)",
    },
    danger: {
        bg: "var(--button-danger-bg)",
        border: "var(--button-danger-border)",
        color: "#ffffff",
        hoverBg: "var(--button-danger-bg-hover)",
        hoverBorder: "var(--button-danger-border-hover)",
        shadow: "var(--button-danger-shadow)",
        hoverShadow: "var(--button-danger-shadow-hover)",
    },
    success: {
        bg: "var(--success-bg)",
        border: "var(--success-border)",
        color: "var(--success-text)",
        hoverBg: "var(--success-bg-strong)",
        hoverBorder: "var(--success)",
    },
    ghost: {
        bg: "transparent",
        border: "transparent",
        color: "var(--text-secondary)",
        hoverBg: "var(--bg-tertiary)",
        hoverColor: "var(--text-primary)",
    },
    toolbar: {
        bg: "transparent",
        border: "var(--border-secondary)",
        color: "var(--text-secondary)",
        hoverBg: "var(--highlight-inset)",
        hoverBorder: "var(--border-primary)",
        hoverColor: "var(--text-primary)",
    },
    icon: {
        bg: "transparent",
        border: "var(--border-tertiary)",
        color: "var(--text-secondary)",
        hoverBg: "var(--bg-tertiary)",
        hoverBorder: "var(--border-secondary)",
        hoverColor: "var(--text-primary)",
    },
};

const SIZE_STYLES: Record<Size, { fontSize: string; height: number; padding: string; gap: number; minWidth?: number; iconSize: number }> = {
    xs: { fontSize: "11px", height: 26, padding: "0 9px", gap: 5, iconSize: 13 },
    sm: { fontSize: "12px", height: 32, padding: "0 12px", gap: 6, iconSize: 14 },
    md: { fontSize: "13px", height: 36, padding: "0 16px", gap: 7, iconSize: 15 },
    lg: { fontSize: "14px", height: 40, padding: "0 20px", gap: 8, minWidth: 118, iconSize: 16 },
    cta: { fontSize: "14px", height: 40, padding: "0 20px", gap: 8, minWidth: 124, iconSize: 15 },
};

function getButtonStyle({
    variant,
    size,
    fullWidth,
    iconOnly,
    disabled,
    style,
}: {
    variant: Variant;
    size: Size;
    fullWidth?: boolean;
    iconOnly?: boolean;
    disabled?: boolean;
    style?: CSSProperties;
}): CSSProperties {
    const v = VARIANT_STYLES[variant];
    const s = SIZE_STYLES[size];

    return {
        minHeight: `${s.height}px`,
        height: `${s.height}px`,
        // fullWidth flex satırında shrink edebilsin diye min-content tabanı da sıfırlanır
        minWidth: iconOnly ? `${s.height}px` : fullWidth ? 0 : s.minWidth ? `${s.minWidth}px` : undefined,
        width: fullWidth ? "100%" : iconOnly ? `${s.height}px` : undefined,
        padding: iconOnly ? 0 : s.padding,
        border: `var(--line-width) solid ${v.border}`,
        borderRadius: "8px",
        background: v.bg,
        color: v.color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.56 : 1,
        fontSize: s.fontSize,
        fontWeight: variant === "primary" || variant === "danger" ? 650 : 560,
        letterSpacing: 0,
        lineHeight: 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: `${s.gap}px`,
        whiteSpace: "nowrap",
        textDecoration: "none",
        userSelect: "none",
        // fullWidth (width:100%) bir flex SATIRINDA yan yana kullanılınca
        // shrink edebilmeli — aksi halde 2×%100 taşar (Dosyalar/Not modal
        // İptal|Yükle satırı). Diğer butonlarda toolbar sıkışmasını önlemek
        // için 0 kalır.
        flexShrink: fullWidth ? 1 : 0,
        boxShadow: disabled ? "none" : v.shadow,
        transition: "background 0.14s ease, border-color 0.14s ease, color 0.14s ease, box-shadow 0.14s ease, opacity 0.14s ease",
        ...style,
    };
}

function iconWrapperStyle(size: Size): CSSProperties {
    const iconSize = SIZE_STYLES[size].iconSize;
    return {
        width: `${iconSize}px`,
        height: `${iconSize}px`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flex: `0 0 ${iconSize}px`,
    };
}

function applyHover(el: HTMLElement, variant: Variant, isDisabled: boolean, active: boolean) {
    if (isDisabled) return;
    const v = VARIANT_STYLES[variant];
    el.style.background = active ? v.hoverBg : v.bg;
    el.style.borderColor = active ? (v.hoverBorder ?? v.border) : v.border;
    el.style.color = active ? (v.hoverColor ?? v.color) : v.color;
    el.style.boxShadow = active ? (v.hoverShadow ?? v.shadow ?? "none") : (v.shadow ?? "none");
}

function applyFocus(el: HTMLElement, isDisabled: boolean, active: boolean) {
    if (isDisabled) return;
    el.style.outline = active ? "2px solid var(--accent-border)" : "none";
    el.style.outlineOffset = active ? "2px" : "0";
}

function renderButtonContent({
    children,
    iconOnly,
    leftIcon,
    loading,
    rightIcon,
    size,
}: {
    children?: ReactNode;
    iconOnly?: boolean;
    leftIcon?: ReactNode;
    loading?: boolean;
    rightIcon?: ReactNode;
    size: Size;
}) {
    if (iconOnly) {
        if (loading) return <span className="spinner" style={{ width: "13px", height: "13px", borderWidth: "1.5px" }} />;
        if (leftIcon) return <span aria-hidden="true" style={iconWrapperStyle(size)}>{leftIcon}</span>;
        return <>{children}</>;
    }

    return (
        <>
            {loading ? (
                <span className="spinner" style={{ width: "13px", height: "13px", borderWidth: "1.5px" }} />
            ) : leftIcon ? (
                <span aria-hidden="true" style={iconWrapperStyle(size)}>{leftIcon}</span>
            ) : null}
            {children}
            {rightIcon && !loading && <span aria-hidden="true" style={iconWrapperStyle(size)}>{rightIcon}</span>}
        </>
    );
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
    variant = "primary",
    size = "sm",
    loading = false,
    fullWidth = false,
    disabled = false,
    iconOnly = false,
    leftIcon,
    rightIcon,
    children,
    style,
    type = "button",
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    ...rest
}, ref) {
    const isDisabled = disabled || loading;

    return (
        <button
            ref={ref}
            disabled={isDisabled}
            type={type}
            style={getButtonStyle({ variant, size, fullWidth, iconOnly, disabled: isDisabled, style })}
            onMouseEnter={(e) => {
                applyHover(e.currentTarget, variant, isDisabled, true);
                onMouseEnter?.(e);
            }}
            onMouseLeave={(e) => {
                applyHover(e.currentTarget, variant, isDisabled, false);
                onMouseLeave?.(e);
            }}
            onFocus={(e) => {
                applyFocus(e.currentTarget, isDisabled, true);
                onFocus?.(e);
            }}
            onBlur={(e) => {
                applyFocus(e.currentTarget, isDisabled, false);
                onBlur?.(e);
            }}
            {...rest}
        >
            {renderButtonContent({ children, iconOnly, leftIcon, loading, rightIcon, size })}
        </button>
    );
});

export default Button;

export function ButtonLink({
    variant = "primary",
    size = "sm",
    fullWidth = false,
    disabled = false,
    iconOnly = false,
    leftIcon,
    rightIcon,
    children,
    style,
    onClick,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    href,
    ...rest
}: ButtonLinkProps) {
    return (
        <Link
            href={href}
            {...rest}
            aria-disabled={disabled || rest["aria-disabled"] || undefined}
            tabIndex={disabled ? -1 : rest.tabIndex}
            style={getButtonStyle({ variant, size, fullWidth, iconOnly, disabled, style })}
            onClick={(e) => {
                if (disabled) {
                    e.preventDefault();
                    return;
                }
                onClick?.(e);
            }}
            onMouseEnter={(e) => {
                applyHover(e.currentTarget, variant, disabled, true);
                onMouseEnter?.(e);
            }}
            onMouseLeave={(e) => {
                applyHover(e.currentTarget, variant, disabled, false);
                onMouseLeave?.(e);
            }}
            onFocus={(e) => {
                applyFocus(e.currentTarget, disabled, true);
                onFocus?.(e);
            }}
            onBlur={(e) => {
                applyFocus(e.currentTarget, disabled, false);
                onBlur?.(e);
            }}
        >
            {renderButtonContent({ children, iconOnly, leftIcon, rightIcon, size })}
        </Link>
    );
}
