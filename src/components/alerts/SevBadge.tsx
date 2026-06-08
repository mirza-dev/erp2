import type { CSSProperties } from "react";
import type { AlertSeverity } from "@/lib/database.types";
import { SEVERITY_CONFIG } from "@/lib/alert-calendar";

/** Küçük severity rozeti (KRİTİK / UYARI / BİLGİ). */
export function SevBadge({ severity, style }: { severity: AlertSeverity; style?: CSSProperties }) {
    const c = SEVERITY_CONFIG[severity];
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                fontSize: "9px",
                fontWeight: 700,
                letterSpacing: "0.06em",
                padding: "2px 7px",
                borderRadius: "3px",
                background: c.bg,
                color: c.text,
                border: `0.5px solid ${c.border}`,
                flexShrink: 0,
                lineHeight: 1.4,
                ...style,
            }}
        >
            {c.label}
        </span>
    );
}
