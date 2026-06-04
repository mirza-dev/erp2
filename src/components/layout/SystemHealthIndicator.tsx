"use client";

import { memo, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, LoaderCircle } from "lucide-react";

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
            icon: CheckCircle2,
            color: "var(--success-text)",
            border: "var(--success-border)",
            background: "var(--success-bg)",
        };
    }
    if (state === "degraded") {
        return {
            label: "Sorun var",
            aria: "Sistem durumu: Sorun var",
            icon: AlertTriangle,
            color: "var(--danger-text)",
            border: "var(--danger-border)",
            background: "var(--danger-bg)",
        };
    }
    return {
        label: "Kontrol",
        aria: "Sistem durumu kontrol ediliyor",
        icon: LoaderCircle,
        color: "var(--text-tertiary)",
        border: "var(--border-tertiary)",
        background: "var(--bg-secondary)",
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
    const Icon = meta.icon;

    return (
        <div
            aria-label={meta.aria}
            title={meta.aria}
            style={{
                height: "28px",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "0 8px",
                border: `0.5px solid ${meta.border}`,
                borderRadius: "7px",
                background: meta.background,
                color: meta.color,
                fontSize: "12px",
                fontWeight: 650,
                lineHeight: 1,
                whiteSpace: "nowrap",
                boxSizing: "border-box",
            }}
        >
            <Icon
                size={14}
                strokeWidth={1.9}
                aria-hidden
                style={{
                    flexShrink: 0,
                    animation: state === "checking" ? "spin 1s linear infinite" : undefined,
                }}
            />
            <span>{meta.label}</span>
        </div>
    );
});

export default SystemHealthIndicator;
