"use client";

import { enterDemoMode } from "@/lib/demo-utils";

interface DemoButtonProps {
    variant?: "button" | "link";
}

export default function DemoButton({ variant = "button" }: DemoButtonProps) {
    if (variant === "link") {
        return (
            <button
                onClick={enterDemoMode}
                style={{
                    background: "none",
                    border: "none",
                    fontSize: "12px",
                    color: "var(--text-tertiary)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    padding: 0,
                }}
            >
                Demo ile gezin
            </button>
        );
    }

    return (
        <button
            onClick={enterDemoMode}
            style={{
                fontSize: "13px",
                padding: "9px 22px",
                border: "0.5px solid var(--border-secondary)",
                color: "var(--text-secondary)",
                borderRadius: "7px",
                background: "transparent",
                cursor: "pointer",
            }}
        >
            Demo Gez
        </button>
    );
}
