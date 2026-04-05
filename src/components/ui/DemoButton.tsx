"use client";

interface DemoButtonProps {
    variant?: "button" | "link";
}

/**
 * Navigates to /api/auth/demo (server route) which sets the demo cookie
 * and redirects to /dashboard. Using a plain <a> avoids React event-system
 * issues when browser translation (e.g. Google Translate) is active.
 */
export default function DemoButton({ variant = "button" }: DemoButtonProps) {
    if (variant === "link") {
        return (
            <a
                href="/api/auth/demo"
                style={{
                    fontSize: "12px",
                    color: "var(--text-tertiary)",
                    textDecoration: "underline",
                    cursor: "pointer",
                }}
            >
                Demo ile gezin
            </a>
        );
    }

    return (
        <a
            href="/api/auth/demo"
            style={{
                fontSize: "13px",
                padding: "9px 22px",
                border: "0.5px solid var(--border-secondary)",
                color: "var(--text-secondary)",
                borderRadius: "7px",
                background: "transparent",
                cursor: "pointer",
                textDecoration: "none",
                display: "inline-block",
            }}
        >
            Demo Gez
        </a>
    );
}
