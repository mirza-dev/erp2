"use client";

import { useEffect, useId } from "react";
import Button, { ButtonLink } from "@/components/ui/Button";
import { SevBadge } from "./SevBadge";
import {
    SEVERITY_CONFIG, formatDateFull, dueCountdownLabel, type CalendarAlert,
} from "@/lib/alert-calendar";
import { ALERT_TYPE_LABEL } from "@/lib/alert-labels";
import type { AlertType } from "@/lib/database.types";

/** Tip-bazlı yönlendirme linkleri (Faz 1: nav-only; inline formlar Faz 2'de). */
type DrawerLink = { label: string; href: string; variant: "primary" | "secondary" | "ghost" };
const DRAWER_LINKS: Partial<Record<AlertType, DrawerLink[]>> = {
    stock_critical: [
        { label: "Satın Alma Planla", href: "/dashboard/purchase/suggested", variant: "primary" },
        { label: "Ürün Detayı", href: "/dashboard/products", variant: "secondary" },
    ],
    stock_risk: [
        { label: "Stoku İzle", href: "/dashboard/products", variant: "primary" },
        { label: "Satın Alma Öner", href: "/dashboard/purchase/suggested", variant: "secondary" },
    ],
    order_shortage: [
        { label: "Siparişleri İncele", href: "/dashboard/orders", variant: "primary" },
        { label: "Satın Alma Planla", href: "/dashboard/purchase/suggested", variant: "secondary" },
    ],
    order_deadline: [
        { label: "Siparişi Görüntüle", href: "/dashboard/orders", variant: "primary" },
        { label: "Satın Alma Planla", href: "/dashboard/purchase/suggested", variant: "secondary" },
    ],
    quote_expired: [
        { label: "Teklifi Yenile", href: "/dashboard/quotes", variant: "primary" },
    ],
    overdue_shipment: [
        { label: "Sevkiyatı Yönet", href: "/dashboard/orders", variant: "primary" },
    ],
    purchase_recommended: [
        { label: "Satın Alma Planla", href: "/dashboard/purchase/suggested", variant: "primary" },
        { label: "Ürün Detayı", href: "/dashboard/products", variant: "secondary" },
    ],
    sync_issue: [
        { label: "Paraşüt Ayarları", href: "/dashboard/parasut", variant: "secondary" },
    ],
};

interface Props {
    alert: CalendarAlert;
    onClose: () => void;
    onAcknowledge: (id: string) => void;
    onResolve: (id: string) => void;
    onDismiss: (id: string) => void;
    onSyncRetry: (id: string) => void;
    /** Ürün-entity uyarılarında: bu ürünün TÜM açık uyarılarını toplu yoksay. */
    onDismissProduct?: (entityId: string) => void;
    isDemo: boolean;
    syncRetrying: boolean;
}

export function AlertCalendarDrawer({
    alert, onClose, onAcknowledge, onResolve, onDismiss, onSyncRetry, onDismissProduct, isDemo, syncRetrying,
}: Props) {
    const titleId = useId();
    const c = SEVERITY_CONFIG[alert.severity];
    const p = alert.product;
    const isResolved = alert.status === "resolved";
    const links = DRAWER_LINKS[alert.type] ?? [];

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    const covColor = p && p.coverageDays != null
        ? (p.coverageDays <= 3 ? "var(--danger-text)" : p.coverageDays <= 14 ? "var(--warning-text)" : "var(--success-text)")
        : "var(--text-primary)";

    return (
        <>
            <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)" }} />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                style={{
                    position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: "min(480px, 100vw)",
                    background: "var(--bg-primary)", borderLeft: "0.5px solid var(--border-secondary)",
                    boxShadow: "-12px 0 40px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column",
                    animation: "slide-in-right 0.24s cubic-bezier(0.16,1,0.3,1)",
                }}
            >
                {/* Header */}
                <div style={{ padding: "20px 24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px", borderBottom: "0.5px solid var(--border-tertiary)", flexShrink: 0 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                            <SevBadge severity={alert.severity} />
                            <span style={{ fontSize: "10px", fontWeight: 650, color: c.text, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                                {ALERT_TYPE_LABEL[alert.type] ?? alert.type}
                            </span>
                        </div>
                        <div id={titleId} style={{ fontSize: "16px", fontWeight: 650, color: "var(--text-primary)", lineHeight: 1.35 }}>
                            {p ? p.name : (alert.orderCode || alert.title)}
                        </div>
                        {p && <div style={{ fontSize: "12px", fontFamily: "var(--font-mono, monospace)", color: "var(--text-tertiary)", marginTop: "4px" }}>{p.sku}</div>}
                    </div>
                    <Button variant="icon" size="md" iconOnly aria-label="Kapat" onClick={onClose}>
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                    </Button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: "24px" }}>
                    <Section label="Neden"><p style={textBlock}>{alert.reason}</p></Section>

                    <Section label="Etki">
                        <div style={{ padding: "12px 14px", borderRadius: "6px", background: c.bg, border: `0.5px solid ${c.border}`, fontSize: "13px", fontWeight: 600, color: c.text, lineHeight: 1.5 }}>
                            {alert.impact}
                        </div>
                    </Section>

                    {p && (
                        <Section label="Stok Durumu">
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1px", borderRadius: "8px", overflow: "hidden", border: "0.5px solid var(--border-tertiary)" }}>
                                <Stat value={p.available} label="Mevcut" />
                                <Stat value={p.minStock} label="Min. Stok" />
                                <Stat value={p.reserved} label="Rezerve" />
                            </div>
                            {p.coverageDays != null && (
                                <div style={{ marginTop: "10px", padding: "10px 14px", borderRadius: "6px", background: "var(--surface-subtle)", border: "0.5px solid var(--border-tertiary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Kapsama Süresi</span>
                                    <span style={{ fontSize: "16px", fontWeight: 700, color: covColor }}>~{p.coverageDays} gün</span>
                                </div>
                            )}
                        </Section>
                    )}

                    <Section label="Tarih & Saat">
                        <p style={{ ...textBlock, color: "var(--text-secondary)" }}>
                            {formatDateFull(new Date(alert.date))}{alert.time ? ` · ${alert.time}` : ""}
                        </p>
                    </Section>

                    {alert.dueDate && (
                        <Section label={alert.dueLabel || "Hedef Tarih"}>
                            <div style={{ display: "flex", alignItems: "center", gap: "11px", padding: "12px 14px", borderRadius: "8px", background: c.bg, border: `1px dashed ${c.color}` }}>
                                <span aria-hidden style={{ fontSize: "18px", color: c.text, lineHeight: 1 }}>◷</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: "13px", fontWeight: 650, color: c.text }}>{formatDateFull(new Date(`${alert.dueDate}T00:00:00`))}</div>
                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{dueCountdownLabel(alert.dueDate)}</div>
                                </div>
                            </div>
                        </Section>
                    )}

                    {alert.source === "ai" && (alert.aiReason || alert.aiConfidence != null) && (
                        <Section label="AI Değerlendirmesi">
                            {alert.aiReason && <p style={textBlock}>{alert.aiReason}</p>}
                            <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "12px", color: "var(--text-tertiary)" }}>
                                {alert.aiConfidence != null && <span>Güven: %{Math.round(alert.aiConfidence * 100)}</span>}
                                {alert.aiModelVersion && <span>Model: {alert.aiModelVersion}</span>}
                            </div>
                        </Section>
                    )}

                    {alert.resolution && (
                        <Section label="Sonuç">
                            <div style={{ padding: "12px 14px", borderRadius: "6px", background: "var(--success-bg)", border: "0.5px solid var(--success-border)", fontSize: "13px", fontWeight: 560, color: "var(--success-text)", lineHeight: 1.5 }}>
                                {alert.resolution}
                            </div>
                        </Section>
                    )}

                    {!isResolved && (links.length > 0 || alert.type === "sync_issue") && (
                        <Section label="Önerilen Aksiyonlar">
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {alert.type === "sync_issue" && (
                                    <Button variant="primary" size="md" fullWidth disabled={isDemo || syncRetrying} onClick={() => onSyncRetry(alert.id)}>
                                        {syncRetrying ? "Yeniden deneniyor..." : "Yeniden Dene"}
                                    </Button>
                                )}
                                {links.map((l) => (
                                    <ButtonLink key={l.href} href={l.href} variant={l.variant} size="md" fullWidth>{l.label}</ButtonLink>
                                ))}
                                {p && alert.entityId && onDismissProduct && (
                                    <Button
                                        variant="ghost" size="md" fullWidth disabled={isDemo}
                                        onClick={() => { onDismissProduct(alert.entityId as string); onClose(); }}
                                    >
                                        Bu ürünün tüm uyarılarını yoksay
                                    </Button>
                                )}
                            </div>
                        </Section>
                    )}
                </div>

                {/* Footer — durum yönetimi */}
                <div style={{ flexShrink: 0, padding: "16px 24px", borderTop: "0.5px solid var(--border-tertiary)", background: "var(--surface-subtle)", display: "flex", gap: "8px", alignItems: "center" }}>
                    {isResolved ? (
                        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", height: "36px", borderRadius: "8px", background: "var(--success-bg)", border: "1px solid var(--success-border)", color: "var(--success-text)", fontSize: "13px", fontWeight: 600 }}>
                            ✓ Çözüldü
                        </div>
                    ) : (
                        <>
                            {alert.status === "open" && (
                                <Button variant="secondary" size="md" fullWidth disabled={isDemo} onClick={() => onAcknowledge(alert.id)}>Kabul Et</Button>
                            )}
                            {alert.status === "acknowledged" && (
                                <Button variant="success" size="md" fullWidth disabled={isDemo} onClick={() => onResolve(alert.id)}>Çöz</Button>
                            )}
                            <Button variant="dangerSoft" size="md" fullWidth disabled={isDemo} onClick={() => { onDismiss(alert.id); onClose(); }}>Yoksay</Button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div>
            <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-tertiary)", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "10px" }}>{label}</div>
            {children}
        </div>
    );
}

function Stat({ value, label }: { value: number; label: string }) {
    return (
        <div style={{ padding: "14px", background: "var(--surface-subtle)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>{value}</span>
            <span style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</span>
        </div>
    );
}

const textBlock: React.CSSProperties = { fontSize: "13px", color: "var(--text-primary)", lineHeight: 1.65 };
