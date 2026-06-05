"use client";

import { memo, useEffect, useState } from "react";

const REFRESH_MS = 5 * 60 * 1000;

type HealthState = "checking" | "ok" | "degraded";

function isHealthPayload(value: unknown): value is { status: "ok" | "degraded" } {
    if (!value || typeof value !== "object") return false;
    const status = (value as { status?: unknown }).status;
    return status === "ok" || status === "degraded";
}

function metaForState(state: HealthState) {
    if (state === "ok") {
        return {
            label: "Bağlı",
            aria: "Sistem durumu: Bağlı",
            color: "var(--success-text)",
        };
    }
    if (state === "degraded") {
        return {
            label: "Sorun var",
            aria: "Sistem durumu: Sorun var",
            color: "var(--danger-text)",
        };
    }
    return {
        label: "Kontrol",
        aria: "Sistem durumu kontrol ediliyor",
        color: "var(--text-tertiary)",
    };
}

const SystemHealthIndicator = memo(function SystemHealthIndicator() {
    const [state, setState] = useState<HealthState>("checking");

    useEffect(() => {
        let cancelled = false;

        async function loadHealth() {
            try {
                const response = await fetch("/api/health");
                if (!response.ok) {
                    if (!cancelled) setState("degraded");
                    return;
                }
                const payload: unknown = await response.json();
                if (!cancelled) setState(isHealthPayload(payload) && payload.status === "ok" ? "ok" : "degraded");
            } catch {
                if (!cancelled) setState("degraded");
            }
        }

        void loadHealth();
        const timer = window.setInterval(() => { void loadHealth(); }, REFRESH_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);

    const meta = metaForState(state);

    return (
        <div
            aria-label={meta.aria}
            title={meta.aria}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                color: meta.color,
                fontSize: "12px",
                fontWeight: 600,
                lineHeight: 1,
                whiteSpace: "nowrap",
            }}
        >
            <span
                aria-hidden
                style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    background: meta.color,
                    flexShrink: 0,
                    animation: state === "checking" ? "pulse-dot 1.4s ease-in-out infinite" : undefined,
                }}
            />
            <span>{meta.label}</span>
        </div>
    );
});

export default SystemHealthIndicator;
