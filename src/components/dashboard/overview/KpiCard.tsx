"use client";

import { useState } from "react";
import type { DashboardKpi } from "@/lib/dashboard-view-model";
import Sparkline from "./charts/Sparkline";

/** Sağ-üst köşe oku (hover'da accent). */
function ArrowIcon({ active }: { active: boolean }) {
    return (
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true"
            style={{ color: active ? "var(--accent-text)" : "var(--text-tertiary)", marginTop: 1, transition: "color .14s" }}>
            <path d="M5 11L11 5M11 5H6M11 5V10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/** Trend oku (up; down'da dikey aynalanır). */
function TrendingIcon({ up }: { up: boolean }) {
    return (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"
            style={{ transform: up ? "none" : "scaleY(-1)" }}>
            <path d="M1.5 11L6 6.5L9 9.5L14.5 4M14.5 4H10.5M14.5 4V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

/** KPI kartı — tasarıma sadık: ok ikonu + değer + trend delta + sub + opsiyonel sparkline. */
export default function KpiCard({ kpi }: { kpi: DashboardKpi }) {
    const [hov, setHov] = useState(false);
    const danger = kpi.tone === "danger";
    const sparkTone = kpi.tone === "danger" ? "danger" : kpi.tone === "warning" ? "warning" : kpi.tone === "success" ? "success" : "accent";
    return (
        <div
            className="r-card"
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                padding: "13px 14px", position: "relative", cursor: "pointer",
                borderColor: hov ? "var(--accent-border)" : "var(--surface-border)",
                background: hov ? "var(--surface-subtle)" : "var(--surface-raised)",
                transition: "border-color .14s, background .14s",
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{kpi.label}</span>
                <ArrowIcon active={hov} />
            </div>
            <div className="mono" style={{
                fontSize: 21, fontWeight: 650, letterSpacing: "-0.02em", marginTop: 6,
                color: danger ? "var(--danger-text)" : "var(--text-primary)",
            }}>
                {kpi.value}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
                <div style={{ minWidth: 0 }}>
                    {kpi.delta && (
                        <div style={{
                            fontSize: 11, fontWeight: 600,
                            color: kpi.up ? "var(--success-text)" : "var(--danger-text)",
                            display: "inline-flex", alignItems: "center", gap: 3,
                        }}>
                            <TrendingIcon up={!!kpi.up} />{kpi.delta}
                        </div>
                    )}
                    {kpi.sub && (
                        <div style={{
                            fontSize: 10.5, color: "var(--text-tertiary)", marginTop: 2,
                            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                            {kpi.sub}
                        </div>
                    )}
                </div>
                {kpi.spark && kpi.spark.length >= 2 && (
                    <Sparkline data={kpi.spark} tone={sparkTone} w={72} h={30} />
                )}
            </div>
        </div>
    );
}
