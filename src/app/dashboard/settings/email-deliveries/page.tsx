"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, MailCheck, RefreshCw, ShieldOff, Wrench, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { EmailDeliveryStatus, EmailLogRow, EmailSuppressionRow, MaintenanceIncidentRow } from "@/lib/database.types";

type SafeDelivery = Omit<EmailLogRow, "html_body" | "text_body" | "metadata">;

const STATUS_META: Record<EmailDeliveryStatus, { label: string; color: string; bg: string; border: string }> = {
    queued: { label: "Kuyrukta", color: "var(--text-secondary)", bg: "var(--surface-subtle)", border: "var(--border-secondary)" },
    accepted: { label: "Kabul edildi", color: "var(--accent-text)", bg: "var(--accent-bg)", border: "var(--accent-border)" },
    delivered: { label: "Teslim edildi", color: "var(--success-text)", bg: "var(--success-bg)", border: "var(--success-border)" },
    failed: { label: "Başarısız", color: "var(--danger-text)", bg: "var(--danger-bg)", border: "var(--danger-border)" },
    bounced: { label: "Kalıcı bounce", color: "var(--danger-text)", bg: "var(--danger-bg)", border: "var(--danger-border)" },
    complained: { label: "Spam şikâyeti", color: "var(--warning-text)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
    suppressed: { label: "Bloke", color: "var(--warning-text)", bg: "var(--warning-bg)", border: "var(--warning-border)" },
};
const DATE_TIME_FORMATTER = new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" });

function formatDate(value: string | null) {
    if (!value) return "—";
    return DATE_TIME_FORMATTER.format(new Date(value));
}

function useCompactFilters(): boolean {
    const [compact, setCompact] = useState(false);
    useEffect(() => {
        const query = window.matchMedia("(max-width: 640px)");
        const sync = () => setCompact(query.matches);
        sync();
        query.addEventListener("change", sync);
        return () => query.removeEventListener("change", sync);
    }, []);
    return compact;
}

async function fetchJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Bakım verileri yüklenemedi.");
    return res.json() as Promise<T>;
}

export default function EmailDeliveriesPage() {
    const { internalOperator, loading: permissionLoading } = usePermissions();
    const { toast } = useToast();
    const compactFilters = useCompactFilters();
    const [deliveries, setDeliveries] = useState<SafeDelivery[]>([]);
    const [suppressions, setSuppressions] = useState<EmailSuppressionRow[]>([]);
    const [incidents, setIncidents] = useState<MaintenanceIncidentRow[]>([]);
    const [status, setStatus] = useState("");
    const [recipient, setRecipient] = useState("");
    const [notificationType, setNotificationType] = useState("");
    const [entityType, setEntityType] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [loading, setLoading] = useState(true);
    const [workingId, setWorkingId] = useState<string | null>(null);
    const [selectedDelivery, setSelectedDelivery] = useState<SafeDelivery | null>(null);

    const load = useCallback(async () => {
        if (!internalOperator) return;
        setLoading(true);
        try {
            const q = new URLSearchParams();
            if (status) q.set("status", status);
            if (recipient.trim()) q.set("recipient", recipient.trim());
            if (notificationType) q.set("type", notificationType);
            if (entityType.trim()) q.set("entity", entityType.trim());
            if (from) q.set("from", new Date(`${from}T00:00:00`).toISOString());
            if (to) q.set("to", new Date(`${to}T23:59:59.999`).toISOString());
            const [deliveryRows, suppressionRows, incidentRows] = await Promise.all([
                fetchJson<SafeDelivery[]>(`/api/maintenance/email-deliveries?${q}`),
                fetchJson<EmailSuppressionRow[]>("/api/maintenance/email-suppressions"),
                fetchJson<MaintenanceIncidentRow[]>("/api/maintenance/incidents"),
            ]);
            setDeliveries(deliveryRows);
            setSuppressions(suppressionRows);
            setIncidents(incidentRows);
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Bakım verileri yüklenemedi." });
        } finally {
            setLoading(false);
        }
    }, [entityType, from, internalOperator, notificationType, recipient, status, to, toast]);

    useEffect(() => { void load(); }, [load]);

    const metrics = useMemo(() => ({
        total: deliveries.length,
        delivered: deliveries.filter(x => x.delivery_status === "delivered").length,
        problem: deliveries.filter(x => ["failed", "bounced", "complained", "suppressed"].includes(x.delivery_status)).length,
    }), [deliveries]);

    const action = async (id: string, url: string, method = "POST") => {
        setWorkingId(id);
        try {
            const res = await fetch(url, { method });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "İşlem tamamlanamadı.");
            toast({ type: "success", message: "İşlem tamamlandı." });
            await load();
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "İşlem tamamlanamadı." });
        } finally {
            setWorkingId(null);
        }
    };

    if (permissionLoading) return <div style={{ padding: 24, color: "var(--text-secondary)" }}>Yükleniyor…</div>;
    if (!internalOperator) return <div style={{ padding: 24, color: "var(--text-secondary)" }}>Bu bakım alanına erişiminiz yok.</div>;

    return (
        <div style={{ padding: "22px 24px 40px", display: "grid", gap: "18px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: 20, color: "var(--text-primary)" }}>E-posta Teslimatları</h1>
                    <p style={{ margin: "5px 0 0", color: "var(--text-secondary)", fontSize: 13 }}>Outbox, Resend teslimatı ve suppression kayıtlarını güvenli biçimde izleyin.</p>
                </div>
                <Button variant="secondary" size="sm" leftIcon={<RefreshCw size={14} />} onClick={() => void load()} loading={loading}>Yenile</Button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10 }}>
                {[
                    { label: "Görüntülenen", value: metrics.total, icon: MailCheck, tone: "var(--accent-text)" },
                    { label: "Teslim Edilen", value: metrics.delivered, icon: CheckCircle2, tone: "var(--success-text)" },
                    { label: "Sorunlu", value: metrics.problem, icon: AlertTriangle, tone: "var(--danger-text)" },
                    { label: "Açık Bakım Kaydı", value: incidents.length, icon: Wrench, tone: "var(--warning-text)" },
                ].map(item => (
                    <div key={item.label} style={{ border: "var(--line-width) solid var(--surface-border)", borderRadius: 8, padding: 14, background: "var(--surface-raised)", boxShadow: "var(--surface-shadow-sm)" }}>
                        <item.icon size={16} color={item.tone} aria-hidden="true" />
                        <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8, color: "var(--text-primary)" }}>{item.value}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{item.label}</div>
                    </div>
                ))}
            </div>

            <section style={{ border: "var(--line-width) solid var(--surface-border)", borderRadius: 8, background: "var(--surface-raised)", overflow: "hidden", boxShadow: "var(--surface-shadow-sm)" }}>
                <div style={{ padding: 14, display: "grid", gridTemplateColumns: compactFilters ? "1fr" : "repeat(auto-fit, minmax(125px, 1fr))", gap: 8, alignItems: "center", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>
                    <select aria-label="Teslimat durumu" value={status} onChange={e => setStatus(e.target.value)} style={{ width: "100%", minWidth: 0, height: 34, borderRadius: 6, border: "var(--line-width) solid var(--border-secondary)", background: "var(--input-bg)", color: "var(--text-primary)", padding: "0 10px" }}>
                        <option value="">Tüm durumlar</option>
                        {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                    </select>
                    <select aria-label="Bildirim türü" value={notificationType} onChange={e => setNotificationType(e.target.value)} style={{ width: "100%", minWidth: 0, height: 34, borderRadius: 6, border: "var(--line-width) solid var(--border-secondary)", background: "var(--input-bg)", color: "var(--text-primary)", padding: "0 10px" }}>
                        <option value="">Tüm bildirim türleri</option>
                        <option value="stock_critical">Kritik stok</option>
                        <option value="order_pending">Sipariş onayı</option>
                        <option value="order_shipped">Sipariş sevki</option>
                        <option value="sync_error">Paraşüt sorunu</option>
                        <option value="quote_customer_send">Müşteri teklifi</option>
                    </select>
                    <input aria-label="Alıcı ara" value={recipient} onChange={e => setRecipient(e.target.value)} placeholder="Alıcı ara" style={{ width: "100%", minWidth: 0, height: 34, borderRadius: 6, border: "var(--line-width) solid var(--border-secondary)", background: "var(--input-bg)", color: "var(--text-primary)", padding: "0 10px" }} />
                    <input aria-label="Entity türü" value={entityType} onChange={e => setEntityType(e.target.value)} placeholder="Entity türü" style={{ width: "100%", minWidth: 0, height: 34, borderRadius: 6, border: "var(--line-width) solid var(--border-secondary)", background: "var(--input-bg)", color: "var(--text-primary)", padding: "0 10px" }} />
                    <input aria-label="Başlangıç tarihi" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: "100%", minWidth: 0, height: 34, borderRadius: 6, border: "var(--line-width) solid var(--border-secondary)", background: "var(--input-bg)", color: "var(--text-primary)", padding: "0 10px" }} />
                    <input aria-label="Bitiş tarihi" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: "100%", minWidth: 0, height: 34, borderRadius: 6, border: "var(--line-width) solid var(--border-secondary)", background: "var(--input-bg)", color: "var(--text-primary)", padding: "0 10px" }} />
                    <Button variant="secondary" size="sm" fullWidth onClick={() => void load()}>Filtrele</Button>
                </div>
                <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", minWidth: 900, borderCollapse: "collapse", fontSize: 12 }}>
                        <thead><tr>{["Durum", "Konu", "Alıcı", "Tür", "Oluşturma", "Deneme", "Aksiyon"].map(x => <th key={x} style={{ padding: "9px 12px", textAlign: "left", color: "var(--text-secondary)", borderBottom: "var(--line-width) solid var(--border-secondary)" }}>{x}</th>)}</tr></thead>
                        <tbody>
                            {deliveries.map(row => {
                                const meta = STATUS_META[row.delivery_status];
                                const retryable = !!row.outbox_id && row.status === "failed" && !["bounced", "complained", "suppressed"].includes(row.delivery_status);
                                return <tr key={row.id}>
                                    <td style={{ padding: "10px 12px", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}><span style={{ padding: "3px 7px", borderRadius: 5, color: meta.color, background: meta.bg, border: `var(--line-width) solid ${meta.border}` }}>{meta.label}</span></td>
                                    <td title={row.subject} style={{ maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", padding: "10px 12px", color: "var(--text-primary)", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>{row.subject}</td>
                                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>{row.recipient_email}</td>
                                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>{row.notification_type}</td>
                                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>{formatDate(row.created_at)}</td>
                                    <td style={{ padding: "10px 12px", color: "var(--text-secondary)", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>{row.attempt_count}</td>
                                    <td style={{ padding: "10px 12px", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>
                                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                            <Button variant="secondary" size="xs" onClick={() => setSelectedDelivery(row)}>İncele</Button>
                                            {retryable && <Button variant="secondary" size="xs" loading={workingId === row.id} onClick={() => void action(row.id, `/api/maintenance/email-deliveries/${row.id}/retry`)}>Tekrar Dene</Button>}
                                        </div>
                                    </td>
                                </tr>;
                            })}
                        </tbody>
                    </table>
                </div>
            </section>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 14 }}>
                <section style={{ border: "var(--line-width) solid var(--surface-border)", borderRadius: 8, background: "var(--surface-raised)", padding: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 14, color: "var(--text-primary)", display: "flex", gap: 7, alignItems: "center" }}><ShieldOff size={15} aria-hidden="true" />Aktif Suppression</h2>
                    {suppressions.length === 0 ? <p style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Aktif suppression yok.</p> : suppressions.map(row => <div key={row.id} style={{ padding: "10px 0", borderBottom: "var(--line-width) solid var(--border-tertiary)", display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div><div style={{ color: "var(--text-primary)", fontSize: 12 }}>{row.recipient_email}</div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{row.reason} · {row.scope_key}</div></div>
                        <Button variant="dangerSoft" size="xs" loading={workingId === row.id} onClick={() => void action(row.id, `/api/maintenance/email-suppressions/${row.id}`, "PATCH")}>Kaldır</Button>
                    </div>)}
                </section>
                <section style={{ border: "var(--line-width) solid var(--surface-border)", borderRadius: 8, background: "var(--surface-raised)", padding: 14 }}>
                    <h2 style={{ margin: 0, fontSize: 14, color: "var(--text-primary)", display: "flex", gap: 7, alignItems: "center" }}><Wrench size={15} aria-hidden="true" />Açık Bakım Kayıtları</h2>
                    {incidents.length === 0 ? <p style={{ color: "var(--text-tertiary)", fontSize: 12 }}>Açık bakım kaydı yok.</p> : incidents.map(row => <div key={row.id} style={{ padding: "10px 0", borderBottom: "var(--line-width) solid var(--border-tertiary)", display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <div><div style={{ color: "var(--text-primary)", fontSize: 12 }}>{row.title}</div><div style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{row.description}</div></div>
                        <Button variant="secondary" size="xs" loading={workingId === row.id} onClick={() => void action(row.id, `/api/maintenance/incidents/${row.id}`, "PATCH")}>Çözüldü</Button>
                    </div>)}
                </section>
            </div>

            {selectedDelivery && (
                <>
                    <button
                        type="button"
                        aria-label="Teslimat detayını kapat"
                        onClick={() => setSelectedDelivery(null)}
                        style={{ position: "fixed", inset: 0, border: 0, background: "rgba(0,0,0,0.38)", zIndex: 80, cursor: "default" }}
                    />
                    <aside
                        aria-label="E-posta teslimat detayı"
                        style={{
                            position: "fixed",
                            zIndex: 81,
                            top: 0,
                            right: 0,
                            width: "min(420px, calc(100vw - 16px))",
                            height: "100dvh",
                            background: "var(--surface-raised)",
                            borderLeft: "var(--line-width) solid var(--surface-border)",
                            boxShadow: "var(--surface-shadow)",
                            padding: 18,
                            overflowY: "auto",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingBottom: 14, borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>
                            <div>
                                <div style={{ color: "var(--text-tertiary)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0 }}>Teslimat Detayı</div>
                                <h2 style={{ margin: "5px 0 0", color: "var(--text-primary)", fontSize: 16, lineHeight: 1.35 }}>{selectedDelivery.subject}</h2>
                            </div>
                            <Button variant="icon" size="sm" iconOnly aria-label="Teslimat detayını kapat" leftIcon={<X size={15} />} onClick={() => setSelectedDelivery(null)} />
                        </div>
                        <div style={{ display: "grid", gap: 0, marginTop: 10 }}>
                            {[
                                ["Durum", STATUS_META[selectedDelivery.delivery_status].label],
                                ["Alıcı", selectedDelivery.recipient_email],
                                ["Bildirim türü", selectedDelivery.notification_type],
                                ["Entity", [selectedDelivery.entity_type, selectedDelivery.entity_id].filter(Boolean).join(" · ") || "—"],
                                ["Oluşturma", formatDate(selectedDelivery.created_at)],
                                ["Resend kabul", formatDate(selectedDelivery.sent_at)],
                                ["Son provider olayı", formatDate(selectedDelivery.provider_event_at)],
                                ["Teslim", formatDate(selectedDelivery.delivered_at)],
                                ["Bounce", formatDate(selectedDelivery.bounced_at)],
                                ["Spam şikâyeti", formatDate(selectedDelivery.complained_at)],
                                ["Deneme sayısı", String(selectedDelivery.attempt_count)],
                            ].map(([label, value]) => (
                                <div key={label} style={{ display: "grid", gridTemplateColumns: "130px 1fr", gap: 10, padding: "10px 0", borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>
                                    <span style={{ color: "var(--text-tertiary)", fontSize: 11 }}>{label}</span>
                                    <span style={{ color: "var(--text-primary)", fontSize: 12, overflowWrap: "anywhere" }}>{value}</span>
                                </div>
                            ))}
                        </div>
                        {selectedDelivery.error_message && (
                            <div style={{ marginTop: 14, padding: 12, borderRadius: 7, border: "var(--line-width) solid var(--danger-border)", background: "var(--danger-bg)", color: "var(--danger-text)", fontSize: 12, lineHeight: 1.55 }}>
                                <strong style={{ display: "block", marginBottom: 4 }}>Güvenli hata özeti</strong>
                                {selectedDelivery.error_message}
                            </div>
                        )}
                    </aside>
                </>
            )}
        </div>
    );
}
