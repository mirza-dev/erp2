"use client";

import { useState, useEffect, useRef } from "react";
import type { Tone } from "@/lib/dashboard-view-model";

/** Genişliği ResizeObserver ile ölçen hook (SSR-safe; default 640). */
export function useMeasure(): [React.RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement | null>(null);
    const [w, setW] = useState(640);
    useEffect(() => {
        if (!ref.current || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver((entries) => {
            const cw = entries[0].contentRect.width;
            if (cw > 0) setW(cw);
        });
        ro.observe(ref.current);
        return () => ro.disconnect();
    }, []);
    return [ref, w];
}

const TONE_VAR: Record<Tone, string> = {
    accent: "var(--accent)",
    success: "var(--success)",
    warning: "var(--warning)",
    danger: "var(--danger)",
    info: "var(--accent)",
};
const TONE_TEXT: Record<Tone, string> = {
    accent: "var(--accent-text)",
    success: "var(--success-text)",
    warning: "var(--warning-text)",
    danger: "var(--danger-text)",
    info: "var(--accent-text)",
};

export const toneVar = (t: Tone): string => TONE_VAR[t] ?? "var(--accent)";
export const toneText = (t: Tone): string => TONE_TEXT[t] ?? "var(--accent-text)";

/** Yumuşak (Catmull-Rom benzeri) SVG path. */
export function smoothPath(pts: [number, number][]): string {
    if (pts.length < 2) return "";
    let d = `M ${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        const cx = (x0 + x1) / 2;
        d += ` C ${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return d;
}
