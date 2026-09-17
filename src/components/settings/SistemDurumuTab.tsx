"use client";

/**
 * Ayarlar › Sistem Durumu — env'e bağlı servislerin sağlığı tek kartta
 * (onboarding, 2026-09-16).
 *
 * Kaynak `GET /api/settings/system-status` → `buildSystemStatus()`; bu bileşen
 * hiçbir kural taşımaz, yalnız çizer. Üç grup = deploy-env-matrix.md'nin üç
 * sınıfı. Env DEĞERİ hiç gelmez; satırda yalnız durum + "eksikse ne olur".
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, RefreshCw } from "lucide-react";
import Badge, { type BadgeTone } from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import SectionHeader from "@/components/ui/SectionHeader";
import { LoadingState, ErrorState } from "@/components/ui/StateViews";
import type { SystemStatusClass, SystemStatusItem, SystemStatusReport, SystemStatusTone } from "@/lib/system-status";

const TONE_BADGE: Record<SystemStatusTone, BadgeTone> = {
    ok: "success",
    warning: "warning",
    danger: "danger",
    info: "neutral",
};

const TONE_LABEL: Record<SystemStatusTone, string> = {
    ok: "Çalışıyor",
    warning: "Eksik",
    danger: "Kapalı",
    info: "İsteğe bağlı",
};

const CLASS_META: Record<SystemStatusClass, { title: string; description: string }> = {
    zorunlu: { title: "Zorunlu", description: "Eksikse uygulama açılmaz veya kilitlenir." },
    sessiz: { title: "Sessizce kapanan özellikler", description: "Eksikse hata görünmez; özellik çalışmaz." },
    deger: { title: "Doğru değer gerektirenler", description: "Yanlışsa yanlış çalışır — hata vermez." },
};

const CLASS_ORDER: SystemStatusClass[] = ["zorunlu", "sessiz", "deger"];

function ToneIcon({ tone }: { tone: SystemStatusTone }) {
    const style = { flexShrink: 0 } as const;
    if (tone === "ok") return <CheckCircle2 size={15} aria-hidden style={{ ...style, color: "var(--success-text)" }} />;
    if (tone === "danger") return <XCircle size={15} aria-hidden style={{ ...style, color: "var(--danger-text)" }} />;
    if (tone === "warning") return <AlertTriangle size={15} aria-hidden style={{ ...style, color: "var(--warning-text)" }} />;
    return <Info size={15} aria-hidden style={{ ...style, color: "var(--text-tertiary)" }} />;
}

function StatusRow({ item }: { item: SystemStatusItem }) {
    return (
        <div
            style={{
                display: "flex", alignItems: "flex-start", gap: "10px",
                padding: "12px 14px",
                borderTop: "var(--line-width) solid var(--border-tertiary)",
            }}
        >
            <span style={{ marginTop: "2px" }}><ToneIcon tone={item.tone} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{item.label}</span>
                    <Badge tone={TONE_BADGE[item.tone]}>{TONE_LABEL[item.tone]}</Badge>
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>{item.state}</div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", lineHeight: 1.5 }}>
                    {item.impact}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", fontFamily: "var(--font-mono, monospace)" }}>
                    {item.env.join(" · ")}
                </div>
            </div>
        </div>
    );
}

export default function SistemDurumuTab() {
    const [report, setReport] = useState<SystemStatusReport | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/settings/system-status");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            setReport((await res.json()) as SystemStatusReport);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Durum alınamadı.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    if (loading && !report) return <LoadingState message="Sistem durumu ölçülüyor…" />;
    if (error && !report) return <ErrorState message={`Sistem durumu alınamadı (${error}).`} onRetry={load} />;
    if (!report) return null;

    const { summary } = report;
    const headline = summary.danger > 0
        ? `${summary.danger} servis kapalı`
        : summary.warning > 0
            ? `${summary.warning} eksik ayar`
            : "Tüm servisler çalışıyor";

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <SectionHeader
                variant="title"
                description="Bu ekran ortam değişkenlerinin VAR/YOK durumunu gösterir; anahtar değerleri burada görünmez. Değişiklik sunucu ortamında yapılır ve yeniden başlatma gerektirir."
                action={
                    <Button variant="secondary" size="sm" onClick={load} loading={loading} leftIcon={<RefreshCw size={13} aria-hidden />}>
                        Yenile
                    </Button>
                }
            >
                {headline}
            </SectionHeader>

            {CLASS_ORDER.map(klass => {
                const items = report.items.filter(i => i.klass === klass);
                if (items.length === 0) return null;
                const meta = CLASS_META[klass];
                return (
                    <section
                        key={klass}
                        aria-label={meta.title}
                        style={{
                            background: "var(--surface-raised)",
                            border: "var(--line-width) solid var(--surface-border)",
                            borderRadius: "8px",
                            boxShadow: "var(--surface-shadow-sm)",
                            overflow: "hidden",
                        }}
                    >
                        <div style={{ padding: "11px 14px" }}>
                            <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>{meta.title}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>{meta.description}</div>
                        </div>
                        {items.map(item => <StatusRow key={item.key} item={item} />)}
                    </section>
                );
            })}
        </div>
    );
}
