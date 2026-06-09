"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import OverviewPanel, { Dot } from "./OverviewPanel";
import { toneVar } from "./charts/chart-utils";
import { aiPointsFromOpsSummary } from "@/lib/dashboard-view-model";

interface OpsSummaryResponse {
    ai_available: boolean;
    summary: string;
    insights: string[];
    anomalies: string[];
    generatedAt: string;
}

const CACHE_KEY = "kokpit_ops_summary";
const CACHE_TTL_MS = 15 * 60 * 1000;

function readCache(): OpsSummaryResponse | null {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const entry = JSON.parse(raw) as { data: OpsSummaryResponse; cachedAt: number };
        if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
        return entry.data;
    } catch { return null; }
}
function writeCache(data: OpsSummaryResponse) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, cachedAt: Date.now() })); } catch { /* non-fatal */ }
}

type State = "idle" | "loading" | "loaded" | "error";

/** AI Operasyon Özeti — collapsible; açılınca lazy fetch (headline + 2-kolon tonlu maddeler). */
export default function AiPanel() {
    const [state, setState] = useState<State>("idle");
    const [data, setData] = useState<OpsSummaryResponse | null>(null);

    const fetchSummary = useCallback(async (bypassCache = false) => {
        if (!bypassCache) {
            const cached = readCache();
            if (cached) { setData(cached); setState("loaded"); return; }
        }
        setState("loading");
        try {
            const res = await fetch("/api/ai/ops-summary", { method: "POST" });
            if (!res.ok) throw new Error("API error");
            const result = await res.json() as OpsSummaryResponse;
            setData(result);
            if (result.summary) { writeCache(result); setState("loaded"); }
            else setState("error");
        } catch {
            setState("error");
        }
    }, []);

    const onToggle = useCallback((open: boolean) => {
        if (open && state === "idle") fetchSummary();
    }, [state, fetchSummary]);

    const timeStr = data?.generatedAt
        ? new Date(data.generatedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })
        : null;
    const view = data ? aiPointsFromOpsSummary(data.summary, data.insights, data.anomalies) : null;

    return (
        <OverviewPanel
            title="AI Operasyon Özeti"
            sub={timeStr ? `Bugün ${timeStr}'de oluşturuldu` : "Açmak için tıklayın"}
            collapsible
            defaultOpen={false}
            onToggle={onToggle}
            actions={<span className="badge badge-info" style={{ fontSize: 10 }}>AI</span>}
        >
            {state === "loading" && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0" }}>
                    <div style={{ width: 14, height: 14, border: "2px solid var(--accent)", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>AI analizi yükleniyor…</span>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            )}

            {state === "error" && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "4px 0" }}>
                    <span style={{ fontSize: 12, color: "var(--warning-text)" }}>AI servisi yanıt vermedi.</span>
                    <button onClick={() => fetchSummary(true)} style={{
                        fontSize: 11, padding: "4px 10px", border: "1px solid var(--border-secondary)",
                        borderRadius: 5, background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                    }}>Tekrar dene</button>
                </div>
            )}

            {state === "loaded" && view && (
                <>
                    {view.headline && (
                        <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-primary)", fontWeight: 500, marginBottom: 12 }}>
                            {view.headline}
                        </div>
                    )}
                    {view.points.length > 0 && (
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "9px 22px" }}>
                            {view.points.map((p, i) => (
                                <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                                    <span style={{ marginTop: 5, flexShrink: 0 }}><Dot tone={toneVar(p.tone)} /></span>
                                    <span style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>{p.text}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <Link href="/dashboard/alerts" style={{ textDecoration: "none", display: "block", marginTop: 14 }}>
                        <span style={{
                            display: "block", textAlign: "center", width: "100%", padding: "8px", fontSize: 12, fontWeight: 600,
                            background: "var(--surface-subtle)", border: "1px solid var(--border-secondary)",
                            borderRadius: 6, color: "var(--text-secondary)", cursor: "pointer",
                        }}>Tüm analizi gör</span>
                    </Link>
                </>
            )}
        </OverviewPanel>
    );
}
