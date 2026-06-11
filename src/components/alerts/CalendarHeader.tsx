"use client";

import Button from "@/components/ui/Button";
import { MONTH_NAMES_TR, type CalendarStats } from "@/lib/alert-calendar";
import { NotebookPen } from "lucide-react";

interface Props {
    year: number;
    month: number;
    onPrev: () => void;
    onNext: () => void;
    onToday: () => void;
    stats: CalendarStats;
    onRefresh: () => void;
    refreshing: boolean;
    onAiSuggest: () => void;
    aiGenerating: boolean;
    /** Uyarılardan bağımsız takvim notu formunu açar. */
    onAddNote: () => void;
}

function StatNum({ value, color, label }: { value: number; color: string; label: string }) {
    return (
        <span style={{ display: "inline-flex", alignItems: "baseline", gap: "4px" }}>
            <span style={{ fontWeight: 700, fontSize: "15px", color }}>{value}</span>
            <span>{label}</span>
        </span>
    );
}

/** Takvim başlığı: ay gezinme + istatistikler + Tara (scan) + AI Analiz (ai-suggest). */
export function CalendarHeader({
    year, month, onPrev, onNext, onToday, stats, onRefresh, refreshing, onAiSuggest, aiGenerating, onAddNote,
}: Props) {
    return (
        <div
            style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "4px 4px 16px", gap: "12px", flexWrap: "wrap",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Button variant="icon" size="md" iconOnly aria-label="Önceki ay" onClick={onPrev}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Button>
                <span style={{ fontSize: "18px", fontWeight: 650, color: "var(--text-primary)", minWidth: "170px", textAlign: "center" }}>
                    {MONTH_NAMES_TR[month]} {year}
                </span>
                <Button variant="icon" size="md" iconOnly aria-label="Sonraki ay" onClick={onNext}>
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </Button>
                <Button variant="secondary" size="md" onClick={onToday}>Bugün</Button>
            </div>

            <div style={{ display: "flex", gap: "14px", alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", fontSize: "13px", color: "var(--text-secondary)" }}>
                    <StatNum value={stats.total}    color="var(--text-primary)" label="toplam" />
                    <StatNum value={stats.critical} color="var(--danger)"       label="kritik" />
                    <StatNum value={stats.warning}  color="var(--warning)"      label="uyarı" />
                    <StatNum value={stats.resolved} color="var(--success)"      label="çözülen" />
                </div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <Button variant="secondary" size="md" onClick={onAddNote} title="Takvime not ekle" leftIcon={<NotebookPen size={14} />}>
                        Not Ekle
                    </Button>
                    <Button
                        variant="secondary" size="md" onClick={onAiSuggest} disabled={aiGenerating}
                        title="AI ile risk analizi öner"
                    >
                        {aiGenerating ? "Analiz..." : "✦ AI Analiz"}
                    </Button>
                    <Button
                        variant="primary" size="md" onClick={onRefresh} disabled={refreshing}
                        leftIcon={
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden
                                style={{ animation: refreshing ? "spin 0.8s linear infinite" : "none" }}>
                                <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        }
                    >
                        {refreshing ? "Taranıyor..." : "Tara"}
                    </Button>
                </div>
            </div>
        </div>
    );
}
