import type { CSSProperties, ReactNode } from "react";

export type BadgeTone = "success" | "neutral" | "danger" | "accent" | "warning";

interface ToneTokens {
    bg: string;
    text: string;
}

// Tema token çiftleri — renkte CSS var → data-theme ile otomatik temalanır.
const TONE_TOKENS: Record<BadgeTone, ToneTokens> = {
    success: { bg: "var(--success-bg)", text: "var(--success-text)" },
    danger: { bg: "var(--danger-bg)", text: "var(--danger-text)" },
    warning: { bg: "var(--warning-bg)", text: "var(--warning-text)" },
    accent: { bg: "var(--accent-bg)", text: "var(--accent-text)" },
    neutral: { bg: "var(--bg-tertiary)", text: "var(--text-secondary)" },
};

export interface BadgeProps {
    /** Renk tonu — durum/etiket anlamına göre. Default: neutral. */
    tone?: BadgeTone;
    children: ReactNode;
    style?: CSSProperties;
}

/**
 * Durum / etiket pill'i. Liste tablolarındaki tekrar eden inline rozet
 * stillerini tek yerden toplar (currency, aktif/pasif, durum vb.).
 */
export default function Badge({ tone = "neutral", children, style }: BadgeProps) {
    const tokens = TONE_TOKENS[tone];
    return (
        <span
            style={{
                display: "inline-block",
                fontSize: "11px",
                fontWeight: 500,
                padding: "2px 7px",
                borderRadius: "5px",
                background: tokens.bg,
                color: tokens.text,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                ...style,
            }}
        >
            {children}
        </span>
    );
}
