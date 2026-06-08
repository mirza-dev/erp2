"use client";

import { useState } from "react";
import Button from "@/components/ui/Button";
import { SevBadge } from "./SevBadge";
import {
    SEVERITY_CONFIG, formatDateFull, isToday as calIsToday, sortOccurrences,
    type Occurrence,
} from "@/lib/alert-calendar";
import { ALERT_TYPE_LABEL } from "@/lib/alert-labels";

interface Props {
    selectedDate: Date | null;
    occurrences: Occurrence[];
    onDetail: (occ: Occurrence) => void;
    onDismiss: (id: string) => void;
}

/** Sağ kolon: seçili günün kronolojik zaman çizelgesi. */
export function DayDetailPanel({ selectedDate, occurrences, onDetail, onDismiss }: Props) {
    if (!selectedDate) {
        return (
            <div style={emptyWrap}>
                <CalendarIcon />
                <span style={{ fontSize: "13px" }}>Detayları görmek için bir gün seçin</span>
            </div>
        );
    }

    const today = calIsToday(selectedDate);
    const isPast = selectedDate < new Date(new Date().setHours(0, 0, 0, 0));
    const sorted = sortOccurrences(occurrences);

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{
                padding: "20px 20px 16px", borderBottom: "0.5px solid var(--border-tertiary)",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px",
            }}>
                <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                    <span style={{ fontSize: "15px", fontWeight: 650, color: "var(--text-primary)" }}>{formatDateFull(selectedDate)}</span>
                    {today && <Pill text="BUGÜN" accent />}
                    {!today && isPast && <Pill text="GEÇMİŞ" />}
                </div>
                <span style={{
                    fontSize: "12px", fontWeight: 700, padding: "2px 10px", borderRadius: "10px",
                    background: sorted.length > 0 ? "var(--danger-bg)" : "var(--bg-tertiary)",
                    color: sorted.length > 0 ? "var(--danger-text)" : "var(--text-tertiary)",
                    border: `0.5px solid ${sorted.length > 0 ? "var(--danger-border)" : "var(--border-secondary)"}`,
                }}>
                    {sorted.length} olay
                </span>
            </div>

            {sorted.length === 0 ? (
                <div style={emptyWrap}>
                    <span style={{ fontSize: "12px" }}>Bu gün için kayıt yok</span>
                </div>
            ) : (
                <div
                    key={selectedDate.toISOString().slice(0, 10)}
                    style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "10px" }}
                >
                    {sorted.map((occ, idx) => (
                        <div
                            key={occ.id + occ.occKind}
                            style={{
                                display: "flex", gap: "12px", alignItems: "stretch",
                                animation: "cal-fade-up 0.34s cubic-bezier(0.16,1,0.3,1) both",
                                animationDelay: `${idx * 55}ms`,
                            }}
                        >
                            <TimeRail occ={occ} isLast={idx === sorted.length - 1} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <AlertCard occ={occ} onDetail={onDetail} onDismiss={onDismiss} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function TimeRail({ occ, isLast }: { occ: Occurrence; isLast: boolean }) {
    const c = SEVERITY_CONFIG[occ.severity];
    const due = occ.occKind === "due";
    return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "46px", flexShrink: 0, paddingTop: "2px" }}>
            {due ? (
                <span style={{ fontSize: "10px", fontWeight: 700, color: c.text, textAlign: "center", lineHeight: 1.2 }}>◷<br />HEDEF</span>
            ) : (
                <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-secondary)", fontFamily: "var(--font-mono, monospace)" }}>{occ.time}</span>
            )}
            <span style={{
                width: "8px", height: "8px", borderRadius: "50%", marginTop: "8px", flexShrink: 0,
                background: due ? "transparent" : c.color,
                border: due ? `2px solid ${c.color}` : "none",
                boxShadow: due ? "none" : `0 0 0 3px ${c.bg}`,
            }} />
            {!isLast && <span style={{ flex: 1, width: "1.5px", background: "var(--border-tertiary)", marginTop: "4px", minHeight: "12px" }} />}
        </div>
    );
}

function AlertCard({ occ, onDetail, onDismiss }: { occ: Occurrence; onDetail: (o: Occurrence) => void; onDismiss: (id: string) => void }) {
    const [hov, setHov] = useState(false);
    const c = SEVERITY_CONFIG[occ.severity];
    const isResolved = occ.status === "resolved";

    return (
        <div
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            onClick={() => onDetail(occ)}
            style={{
                padding: "14px 16px", borderRadius: "8px",
                border: `0.5px solid ${hov ? c.border : "var(--border-tertiary)"}`,
                background: hov ? c.bg : "var(--surface-subtle)",
                cursor: "pointer", display: "flex", flexDirection: "column", gap: "8px",
                opacity: isResolved ? 0.55 : 1, transition: "background 0.14s, border-color 0.14s",
            }}
        >
            {occ.occKind === "due" && (
                <div style={{
                    display: "flex", alignItems: "center", gap: "7px", padding: "5px 9px", borderRadius: "6px", marginBottom: "2px",
                    background: c.bg, border: `1px dashed ${c.color}`, fontSize: "11px", fontWeight: 650, color: c.text,
                }}>
                    <span aria-hidden style={{ fontSize: "12px" }}>◷</span>
                    {(occ.dueLabel || "Hedef tarih")} — bu gün
                </div>
            )}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span style={{ fontSize: "10px", fontWeight: 650, letterSpacing: "0.03em", color: c.text, textTransform: "uppercase" }}>
                    {ALERT_TYPE_LABEL[occ.type] ?? occ.type}
                </span>
                <SevBadge severity={occ.severity} />
            </div>
            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", lineHeight: 1.4, textDecoration: isResolved ? "line-through" : "none" }}>
                {occ.product ? occ.product.name : (occ.orderCode || occ.title)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{occ.reason}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginTop: "2px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: c.text, padding: "2px 8px", borderRadius: "4px", background: c.bg, border: `0.5px solid ${c.border}` }}>
                    {occ.impact}
                </span>
                {occ.product && <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono, monospace)" }}>{occ.product.sku}</span>}
            </div>
            <div style={{ display: "flex", gap: "8px", marginTop: "6px" }} onClick={(e) => e.stopPropagation()}>
                <Button variant="secondary" size="xs" onClick={() => onDetail(occ)}>Detay</Button>
                {!isResolved && <Button variant="ghost" size="xs" onClick={() => onDismiss(occ.id)}>Yoksay</Button>}
            </div>
        </div>
    );
}

function Pill({ text, accent }: { text: string; accent?: boolean }) {
    return (
        <span style={{
            fontSize: "10px", fontWeight: accent ? 700 : 650, letterSpacing: "0.04em",
            padding: "2px 8px", borderRadius: "10px",
            background: accent ? "var(--accent-bg)" : "var(--bg-tertiary)",
            color: accent ? "var(--accent-text)" : "var(--text-tertiary)",
            border: `0.5px solid ${accent ? "var(--accent-border)" : "var(--border-tertiary)"}`,
        }}>
            {text}
        </span>
    );
}

const emptyWrap: React.CSSProperties = {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
    gap: "10px", color: "var(--text-tertiary)", padding: "40px", minHeight: "200px",
};

function CalendarIcon() {
    return (
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );
}
