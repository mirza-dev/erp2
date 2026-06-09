"use client";

import { useState, useCallback } from "react";
import { useMeasure, smoothPath } from "./chart-utils";

interface TrendChartProps {
    months: string[];
    revenue: number[];
    cost?: number[];
    orders?: number[];
    currency?: string | null;
    showCost?: boolean;
}

function compact(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${Math.round(v / 1e3)}K`;
    return String(Math.round(v));
}

function TipRow({ k, v, c }: { k: string; v: string | number; c: string }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11.5, lineHeight: 1.7 }}>
            <span style={{ color: "var(--text-tertiary)" }}>{k}</span>
            <span className="mono" style={{ color: c, fontWeight: 600 }}>{v}</span>
        </div>
    );
}

/** Ciro (& opsiyonel maliyet) trendi — alan + çizgi + hover tooltip + crosshair. */
export default function TrendChart({
    months, revenue, cost = [], orders = [], currency = null, showCost = false,
}: TrendChartProps) {
    const [ref, W] = useMeasure();
    const H = 250, padL = 52, padR = 14, padT = 14, padB = 26;
    const iw = Math.max(W - padL - padR, 10), ih = H - padT - padB;
    const useCost = showCost && cost.length === revenue.length;
    const all = useCost ? revenue.concat(cost) : revenue;
    const maxV = Math.max(...all, 1) * 1.08, minV = 0;
    const n = Math.max(revenue.length, 1);
    const x = (i: number) => padL + (i / Math.max(n - 1, 1)) * iw;
    const y = (v: number) => padT + ih - ((v - minV) / (maxV - minV)) * ih;
    const rPts: [number, number][] = revenue.map((v, i) => [x(i), y(v)]);
    const cPts: [number, number][] = cost.map((v, i) => [x(i), y(v)]);
    const rLine = smoothPath(rPts);
    const cLine = smoothPath(cPts);
    const rArea = rPts.length >= 2
        ? `${rLine} L ${rPts[rPts.length - 1][0]},${padT + ih} L ${rPts[0][0]},${padT + ih} Z`
        : "";
    const ticks = 4;
    const cur = currency ? ` ${currency}` : "";
    const [hover, setHover] = useState<number | null>(null);

    const onMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        let idx = Math.round(((mx - padL) / iw) * (n - 1));
        idx = Math.max(0, Math.min(n - 1, idx));
        setHover(idx);
    }, [iw, n]);

    return (
        <div ref={ref} style={{ position: "relative", width: "100%" }}>
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} onMouseLeave={() => setHover(null)}
                style={{ display: "block", cursor: "crosshair" }} role="img" aria-label="Ciro trendi">
                <defs>
                    <linearGradient id="trend-rev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                    </linearGradient>
                </defs>
                {Array.from({ length: ticks + 1 }).map((_, i) => {
                    const v = (maxV / ticks) * i;
                    const yy = y(v);
                    return (
                        <g key={i}>
                            <line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="var(--chart-grid)" strokeWidth="1" />
                            <text x={padL - 8} y={yy + 3} textAnchor="end" fontSize="10" fill="var(--text-tertiary)" className="mono">
                                {compact(v)}
                            </text>
                        </g>
                    );
                })}
                {rArea && <path d={rArea} fill="url(#trend-rev)" />}
                {useCost && <path d={cLine} fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5"
                    strokeDasharray="4 3" strokeLinecap="round" opacity="0.85" />}
                <path d={rLine} fill="none" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                {months.map((m, i) => (
                    <text key={`${m}-${i}`} x={x(i)} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--text-tertiary)">{m}</text>
                ))}
                {hover != null && rPts[hover] && (
                    <g>
                        <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + ih} stroke="var(--accent-border)" strokeWidth="1" opacity="0.5" />
                        {useCost && cPts[hover] && <circle cx={x(hover)} cy={y(cost[hover])} r="3.5" fill="var(--surface-raised)" stroke="var(--text-tertiary)" strokeWidth="1.5" />}
                        <circle cx={x(hover)} cy={y(revenue[hover])} r="4" fill="var(--accent)" stroke="var(--surface-raised)" strokeWidth="1.5" />
                    </g>
                )}
            </svg>
            {hover != null && revenue[hover] != null && (
                <div style={{
                    position: "absolute", left: Math.min(Math.max(x(hover) - 70, 4), W - 148), top: 6,
                    width: 144, pointerEvents: "none",
                    background: "var(--surface-raised)", border: "1px solid var(--surface-border)",
                    borderRadius: 7, boxShadow: "var(--surface-shadow)", padding: "8px 10px",
                }}>
                    <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 5 }}>{months[hover]}</div>
                    <TipRow k="Ciro" v={`${compact(revenue[hover])}${cur}`} c="var(--accent-text)" />
                    {useCost && cost[hover] != null && <TipRow k="Maliyet" v={`${compact(cost[hover])}${cur}`} c="var(--text-secondary)" />}
                    {useCost && cost[hover] != null && <TipRow k="Kâr" v={`${compact(revenue[hover] - cost[hover])}${cur}`} c="var(--success-text)" />}
                    {orders[hover] != null && <TipRow k="Sipariş" v={orders[hover]} c="var(--text-secondary)" />}
                </div>
            )}
        </div>
    );
}
