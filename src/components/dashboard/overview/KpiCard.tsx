"use client";

import Link from "next/link";
import {
    ArrowUpRight,
    TrendingUp,
} from "lucide-react";
import type { DashboardKpi } from "@/lib/dashboard-view-model";
import Sparkline from "./charts/Sparkline";

/** Kompakt executive KPI kartı. */
export default function KpiCard({ kpi }: { kpi: DashboardKpi }) {
    const danger = kpi.tone === "danger";
    const sparkTone = kpi.tone === "danger" ? "danger" : kpi.tone === "warning" ? "warning" : kpi.tone === "success" ? "success" : "accent";
    const subColor = kpi.subTone === "warning"
        ? "var(--warning-text)"
        : kpi.subTone === "danger" ? "var(--danger-text)" : "var(--text-tertiary)";
    const body = (
        <>
            <div className="kpi-card-head">
                <span className="kpi-card-label">{kpi.label}</span>
                {kpi.href && <ArrowUpRight className="kpi-card-link-icon" size={13} strokeWidth={1.8} aria-hidden="true" />}
            </div>
            <div className="kpi-card-value-row">
                <div className="kpi-card-value mono" style={{ color: danger ? "var(--danger-text)" : "var(--text-primary)" }}>
                    {kpi.value}
                </div>
                {kpi.spark && kpi.spark.length >= 2 && (
                    <span className="kpi-card-spark">
                        <Sparkline data={kpi.spark} tone={sparkTone} w={58} h={24} />
                    </span>
                )}
            </div>
            <div className="kpi-card-footer">
                {kpi.delta && (
                    <div className="kpi-card-delta" style={{ color: kpi.up ? "var(--success-text)" : "var(--danger-text)" }}>
                        <TrendingUp
                            size={12}
                            strokeWidth={1.9}
                            aria-hidden="true"
                            style={{ transform: kpi.up ? "none" : "scaleY(-1)" }}
                        />
                        {kpi.delta}
                    </div>
                )}
                {kpi.sub && (
                    <div
                        className="kpi-card-sub"
                        title={kpi.sub}
                        style={{ color: subColor, fontWeight: kpi.subTone ? 600 : undefined }}
                    >
                        {kpi.sub}
                    </div>
                )}
            </div>
        </>
    );

    if (kpi.href) {
        return (
            <Link
                href={kpi.href}
                aria-label={`${kpi.label}: ${kpi.value}`}
                className="r-card kpi-card"
                onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest", inline: "nearest" })}
            >
                {body}
            </Link>
        );
    }
    return (
        <div
            className="r-card kpi-card"
        >
            {body}
        </div>
    );
}
