"use client";

import { useState } from "react";
import { ALERT_CLASSES, matchesAlertClass, type CalendarAlert } from "@/lib/alert-calendar";

interface Props {
    activeClass: string;
    onSelect: (id: string) => void;
    /** Görünür uyarılar (çözülenler ayarına göre filtrelenmiş) — sayı rozetleri için. */
    visibleAlerts: CalendarAlert[];
}

/** Yatay sınıflandırma (filtre) sekmeleri — her kategori sayı rozetiyle. */
export function ClassificationTabs({ activeClass, onSelect, visibleAlerts }: Props) {
    return (
        <div
            role="tablist"
            aria-label="Uyarı kategorileri"
            style={{
                display: "flex", alignItems: "center", gap: "4px",
                padding: "0 0 14px", overflowX: "auto", flexShrink: 0,
                scrollbarWidth: "none",
            }}
        >
            {ALERT_CLASSES.map((cat) => {
                const count = visibleAlerts.filter((a) => matchesAlertClass(a, cat)).length;
                return (
                    <ClassTab
                        key={cat.id}
                        label={cat.label}
                        icon={cat.icon}
                        count={count}
                        active={activeClass === cat.id}
                        onClick={() => onSelect(cat.id)}
                    />
                );
            })}
        </div>
    );
}

function ClassTab({ label, icon, count, active, onClick }: {
    label: string; icon: string; count: number; active: boolean; onClick: () => void;
}) {
    const [hov, setHov] = useState(false);
    const isHov = hov && !active;
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            aria-label={`${label} (${count})`}
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                padding: "6px 14px", height: "32px",
                border: `1px solid ${active ? "var(--accent-border)" : isHov ? "var(--border-secondary)" : "var(--border-tertiary)"}`,
                borderRadius: "8px", cursor: "pointer",
                background: active ? "var(--accent-bg)" : isHov ? "var(--bg-tertiary)" : "transparent",
                color: active ? "var(--accent-text)" : isHov ? "var(--text-primary)" : "var(--text-secondary)",
                fontSize: "12px", fontWeight: active ? 650 : 500,
                whiteSpace: "nowrap", flexShrink: 0,
                transition: "background 0.14s, border-color 0.14s, color 0.14s",
            }}
        >
            <span aria-hidden style={{ fontSize: "11px", opacity: 0.8 }}>{icon}</span>
            {label}
            <span
                aria-hidden
                style={{
                    fontSize: "10px", fontWeight: 700, padding: "1px 6px", borderRadius: "10px",
                    lineHeight: 1.4, minWidth: "18px", textAlign: "center",
                    background: active ? "var(--accent)" : "var(--bg-tertiary)",
                    color: active ? "#fff" : "var(--text-tertiary)",
                }}
            >
                {count}
            </span>
        </button>
    );
}
