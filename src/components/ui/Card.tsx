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
                background: "var(--bg-primary)",
                border: "0.5px solid var(--border-tertiary)",
                borderRadius: "8px",
                overflow: "hidden",
                ...style,
            }}
        >
            {children}
        </div>
    );
}
