"use client";

import type { Tone } from "@/lib/dashboard-view-model";
import { toneVar, smoothPath } from "./chart-utils";

interface SparklineProps {
    data: number[];
    tone?: Tone;
    fill?: boolean;
    h?: number;
    w?: number;
}

/** Küçük trend çizgisi (saf SVG, dış dep yok). */
export default function Sparkline({ data, tone = "accent", fill = true, h = 34, w = 96 }: SparklineProps) {
    if (data.length < 2) return null;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const rng = max - min || 1;
    const pad = 3;
    const pts: [number, number][] = data.map((v, i) => [
        pad + (i / (data.length - 1)) * (w - pad * 2),
        h - pad - ((v - min) / rng) * (h - pad * 2),
    ]);
    const line = smoothPath(pts);
    const area = `${line} L ${pts[pts.length - 1][0]},${h} L ${pts[0][0]},${h} Z`;
    const c = toneVar(tone);
    const gid = `spark-${tone}-${Math.round(w)}`;
    return (
        <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "block", overflow: "visible" }} role="img" aria-label="Trend">
            <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={c} stopOpacity="0.28" />
                    <stop offset="100%" stopColor={c} stopOpacity="0" />
                </linearGradient>
            </defs>
            {fill && <path d={area} fill={`url(#${gid})`} />}
            <path d={line} fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.2" fill={c} />
        </svg>
    );
}
