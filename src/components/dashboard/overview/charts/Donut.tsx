"use client";

import { useRef, useState } from "react";
import { currencySymbol } from "@/lib/dashboard-view-model";

export interface DonutSegment {
    name: string;
    value: number;
    color: string;
}

interface DonutProps {
    data: DonutSegment[];
    size?: number;
    stroke?: number;
    /** Merkez metninde gösterilecek para birimi kodu (örn. "TRY"). */
    currency?: string | null;
}

function compact(v: number): string {
    const a = Math.abs(v);
    if (a >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${Math.round(v / 1e3)}K`;
    return String(Math.round(v));
}

/** Dokunma sonrası tarayıcının ürettiği "ghost" mouse event'lerini yok sayma penceresi. */
const TOUCH_GHOST_MS = 700;

/** Donut grafik — hover (masaüstü) / dokunma-toggle (mobil) segment vurgusu + merkez toplam.
 *  Mobil bug'ı: dokunma `mouseenter` üretir ama `mouseleave` HİÇ gelmez → vurgu takılı
 *  kalıyordu (merkezde "$3K · 1%" donuk). Çözüm: dokunma `pointerdown`da TOGGLE edilir
 *  (aynı segmente tekrar dokun → toplam); dokunmayı izleyen ghost mouse event'leri
 *  kısa pencere boyunca yok sayılır (yoksa ghost mouseenter seçimi geri ezer). */
export default function Donut({ data, size = 148, stroke = 19, currency = null }: DonutProps) {
    const total = data.reduce((s, d) => s + d.value, 0);
    const r = (size - stroke) / 2, cx = size / 2, cy = size / 2;
    const circ = 2 * Math.PI * r;
    const [hover, setHover] = useState<number | null>(null);
    const lastTouchAt = useRef(0);
    const ghostMouse = () => Date.now() - lastTouchAt.current < TOUCH_GHOST_MS;
    const fracs = data.map((d) => (total > 0 ? d.value / total : 0));
    const segs = data.map((d, i) => {
        const off = fracs.slice(0, i).reduce((a, b) => a + b, 0);
        return { d, i, frac: fracs[i], off, dash: fracs[i] * circ };
    });
    const active = hover != null ? data[hover] : null;
    const sym = currency ? currencySymbol(currency) : "";
    return (
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }} role="img" aria-label="Stok dağılımı"
            onMouseLeave={() => { if (!ghostMouse()) setHover(null); }}>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--chart-track)" strokeWidth={stroke} />
            {segs.map((s) => (
                <circle key={s.i} cx={cx} cy={cy} r={r} fill="none"
                    stroke={s.d.color} strokeWidth={hover === s.i ? stroke + 3 : stroke}
                    strokeDasharray={`${s.dash} ${circ - s.dash}`}
                    strokeDashoffset={-s.off * circ}
                    transform={`rotate(-90 ${cx} ${cy})`}
                    style={{ transition: "stroke-width .15s", opacity: hover == null || hover === s.i ? 1 : 0.4, cursor: "pointer" }}
                    onPointerDown={(e) => {
                        if (e.pointerType === "touch") {
                            lastTouchAt.current = Date.now();
                            setHover(h => (h === s.i ? null : s.i));
                        }
                    }}
                    onMouseEnter={() => { if (!ghostMouse()) setHover(s.i); }}
                    onMouseLeave={() => { if (!ghostMouse()) setHover(null); }} />
            ))}
            <text x={cx} y={cy - 3} textAnchor="middle" fontSize="16" fontWeight="650" fill="var(--text-primary)" className="mono">
                {sym}{active ? compact(active.value) : compact(total)}
            </text>
            <text x={cx} y={cy + 13} textAnchor="middle" fontSize="9.5" fill="var(--text-tertiary)">
                {active ? `${total > 0 ? Math.round((active.value / total) * 100) : 0}%` : "toplam"}
            </text>
        </svg>
    );
}
