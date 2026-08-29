"use client";

import { useState } from "react";
import useSWR from "swr";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import { ConfirmModal } from "@/components/ui/Modal";
import { ErrorState, LoadingState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import type { DiagnosticsPayload } from "@/lib/telemetry/console-types";
import { formatUptime } from "@/lib/telemetry/service-health";
import {
    HealthPill,
    Mono,
} from "@/components/developer/ConsoleWidgets";
import {
    formatDateTime,
} from "@/components/developer/console-format";

const ENV_LABELS: Record<string, string> = {
    redisConfigured: "Redis (REDIS_URL)",
    sentryConfigured: "Sentry DSN",
    parasutEnabled: "Paraşüt teslim (PARASUT_ENABLED)",
    resendConfigured: "Resend (RESEND_API_KEY)",
    internalOperatorAllowlistConfigured: "Developer allowlist (INTERNAL_OPERATOR_EMAILS)",
    cronSecretConfigured: "Cron sırrı (CRON_SECRET)",
    anthropicKeyPresent: "Anthropic anahtarı",
};

const TABLE_LABELS: Record<string, string> = {
    system_error_groups: "Hata grupları",
    system_error_events: "Hata oluşumları",
    system_events: "Sistem olayları",
    developer_bugs: "Bug kayıtları",
    request_metrics: "İstek metrikleri",
};

export default function DeveloperDiagnosticsPage() {
    const { toast } = useToast();
    const { data, error, isLoading, isValidating, mutate } = useSWR<DiagnosticsPayload>(
        "/api/developer/diagnostics", jsonFetcher, { ...SWR_DEFAULTS, refreshInterval: 30_000 },
    );
    const [purgeOpen, setPurgeOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const runTestError = async () => {
        setBusy(true);
        try {
            const res = await fetch("/api/developer/diagnostics", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "test-error" }),
            });
            // 500 BEKLENEN sonuçtur: gerçek bir hata fırlatıldı ve merkezi
            // yakalayıcıdan geçti. 2xx dönmesi boru hattının bağlı OLMADIĞINI gösterir.
            const requestId = res.headers.get("x-request-id");
            if (res.status === 500) {
                toast({
                    type: "success",
                    message: requestId
                        ? `Test hatası üretildi. Request ID: ${requestId} — Hatalar ekranından doğrulayın.`
                        : "Test hatası üretildi. Hatalar ekranından doğrulayın.",
                });
            } else {
                toast({
                    type: "error",
                    message: `Beklenen 500 yerine ${res.status} döndü — yakalama zinciri kopuk olabilir.`,
                });
            }
            await mutate();
        } catch {
            toast({ type: "error", message: "Test hatası tetiklenemedi." });
        } finally {
            setBusy(false);
        }
    };

    const runPurge = async () => {
        setBusy(true);
        try {
            const res = await fetch("/api/developer/retention", { method: "POST" });
            if (!res.ok) throw new Error("purge failed");
            const result = await res.json();
            toast({
                type: "success",
                message: `Temizlik tamam: ${result.error_events} hata olayı, `
                    + `${result.system_events} sistem olayı, ${result.request_metrics} metrik silindi.`,
            });
            setPurgeOpen(false);
            await mutate();
        } catch {
            toast({ type: "error", message: "Temizlik çalıştırılamadı." });
        } finally {
            setBusy(false);
        }
    };

    if (isLoading && !data) return <LoadingState message="Tanılama okunuyor…" />;
    if (error && !data) {
        return <ErrorState message="Tanılama yüklenemedi." onRetry={() => void mutate()} />;
    }
    if (!data) return null;

    const t = data.telemetry;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PageHeader
                title="Tanılama"
                subtitle="Telemetri boru hattının kendi durumu ve yapılandırma."
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                refreshAriaLabel="Tanılamayı yenile"
            />

            {/* ── Telemetri sağlığı ───────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>Telemetri Boru Hattı</h2>
                <dl style={factGrid}>
                    <Fact
                        label="Durum"
                        node={<HealthPill status={t.enabled ? "healthy" : "unknown"}>
                            {t.enabled ? "Etkin" : "Kapalı"}
                        </HealthPill>}
                    />
                    <Fact label="Ortam" value={t.environment} />
                    <Fact label="Yazılan kayıt" value={String(t.writes)} />
                    <Fact label="Başarısız yazma" value={String(t.failures)} danger={t.failures > 0} />
                    <Fact label="Düşürülen (hız tavanı)" value={String(t.dropped)} danger={t.dropped > 0} />
                    <Fact label="Son arıza" value={t.lastFailureAt ? formatDateTime(t.lastFailureAt) : "—"} />
                </dl>
                {t.lastFailureMessage && (
                    <p style={{ ...mutedText, marginTop: "10px" }}>
                        Son arıza mesajı: <Mono>{t.lastFailureMessage}</Mono>
                    </p>
                )}
                <p style={{ ...mutedText, marginTop: "10px" }}>
                    Sayaçlar bu sunucu süreciyle sınırlıdır — yeniden başlatmada sıfırlanır,
                    birden çok instance çalışıyorsa her biri kendi sayacını tutar.
                </p>
            </Card>

            {/* ── Test ve bakım ───────────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>Boru Hattı Testi ve Bakım</h2>
                <p style={mutedText}>
                    &quot;Test hatası&quot; GERÇEK bir hata fırlatır ve merkezi yakalayıcıdan
                    (<Mono>handleApiError</Mono>) geçirir; yanıtın 500 olması beklenen
                    sonuçtur. Aynı testi iki kez çalıştırırsanız Hatalar ekranında yeni bir
                    satır değil, tekrar sayısı 2 olan TEK satır görmelisiniz — gruplamanın
                    çalıştığının kanıtı budur.
                </p>
                <div style={{ display: "flex", gap: "8px", marginTop: "10px", flexWrap: "wrap" }}>
                    <Button variant="secondary" size="sm" onClick={() => void runTestError()} disabled={busy}>
                        Test hatası üret
                    </Button>
                    <Button variant="dangerSoft" size="sm" onClick={() => setPurgeOpen(true)} disabled={busy}>
                        Retention temizliğini şimdi çalıştır
                    </Button>
                </div>
            </Card>

            {/* ── Tablo boyutları ─────────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>Telemetri Tabloları</h2>
                <dl style={factGrid}>
                    {Object.entries(data.tableSizes).map(([table, count]) => (
                        <Fact
                            key={table}
                            label={TABLE_LABELS[table] ?? table}
                            value={count === null ? "Okunamadı" : `${count} satır`}
                        />
                    ))}
                </dl>
                <p style={{ ...mutedText, marginTop: "10px" }}>
                    Saatlik cron temizliği: hata olayları 30 gün, sistem olayları 14 gün,
                    istek metrikleri 30 gün. Bir bug&apos;a bağlı hata grubu asla silinmez.
                </p>
            </Card>

            {/* ── Yapılandırma ────────────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>Yapılandırma</h2>
                <p style={mutedText}>
                    Yalnız <strong>varlık</strong> gösterilir — hiçbir sır değeri okunmaz veya yazılmaz.
                </p>
                <dl style={{ ...factGrid, marginTop: "10px" }}>
                    {Object.entries(data.env).map(([key, present]) => (
                        <Fact
                            key={key}
                            label={ENV_LABELS[key] ?? key}
                            node={<HealthPill status={present ? "healthy" : "unknown"}>
                                {present ? "Tanımlı" : "Tanımsız"}
                            </HealthPill>}
                        />
                    ))}
                </dl>
            </Card>

            {/* ── Çalışma zamanı ──────────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>Çalışma Zamanı</h2>
                <dl style={factGrid}>
                    <Fact label="Çalışma süresi" value={formatUptime(data.uptimeSeconds)} />
                    <Fact label="Node sürümü" value={data.nodeVersion} />
                    <Fact label="Sağlık penceresi" value={`${data.thresholds.healthWindowMinutes} dakika`} />
                    <Fact label="Okunma zamanı" value={formatDateTime(data.generatedAt)} />
                </dl>
            </Card>

            {purgeOpen && (
                <ConfirmModal
                    title="Retention temizliği"
                    message="Süresi dolmuş telemetri kayıtları kalıcı olarak silinecek. İş verisi etkilenmez."
                    confirmLabel="Temizle"
                    busy={busy}
                    onConfirm={() => void runPurge()}
                    onCancel={() => setPurgeOpen(false)}
                />
            )}
        </div>
    );
}

function Fact({
    label,
    value,
    node,
    danger,
}: {
    label: string;
    value?: string;
    node?: React.ReactNode;
    danger?: boolean;
}) {
    return (
        <div style={{ minWidth: 0 }}>
            <dt style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "3px" }}>{label}</dt>
            <dd style={{
                margin: 0,
                fontSize: "12.5px",
                color: danger ? "var(--danger-text)" : "var(--text-primary)",
                fontWeight: danger ? 600 : 400,
                wordBreak: "break-word",
            }}>
                {node ?? value ?? "—"}
            </dd>
        </div>
    );
}

const sectionTitle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 650,
    color: "var(--text-primary)",
    margin: "0 0 8px",
};

const factGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: "12px",
    margin: 0,
};

const mutedText: React.CSSProperties = {
    fontSize: "12.5px",
    color: "var(--text-tertiary)",
    lineHeight: 1.65,
    margin: 0,
};
