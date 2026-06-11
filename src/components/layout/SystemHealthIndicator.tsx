"use client";

import { memo } from "react";
import { useSystemHealth } from "@/lib/shared-hooks";


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
    // Perf Faz 4: paylaşılan SWR hook'u — 5dk refreshInterval eski setInterval
    // davranışıyla birebir; her mount'ta sıfırdan fetch yerine dedup+cache.
    const { healthData, healthError } = useSystemHealth();
    const state: HealthState = healthError
        ? "degraded"
        : healthData === undefined
            ? "checking"
            : (isHealthPayload(healthData) && healthData.status === "ok" ? "ok" : "degraded");

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
