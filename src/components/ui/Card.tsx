import type { CSSProperties, ReactNode } from "react";

export interface CardProps {
    children: ReactNode;
    style?: CSSProperties;
}

/**
 * Yuvarlatılmış kenarlı içerik kapsayıcısı. Liste tabloları, panel blokları vb.
 * tekrar eden "bordered surface" stilini tek yerden toplar.
 */
export default function Card({ children, style }: CardProps) {
    return (
        <div
            style={{
                background: "var(--surface-raised)",
                border: "var(--line-width) solid var(--surface-border)",
                borderRadius: "8px",
                boxShadow: "var(--surface-shadow-sm)",
                overflow: "hidden",
                ...style,
            }}
        >
            {children}
        </div>
    );
}
