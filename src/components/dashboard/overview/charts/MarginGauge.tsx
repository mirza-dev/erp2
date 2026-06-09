"use client";

interface MarginGaugeProps {
    value: number;
    size?: number;
    stroke?: number;
}

/** 270° açık yay — brüt marj göstergesi. */
export default function MarginGauge({ value, size = 132, stroke = 13 }: MarginGaugeProps) {
    const r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
    const SWEEP = 270, START = 135;
    const circ = 2 * Math.PI * r;
    const arcLen = (SWEEP / 360) * circ;
    const pct = Math.max(0, Math.min(100, value));
    const fill = (pct / 100) * arcLen;
    const tone = pct >= 25 ? "var(--success)" : pct >= 12 ? "var(--warning)" : "var(--danger)";
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }} role="img" aria-label={`Brüt marj %${pct.toFixed(0)}`}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke}
                strokeLinecap="round" strokeDasharray={`${arcLen} ${circ - arcLen}`}
                transform={`rotate(${START} ${cx} ${cy})`} />
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={tone} strokeWidth={stroke}
                strokeLinecap="round" strokeDasharray={`${fill} ${circ - fill}`}
                transform={`rotate(${START} ${cx} ${cy})`}
                style={{ transition: "stroke-dasharray .5s cubic-bezier(.4,0,.2,1)" }} />
            <text x={cx} y={cy - 2} textAnchor="middle" fontSize="27" fontWeight="700" fill="var(--text-primary)" className="mono">
                {pct.toFixed(0)}<tspan fontSize="15" fill="var(--text-tertiary)">%</tspan>
            </text>
            <text x={cx} y={cy + 16} textAnchor="middle" fontSize="9.5" fill="var(--text-tertiary)"
                style={{ letterSpacing: ".06em", textTransform: "uppercase" }}>Brüt Marj</text>
        </svg>
    );
}
