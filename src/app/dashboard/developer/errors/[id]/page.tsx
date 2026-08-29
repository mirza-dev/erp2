"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { ArrowLeft } from "lucide-react";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Input, { Select, Textarea } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { ErrorState, LoadingState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import type { ErrorDetailPayload } from "@/lib/telemetry/console-types";
import type { DeveloperBugPriority, ErrorGroupStatus } from "@/lib/database.types";
import {
    Mono,
    SeverityBadge,
    StackTrace,
} from "@/components/developer/ConsoleWidgets";
import {
    formatDateTime,
    formatRelative,
} from "@/components/developer/console-format";

const STATUS_LABELS: Record<ErrorGroupStatus, string> = {
    open: "Açık",
    investigating: "İnceleniyor",
    ignored: "Yok sayıldı",
    resolved: "Çözüldü",
};

const PRIORITIES: Array<{ value: DeveloperBugPriority; label: string }> = [
    { value: "low", label: "Düşük" },
    { value: "medium", label: "Orta" },
    { value: "high", label: "Yüksek" },
    { value: "critical", label: "Kritik" },
];

export default function ErrorDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const { refresh } = useRouter();
    const { toast } = useToast();

    const { data, error, isLoading, mutate } = useSWR<ErrorDetailPayload>(
        `/api/developer/errors/${id}`, jsonFetcher, SWR_DEFAULTS,
    );

    const [savingStatus, setSavingStatus] = useState(false);
    const [bugOpen, setBugOpen] = useState(false);

    if (isLoading && !data) return <LoadingState message="Hata detayı yükleniyor…" />;
    if (error && !data) {
        return <ErrorState message="Hata detayı yüklenemedi." onRetry={() => void mutate()} />;
    }
    if (!data) return null;

    const { group, events, bugs, latestRequestId, related } = data;
    const latest = events[0] ?? null;

    const changeStatus = async (status: ErrorGroupStatus) => {
        setSavingStatus(true);
        try {
            const res = await fetch(`/api/developer/errors/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) throw new Error("Durum güncellenemedi.");
            await mutate();
            toast({ type: "success", message: `Durum "${STATUS_LABELS[status]}" olarak güncellendi.` });
        } catch {
            toast({ type: "error", message: "Durum güncellenemedi." });
        } finally {
            setSavingStatus(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <div>
                <Link
                    href="/dashboard/developer/errors"
                    style={{
                        display: "inline-flex", alignItems: "center", gap: "5px",
                        fontSize: "12px", color: "var(--text-tertiary)", textDecoration: "none",
                    }}
                >
                    <ArrowLeft size={13} /> Hatalar
                </Link>
            </div>

            {/* ── Genel ───────────────────────────────────────────────────── */}
            <Card>
                <div style={{ display: "flex", gap: "10px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "260px" }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "5px" }}>
                            <SeverityBadge severity={group.severity} />
                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                                {group.error_type ?? "—"}
                            </span>
                        </div>
                        <h1 style={{ fontSize: "16px", fontWeight: 650, color: "var(--text-primary)", margin: 0, lineHeight: 1.45 }}>
                            {group.title}
                        </h1>
                        <div style={{ marginTop: "6px" }}>
                            <Mono title="Parmak izi — gruplama anahtarı">{group.fingerprint}</Mono>
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                        <Select
                            inputSize="sm"
                            aria-label="Hata durumu"
                            value={group.status}
                            disabled={savingStatus}
                            onChange={e => void changeStatus(e.target.value as ErrorGroupStatus)}
                            style={{ width: "auto", minWidth: "134px" }}
                        >
                            {(Object.keys(STATUS_LABELS) as ErrorGroupStatus[]).map(s => (
                                <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                            ))}
                        </Select>
                        <Button variant="primary" size="sm" onClick={() => setBugOpen(true)}>
                            Bug Oluştur
                        </Button>
                    </div>
                </div>

                <dl style={factGrid}>
                    <Fact label="Tekrar sayısı" value={String(group.occurrence_count)} />
                    <Fact label="İlk görülme" value={formatDateTime(group.first_seen_at)} />
                    <Fact label="Son görülme" value={`${formatDateTime(group.last_seen_at)} (${formatRelative(group.last_seen_at)})`} />
                    <Fact label="Modül" value={group.module ?? "—"} />
                    <Fact label="Ortam" value={group.environment} />
                    <Fact label="Endpoint" value={group.endpoint ?? "—"} mono />
                </dl>
            </Card>

            {bugs.length > 0 && (
                <Card>
                    <h2 style={sectionTitle}>Bağlı Bug&apos;lar</h2>
                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {bugs.map(b => (
                            <li key={b.id} style={{ fontSize: "12.5px", color: "var(--text-secondary)", padding: "2px 0" }}>
                                <Link href="/dashboard/developer/bugs" style={{ color: "var(--accent-text)", textDecoration: "none" }}>
                                    {b.title}
                                </Link>{" "}
                                <span style={{ color: "var(--text-tertiary)" }}>· {b.status} · {b.priority}</span>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* ── İstek bağlamı ───────────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>Son Oluşum — İstek</h2>
                {latest ? (
                    <dl style={factGrid}>
                        <Fact label="Zaman" value={formatDateTime(latest.occurred_at)} />
                        <Fact label="Method" value={latest.method ?? "—"} />
                        <Fact label="Endpoint" value={latest.endpoint ?? "—"} mono />
                        <Fact label="HTTP durumu" value={latest.status_code ? String(latest.status_code) : "—"} />
                        <Fact label="Request ID" value={latest.request_id ?? "—"} mono />
                        <Fact label="Kullanıcı" value={latest.user_id ?? "—"} mono />
                        <Fact label="İstemci" value={latest.user_agent ?? "—"} />
                    </dl>
                ) : (
                    <p style={mutedText}>
                        Bu grup için saklanmış tekil oluşum yok — retention süresi dolmuş
                        olabilir. Tekrar sayısı yine de doğrudur.
                    </p>
                )}
            </Card>

            {/* ── Stack trace ─────────────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>Stack Trace</h2>
                <StackTrace stack={latest?.stack ?? null} />
            </Card>

            {/* ── İlişkili olaylar ────────────────────────────────────────── */}
            <Card>
                <h2 style={sectionTitle}>
                    İlişkili Olaylar
                    {latestRequestId && <> · <Mono>{latestRequestId}</Mono></>}
                </h2>
                {!latestRequestId ? (
                    <p style={mutedText}>
                        Son oluşumda korelasyon kimliği yok — bu hata istek kapsamı dışında
                        (örneğin bir cron işi) üretilmiş olabilir.
                    </p>
                ) : related.events.length === 0 && related.errors.length === 0 ? (
                    <p style={mutedText}>Aynı istekten başka olay kaydedilmemiş.</p>
                ) : (
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {related.events.map(e => (
                            <div key={`ev-${e.id}`} style={relatedRow}>
                                <Mono>{formatDateTime(e.occurred_at)}</Mono>
                                <SeverityBadge severity={e.level} />
                                <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>{e.message}</span>
                            </div>
                        ))}
                        {related.errors.map(e => (
                            <div key={`er-${e.id}`} style={relatedRow}>
                                <Mono>{formatDateTime(e.occurred_at)}</Mono>
                                <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                                    {e.method ?? ""} {e.endpoint ?? ""} → {e.status_code ?? "—"}
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* ── Oluşum geçmişi ──────────────────────────────────────────── */}
            {events.length > 1 && (
                <Card>
                    <h2 style={sectionTitle}>Son Oluşumlar ({events.length})</h2>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                        {events.map(e => (
                            <div key={e.id} style={relatedRow}>
                                <Mono>{formatDateTime(e.occurred_at)}</Mono>
                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                                    {e.method ?? "—"} {e.endpoint ?? ""} · {e.status_code ?? "—"}
                                </span>
                                {e.request_id && <Mono>{e.request_id}</Mono>}
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            {bugOpen && (
                <CreateBugModal
                    errorGroupId={group.id}
                    defaultTitle={group.title}
                    defaultPriority={group.severity === "critical" ? "critical" : "medium"}
                    onClose={() => setBugOpen(false)}
                    onCreated={async () => {
                        setBugOpen(false);
                        await mutate();
                        toast({ type: "success", message: "Bug oluşturuldu ve bu hataya bağlandı." });
                        refresh();
                    }}
                />
            )}
        </div>
    );
}

// ── Bug oluşturma modalı ─────────────────────────────────────────────────

function CreateBugModal({
    errorGroupId,
    defaultTitle,
    defaultPriority,
    onClose,
    onCreated,
}: {
    errorGroupId: string;
    defaultTitle: string;
    defaultPriority: DeveloperBugPriority;
    onClose: () => void;
    onCreated: () => void | Promise<void>;
}) {
    const { toast } = useToast();
    const [title, setTitle] = useState(() => defaultTitle.slice(0, 200));
    const [description, setDescription] = useState("");
    const [priority, setPriority] = useState<DeveloperBugPriority>(defaultPriority);
    const [saving, setSaving] = useState(false);

    const submit = async () => {
        if (!title.trim()) return;
        setSaving(true);
        try {
            const res = await fetch("/api/developer/bugs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    priority,
                    errorGroupIds: [errorGroupId],
                }),
            });
            if (!res.ok) throw new Error("Bug oluşturulamadı.");
            await onCreated();
        } catch {
            toast({ type: "error", message: "Bug oluşturulamadı." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal onClose={onClose} labelledBy="create-bug-title" dismissible={!saving} width="min(560px, calc(100vw - 28px))">
            <div id="create-bug-title" style={{ fontSize: "15px", fontWeight: 650, color: "var(--text-primary)" }}>
                Bug Oluştur
            </div>
            <p style={{ ...mutedText, margin: 0 }}>
                Bu hata grubu otomatik olarak bug&apos;a bağlanır.
            </p>

            <label htmlFor="bug-title" style={labelStyle}>Başlık</label>
            <Input
                id="bug-title"
                value={title}
                maxLength={200}
                onChange={e => setTitle(e.target.value)}
            />

            <label htmlFor="bug-desc" style={labelStyle}>Açıklama</label>
            <Textarea
                id="bug-desc"
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Ne gözlemlendi, ne bekleniyordu?"
            />

            <label htmlFor="bug-priority" style={labelStyle}>Öncelik</label>
            <Select
                id="bug-priority"
                value={priority}
                onChange={e => setPriority(e.target.value as DeveloperBugPriority)}
            >
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "6px" }}>
                <Button variant="secondary" onClick={onClose} disabled={saving}>İptal</Button>
                <Button
                    variant="primary"
                    onClick={() => void submit()}
                    loading={saving}
                    disabled={saving || !title.trim()}
                >
                    Oluştur
                </Button>
            </div>
        </Modal>
    );
}

// ── Küçük parçalar ───────────────────────────────────────────────────────

function Fact({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div style={{ minWidth: 0 }}>
            <dt style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>{label}</dt>
            <dd style={{ margin: 0, fontSize: "12.5px", color: "var(--text-primary)", wordBreak: "break-word" }}>
                {mono ? <Mono>{value}</Mono> : value}
            </dd>
        </div>
    );
}

const factGrid: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
    gap: "12px",
    margin: "14px 0 0",
};

const sectionTitle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 650,
    color: "var(--text-primary)",
    margin: "0 0 8px",
};

const mutedText: React.CSSProperties = {
    fontSize: "12.5px",
    color: "var(--text-tertiary)",
    lineHeight: 1.6,
};

const relatedRow: React.CSSProperties = {
    display: "flex",
    gap: "10px",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "0.5px solid var(--border-secondary)",
    flexWrap: "wrap",
};

const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginTop: "4px",
};
