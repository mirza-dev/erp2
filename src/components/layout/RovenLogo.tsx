import React from "react";

interface RovenLogoProps {
    /** Hexagon mark kenar uzunluğu (px). Wordmark boyutu ayrıca verilmezse metin parent'tan miras alır. */
    size?: number;
    /** false → yalnız hexagon mark (ikon). Varsayılan true (mark + "Roven"). */
    showWordmark?: boolean;
    /** Wordmark fontSize override (px). Verilmezse parent fontSize'ı miras alınır. */
    wordmarkSize?: number;
    /** Mark ile wordmark arası boşluk (px). */
    gap?: number;
    className?: string;
}

const DEFAULT_GAP = 5;

/**
 * Roven marka logosu — yuvarlatılmış hexagon mark + bold wordmark.
 *
 * Tema-uyumlu: renk `currentColor`/`inherit` üzerinden gelir → koyu temada
 * near-white (`var(--text-primary)` = #e6edf3), aydınlık temada koyu (#1f2937).
 * Hexagon `<polygon>` + eş renkli round-linejoin stroke ile dış köşeleri yumuşatılır
 * (arc-path hesabı olmadan güvenilir yuvarlatma).
 */
export function RovenLogo({
    size = 20,
    showWordmark = true,
    wordmarkSize,
    gap = DEFAULT_GAP,
    className,
}: RovenLogoProps) {
    const mark = (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden={showWordmark ? true : undefined}
            role={showWordmark ? undefined : "img"}
            aria-label={showWordmark ? undefined : "Roven"}
            style={{ display: "block", flexShrink: 0 }}
        >
            <polygon
                points="12,2.8 19.97,7.4 19.97,16.6 12,21.2 4.03,16.6 4.03,7.4"
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinejoin="round"
            />
        </svg>
    );

    if (!showWordmark) {
        return (
            <span className={className} style={{ display: "inline-flex", color: "inherit" }}>
                {mark}
            </span>
        );
    }

    return (
        <span
            className={className}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: `${gap}px`,
                color: "inherit",
                lineHeight: 1,
            }}
        >
            {mark}
            <span
                style={{
                    fontWeight: 700,
                    fontSize: wordmarkSize ? `${wordmarkSize}px` : undefined,
                    color: "currentColor",
                    letterSpacing: 0,
                }}
            >
                Roven
            </span>
        </span>
    );
}

export default RovenLogo;
