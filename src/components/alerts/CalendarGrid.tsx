"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Building2, LockKeyhole, NotebookText } from "lucide-react";
import {
    DAY_NAMES_TR, SEVERITY_CONFIG,
    getMonthDays, getOccurrencesForDate, sortOccurrences,
    isSameDate, isToday as calIsToday, formatDateShort, eventLabel,
    type Occurrence,
} from "@/lib/alert-calendar";
import { getCalendarNotesForDate, type CalendarNote } from "@/lib/calendar-notes";

interface GridProps {
    year: number;
    month: number;
    occurrences: Occurrence[];
    notes?: CalendarNote[];
    selectedDate: Date | null;
    onSelectDate: (d: Date) => void;
}

/** Aylık takvim ızgarası (Pzt-başı, 35/42 hücre). */
export function CalendarGrid({ year, month, occurrences, notes = [], selectedDate, onSelectDate }: GridProps) {
    const days = useMemo(() => getMonthDays(year, month), [year, month]);

    return (
        <div
            key={`${year}-${month}`}
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                gap: 0,
                animation: "cal-fade 0.28s cubic-bezier(0.16,1,0.3,1)",
            }}
        >
            {DAY_NAMES_TR.map((d) => (
                <div key={d} style={{
                    textAlign: "center", padding: "8px 0", fontSize: "11px", fontWeight: 650,
                    color: "var(--text-tertiary)", letterSpacing: "0.04em", textTransform: "uppercase",
                }}>
                    {d}
                </div>
            ))}
            {days.map((day, i) => (
                <DayCell
                    key={i}
                    date={day.date}
                    current={day.current}
                    occurrences={getOccurrencesForDate(occurrences, day.date)}
                    notes={getCalendarNotesForDate(notes, day.date)}
                    isSelected={!!selectedDate && isSameDate(day.date, selectedDate)}
                    isToday={calIsToday(day.date)}
                    onClick={() => onSelectDate(day.date)}
                />
            ))}
        </div>
    );
}

interface CellProps {
    date: Date;
    current: boolean;
    occurrences: Occurrence[];
    notes: CalendarNote[];
    isSelected: boolean;
    isToday: boolean;
    onClick: () => void;
}

function DayCell({ date, current, occurrences, notes, isSelected, isToday, onClick }: CellProps) {
    const [hov, setHov] = useState(false);
    const [pop, setPop] = useState<{ x: number; y: number; above: boolean } | null>(null);
    const cellRef = useRef<HTMLButtonElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const sorted = useMemo(() => sortOccurrences(occurrences), [occurrences]);
    const has = sorted.length > 0 || notes.length > 0;
    const preview = sorted.slice(0, 2);
    const notePreview = notes.slice(0, Math.max(0, 2 - preview.length));
    const extra = sorted.length + notes.length - preview.length - notePreview.length;

    const openPop = () => {
        if (!cellRef.current || !has) return;
        const r = cellRef.current.getBoundingClientRect();
        const above = r.top > 220;
        setPop({ x: r.left + r.width / 2, y: above ? r.top - 8 : r.bottom + 8, above });
    };
    const handleEnter = () => {
        setHov(true);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(openPop, 260);
    };
    const handleLeave = () => {
        setHov(false);
        if (timerRef.current) clearTimeout(timerRef.current);
        setPop(null);
    };
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

    const barStyle = (occ: Occurrence): CSSProperties => {
        const c = SEVERITY_CONFIG[occ.severity];
        const due = occ.occKind === "due";
        return {
            display: "flex", alignItems: "center", gap: "3px",
            padding: "2px 5px", borderRadius: "4px",
            background: due ? "transparent" : c.bg,
            border: due ? `1px dashed ${c.color}` : "0px solid transparent",
            borderLeft: `2px ${due ? "dashed" : "solid"} ${c.color}`,
            fontSize: "9.5px", fontWeight: 600, color: c.text,
            fontStyle: due ? "italic" : "normal",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            lineHeight: 1.45, maxWidth: "100%",
        };
    };

    const cellLabel = `${date.getDate()} — ${sorted.length} uyarı, ${notes.length} not`;

    return (
        <button
            ref={cellRef}
            type="button"
            onClick={onClick}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
            aria-label={cellLabel}
            aria-pressed={isSelected}
            style={{
                position: "relative", minWidth: 0,
                display: "flex", flexDirection: "column", alignItems: "stretch", justifyContent: "flex-start",
                gap: "4px", padding: "8px 7px 7px", minHeight: "94px",
                border: "none", borderTop: "0.5px solid var(--border-tertiary)",
                borderRadius: 0, cursor: "pointer", textAlign: "left",
                background: isSelected ? "var(--accent-bg)" : hov ? "var(--bg-tertiary)" : "transparent",
                opacity: current ? 1 : 0.32,
                boxShadow: isSelected ? "inset 0 0 0 1.5px var(--accent-border)" : "none",
                transition: "background 0.12s, box-shadow 0.12s",
            }}
        >
            <span style={{
                width: "26px", height: "26px", lineHeight: "26px", textAlign: "center",
                fontSize: "13px", fontWeight: isToday ? 700 : 540, borderRadius: "50%",
                alignSelf: "center", flexShrink: 0,
                color: isToday ? "#fff" : isSelected ? "var(--accent-text)" : "var(--text-primary)",
                background: isToday ? "var(--accent)" : "transparent",
            }}>
                {date.getDate()}
            </span>
            {has && (
                <div style={{ display: "flex", flexDirection: "column", gap: "3px", minWidth: 0 }}>
                    {preview.map((occ) => (
                        <span
                            key={occ.id + occ.occKind}
                            style={barStyle(occ)}
                            title={(occ.occKind === "due" ? `${occ.dueLabel || "Hedef"}: ` : "") + eventLabel(occ)}
                        >
                            {occ.occKind === "due" && <span aria-hidden style={{ flexShrink: 0, opacity: 0.85 }}>◷</span>}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{eventLabel(occ)}</span>
                        </span>
                    ))}
                    {notePreview.map((note) => (
                        <span
                            key={note.id}
                            title={note.title}
                            style={{
                                display: "flex", alignItems: "center", gap: "4px", minWidth: 0,
                                padding: "2px 5px", borderRadius: "4px", lineHeight: 1.45,
                                background: "var(--surface-raised)", border: "1px solid var(--border-tertiary)",
                                borderLeft: "2px solid var(--text-tertiary)", color: "var(--text-secondary)",
                                fontSize: "9.5px", fontWeight: 600,
                            }}
                        >
                            <NotebookText size={9} style={{ flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.title}</span>
                        </span>
                    ))}
                    {extra > 0 && (
                        <span style={{ fontSize: "9.5px", fontWeight: 650, color: "var(--text-tertiary)", paddingLeft: "6px", marginTop: "1px" }}>
                            +{extra} daha
                        </span>
                    )}
                </div>
            )}
            {pop && <DayPopover x={pop.x} y={pop.y} above={pop.above} date={date} occurrences={sorted} notes={notes} />}
        </button>
    );
}

function DayPopover({ x, y, above, date, occurrences, notes }: { x: number; y: number; above: boolean; date: Date; occurrences: Occurrence[]; notes: CalendarNote[] }) {
    if (typeof document === "undefined") return null;
    return createPortal(
        <div
            aria-hidden
            style={{
                position: "fixed", left: x, top: y, zIndex: 250,
                transform: `translate(-50%, ${above ? "-100%" : "0"})`,
                width: "240px", maxWidth: "90vw",
                background: "var(--surface-raised)",
                border: "1px solid var(--border-secondary)",
                borderRadius: "10px",
                boxShadow: "0 10px 34px rgba(0,0,0,0.32)",
                padding: "12px 14px", pointerEvents: "none",
                animation: "cal-pop-in 0.16s cubic-bezier(0.16,1,0.3,1)",
            }}
        >
            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", marginBottom: "8px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span>{formatDateShort(date)}</span>
                <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)" }}>{occurrences.length} uyarı · {notes.length} not</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
                {occurrences.slice(0, 5).map((occ) => (
                    <div key={occ.id + occ.occKind} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", minWidth: 0 }}>
                        {occ.occKind === "due" ? (
                            <span style={{ fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.03em", color: SEVERITY_CONFIG[occ.severity].text, width: "34px", flexShrink: 0, textTransform: "uppercase" }}>◷ Hdf</span>
                        ) : (
                            <span style={{ fontSize: "10px", fontFamily: "var(--font-mono, monospace)", color: "var(--text-tertiary)", width: "34px", flexShrink: 0 }}>{occ.time}</span>
                        )}
                        <span style={{ width: "6px", height: "6px", borderRadius: "50%", flexShrink: 0, background: occ.occKind === "due" ? "transparent" : SEVERITY_CONFIG[occ.severity].color, border: occ.occKind === "due" ? `1.5px solid ${SEVERITY_CONFIG[occ.severity].color}` : "none" }} />
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{eventLabel(occ)}</span>
                    </div>
                ))}
                {occurrences.length > 5 && (
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", paddingTop: "4px", fontWeight: 600 }}>+{occurrences.length - 5} daha…</div>
                )}
                {notes.slice(0, Math.max(0, 5 - occurrences.length)).map((note) => (
                    <div key={note.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "3px 0", minWidth: 0 }}>
                        <span style={{ fontSize: "9px", color: "var(--text-tertiary)", width: "34px", flexShrink: 0 }}>{note.noteTime || "Tüm gün"}</span>
                        <NotebookText size={10} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                        <span style={{ fontSize: "11px", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>{note.title}</span>
                        <span aria-hidden style={{ display: "inline-flex", color: "var(--text-tertiary)" }}>
                            {note.visibility === "personal" ? <LockKeyhole size={9} /> : <Building2 size={9} />}
                        </span>
                    </div>
                ))}
            </div>
        </div>,
        document.body,
    );
}
