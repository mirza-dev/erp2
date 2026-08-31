import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface CardProps extends HTMLAttributes<HTMLElement> {
    children: ReactNode;
    style?: CSSProperties;
    /**
     * Anlamsal etiket. Varsayılan `div`.
     *
     * Neden gerekli: bir kart aynı zamanda landmark olabiliyor — Veri Aktarım
     * Merkezi'ndeki "Excel şablonları" bloğu `<section aria-label>` olmak
     * zorunda. Bu kol olmadan o yüzeyler kartı ELLE örüyor ve yüzey token'ları
     * ayrışıyordu (2026-08-31 tespiti).
     */
    as?: "div" | "section" | "article" | "aside";
}

/**
 * Yuvarlatılmış kenarlı içerik kapsayıcısı. Liste tabloları, panel blokları vb.
 * tekrar eden "bordered surface" stilini tek yerden toplar.
 */
export default function Card({ children, style, as: Tag = "div", ...rest }: CardProps) {
    return (
        <Tag
            style={{
                background: "var(--surface-raised)",
                border: "var(--line-width) solid var(--surface-border)",
                borderRadius: "8px",
                boxShadow: "var(--surface-shadow-sm)",
                overflow: "hidden",
                ...style,
            }}
            {...rest}
        >
            {children}
        </Tag>
    );
}
