"use client";

import { useState, type ReactNode } from "react";

interface OverviewPanelProps {
    title?: ReactNode;
    sub?: ReactNode;
    actions?: ReactNode;
    children: ReactNode;
    pad?: number;
    collapsible?: boolean;
    defaultOpen?: boolean;
    /** Gövde kart yüksekliğini doldursun (flex:1) — eş-yükseklik gridde ölü alanı dağıtmak için. */
    fill?: boolean;
    style?: React.CSSProperties;
    /** collapsible toggle bildirimi (lazy fetch tetiklemek için). */
    onToggle?: (open: boolean) => void;
}

/** Genel Bakış kart kabuğu (başlık/alt-başlık/aksiyon + opsiyonel collapsible). */
export default function OverviewPanel({
    title, sub, actions, children, pad = 16, collapsible = false, defaultOpen = true, fill = false, style, onToggle,
}: OverviewPanelProps) {
    const [open, setOpen] = useState(defaultOpen);
    const showHead = title || actions || collapsible;
    const body = (
        <div style={{
            padding: pad, paddingTop: title ? 12 : pad,
            ...(fill ? { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } : null),
        }}>{children}</div>
    );
    const toggle = () => setOpen((o) => { const next = !o; onToggle?.(next); return next; });
    return (
        <section className="r-card" style={{ display: "flex", flexDirection: "column", ...style }}>
            {showHead && (
                <div
                    className="panel-head"
                    style={collapsible ? { cursor: "pointer", userSelect: "none" } : undefined}
                    onClick={collapsible ? toggle : undefined}
                    {...(collapsible ? { role: "button", "aria-expanded": open, tabIndex: 0 } : {})}
                >
                    <div style={{ minWidth: 0, flex: 1 }}>
                        {title && <div className="panel-title">{title}</div>}
                        {sub && <div className="panel-sub">{sub}</div>}
                    </div>
                    {(actions || collapsible) && (
                        <div style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}>
                            {actions && (
                                <span onClick={(e) => e.stopPropagation()} style={{ display: "inline-flex", alignItems: "center" }}>
                                    {actions}
                                </span>
                            )}
                            {collapsible && (
                                <span aria-hidden="true" style={{
                                    display: "inline-flex", color: "var(--text-tertiary)",
                                    transform: open ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .22s ease",
                                }}>
                                    <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                                        <path d="M4.5 2.5L8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </span>
                            )}
                        </div>
                    )}
                </div>
            )}
            {collapsible ? (
                <div style={{ display: "grid", gridTemplateRows: open ? "1fr" : "0fr", transition: "grid-template-rows .26s ease" }}>
                    <div style={{ overflow: "hidden" }}>{body}</div>
                </div>
            ) : body}
        </section>
    );
}

/** Küçük renkli nokta (legend / tone işaretçisi). */
export function Dot({ tone }: { tone: string }) {
    return <span style={{ width: 8, height: 8, borderRadius: 2, background: tone, flexShrink: 0, display: "inline-block" }} />;
}
