"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import {
    RANGE_LABELS,
    TIME_RANGES,
    type HealthStatus,
    type TimeRange,
} from "@/lib/telemetry/health";
import type { TelemetrySeverity } from "@/lib/database.types";
import { HEALTH_LABELS, SEVERITY_LABELS } from "./console-format";

/**
 * Developer Console ortak parçaları.
 *
 * Panel "normal ERP ekranlarından biraz daha teknik" ama AYNI design system'i
 * kullanır: inline style + CSS değişkeni, mevcut `Badge`/`Button`/`Select`.
 * Yeni UI kütüphanesi yok (§18).
 */

// ── Ciddiyet ─────────────────────────────────────────────────────────────

const SEVERITY_TONE: Record<TelemetrySeverity, BadgeTone> = {
    info: "accent",
    warning: "warning",
    error: "danger",
    critical: "danger",
};


export function SeverityBadge({ severity }: { severity: TelemetrySeverity }) {
    return (
        <Badge
            tone={SEVERITY_TONE[severity]}
            // Kritik, hatadan görsel olarak AYRIŞMALI — ikisi de danger tonunda
            // ama kritik dolu/kalın; aynı rengin iki farklı anlamı karışmasın.
            style={severity === "critical"
                ? { fontWeight: 700, letterSpacing: "0.02em", textTransform: "uppercase" }
                : undefined}
        >
            {SEVERITY_LABELS[severity]}
        </Badge>
    );
}

// ── Sağlık ───────────────────────────────────────────────────────────────

const HEALTH_COLOR: Record<HealthStatus, string> = {
    healthy: "var(--success-text)",
    degraded: "var(--warning-text)",
    critical: "var(--danger-text)",
    unknown: "var(--text-tertiary)",
};


export function HealthDot({ status }: { status: HealthStatus }) {
    return (
        <span
            aria-hidden="true"
            style={{
                display: "inline-block",
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                background: HEALTH_COLOR[status],
                flexShrink: 0,
            }}
        />
    );
}

export function HealthPill({ status, children }: { status: HealthStatus; children?: ReactNode }) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: 600,
                color: HEALTH_COLOR[status],
            }}
        >
            <HealthDot status={status} />
            {children ?? HEALTH_LABELS[status]}
        </span>
    );
}

// ── Metrik kartı ─────────────────────────────────────────────────────────

export interface MetricCardProps {
    label: string;
    /** null → "Ölçülmüyor" yazılır (§28 — uydurma değer yok). */
    value: string | number | null;
    hint?: string;
    tone?: "default" | "danger" | "warning" | "success";
}

const VALUE_COLOR: Record<NonNullable<MetricCardProps["tone"]>, string> = {
    default: "var(--text-primary)",
    danger: "var(--danger-text)",
    warning: "var(--warning-text)",
    success: "var(--success-text)",
};

export function MetricCard({ label, value, hint, tone = "default" }: MetricCardProps) {
    const measured = value !== null && value !== undefined;
    return (
        <div
            style={{
                background: "var(--surface-raised)",
                border: "0.5px solid var(--border-secondary)",
                borderRadius: "9px",
                padding: "12px 14px",
                display: "flex",
                flexDirection: "column",
                gap: "3px",
                minWidth: 0,
            }}
        >
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 500 }}>
                {label}
            </span>
            <span
                style={{
                    fontSize: measured ? "21px" : "13px",
                    fontWeight: measured ? 650 : 500,
                    color: measured ? VALUE_COLOR[tone] : "var(--text-tertiary)",
                    fontVariantNumeric: "tabular-nums",
                    fontStyle: measured ? "normal" : "italic",
                }}
            >
                {measured ? value : "Ölçülmüyor"}
            </span>
            {hint && (
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.4 }}>
                    {hint}
                </span>
            )}
        </div>
    );
}

export function MetricGrid({ children }: { children: ReactNode }) {
    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(168px, 1fr))",
                gap: "10px",
            }}
        >
            {children}
        </div>
    );
}

// ── Zaman aralığı ────────────────────────────────────────────────────────

export function RangePicker({
    value,
    onChange,
}: {
    value: TimeRange;
    onChange: (range: TimeRange) => void;
}) {
    return (
        <Select
            inputSize="sm"
            aria-label="Zaman aralığı"
            value={value}
            onChange={e => onChange(e.target.value as TimeRange)}
            style={{ width: "auto", minWidth: "132px" }}
        >
            {TIME_RANGES.map(r => (
                <option key={r} value={r}>{RANGE_LABELS[r]}</option>
            ))}
        </Select>
    );
}

// ── Stack trace ──────────────────────────────────────────────────────────

/** Monospace + kopyalanabilir (§7). Uzun satırlar yatayda kendi içinde kayar. */
export function StackTrace({ stack }: { stack: string | null }) {
    const [copied, setCopied] = useState(false);

    if (!stack) {
        return (
            <p style={{ fontSize: "12px", color: "var(--text-tertiary)", margin: 0 }}>
                Bu hata için stack trace kaydedilmedi.
            </p>
        );
    }

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(stack);
            setCopied(true);
            setTimeout(() => setCopied(false), 1_800);
        } catch {
            setCopied(false);
        }
    };

    return (
        <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", top: "8px", right: "8px", zIndex: 1 }}>
                <Button
                    variant="secondary"
                    size="xs"
                    onClick={copy}
                    leftIcon={copied ? <Check size={12} /> : <Copy size={12} />}
                >
                    {copied ? "Kopyalandı" : "Kopyala"}
                </Button>
            </div>
            <pre style={codeBlockStyle}>{stack}</pre>
        </div>
    );
}

const codeBlockStyle: CSSProperties = {
    margin: 0,
    padding: "12px 14px",
    background: "var(--bg-tertiary)",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "8px",
    fontFamily: "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: "11.5px",
    lineHeight: 1.65,
    color: "var(--text-secondary)",
    overflowX: "auto",
    whiteSpace: "pre",
    maxHeight: "420px",
    overflowY: "auto",
};

/** Kısa tek satırlık kod/kimlik gösterimi (request id, endpoint, fingerprint). */
export function Mono({ children, title }: { children: ReactNode; title?: string }) {
    return (
        <span
            title={title}
            style={{
                fontFamily: "var(--font-geist-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
                fontSize: "11.5px",
                color: "var(--text-secondary)",
            }}
        >
            {children}
        </span>
    );
}
