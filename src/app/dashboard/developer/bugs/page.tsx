"use client";

import { useMemo, useState } from "react";
import { useUrlFilters } from "@/hooks/useUrlFilters";
import { useDebouncedSearch } from "@/hooks/useListUrlState";
import useSWR from "swr";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import Input, { Select, Textarea, labelStyle as sharedLabelStyle } from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/StateViews";
import { useToast } from "@/components/ui/Toast";
import { jsonFetcher, SWR_DEFAULTS } from "@/lib/swr-config";
import type {
    DeveloperBugPriority,
    DeveloperBugRow,
    DeveloperBugStatus,
} from "@/lib/database.types";
import {
    BUG_PRIORITIES,
    BUG_PRIORITY_LABELS,
    BUG_STATUSES,
    BUG_STATUS_LABELS,
    type BugWithErrorsPayload,
} from "@/lib/telemetry/console-types";
import {
    formatDateTime,
    formatRelative,
} from "@/components/developer/console-format";

const PRIORITY_TONE: Record<DeveloperBugPriority, "neutral" | "accent" | "warning" | "danger"> = {
    low: "neutral",
    medium: "accent",
    high: "warning",
    critical: "danger",
};

/** Kapanmış sayılan durumlar — listede soluk gösterilir. */
const CLOSED: readonly DeveloperBugStatus[] = ["fixed", "closed", "ignored"];

export default function DeveloperBugsPage() {
    const { toast } = useToast();
    // A4: filtreler URL'de — "açık kritik bug'lar" linki paylaşılabilir.
    const { values, set } = useUrlFilters({ status: "", priority: "", search: "" });
    const { status, priority, search } = values;
    const searchInput = useDebouncedSearch(search, v => set({ search: v }));
    const [createOpen, setCreateOpen] = useState(false);
    const [editing, setEditing] = useState<DeveloperBugRow | null>(null);

    const query = useMemo(() => {
        const q = new URLSearchParams();
        if (status) q.set("status", status);
        if (priority) q.set("priority", priority);
        if (search.trim()) q.set("search", search.trim());
        return q;
    }, [status, priority, search]);

    const { data, error, isLoading, isValidating, mutate } = useSWR<DeveloperBugRow[]>(
        `/api/developer/bugs?${query}`, jsonFetcher, SWR_DEFAULTS,
    );

    const bugs = data ?? [];

    const columns: DataTableColumn<DeveloperBugRow>[] = [
        {
            key: "priority",
            header: "Öncelik",
            width: "90px",
            cell: row => (
                <Badge tone={PRIORITY_TONE[row.priority]}>{BUG_PRIORITY_LABELS[row.priority]}</Badge>
            ),
        },
        {
            key: "title",
            header: "Başlık",
            cell: row => (
                <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
                        {row.title}
                    </div>
                    {row.description && (
                        <div style={{
                            fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "2px",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                            maxWidth: "460px",
                        }}>
                            {row.description}
                        </div>
                    )}
                </div>
            ),
        },
        {
            key: "status",
            header: "Durum",
            width: "150px",
            cell: row => (
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                    {BUG_STATUS_LABELS[row.status]}
                </span>
            ),
        },
        {
            key: "created",
            header: "Oluşturma",
            width: "130px",
            cell: row => (
                <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>
                    {formatRelative(row.created_at)}
                </span>
            ),
        },
        {
            key: "updated",
            header: "Güncelleme",
            width: "140px",
            cell: row => (
                <span style={{ fontSize: "11.5px", color: "var(--text-tertiary)" }}>
                    {formatDateTime(row.updated_at)}
                </span>
            ),
        },
    ];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            <PageHeader
                title="Bug'lar"
                subtitle={
                    <>
                        Hata sistemin ürettiği teknik olaydır; bug senin takip ettiğin
                        problemdir. <strong>{bugs.length}</strong> kayıt.
                    </>
                }
                onRefresh={() => void mutate()}
                refreshing={isValidating}
                refreshAriaLabel="Bug listesini yenile"
                actions={
                    <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                        Yeni Bug
                    </Button>
                }
            />

            <Card>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                    <Select
                        inputSize="sm"
                        aria-label="Durum filtresi"
                        value={status}
                        onChange={e => set({ status: e.target.value })}
                        style={{ width: "auto", minWidth: "150px" }}
                    >
                        <option value="">Tüm durumlar</option>
                        {BUG_STATUSES.map(s => (
                            <option key={s} value={s}>{BUG_STATUS_LABELS[s]}</option>
                        ))}
                    </Select>
                    <Select
                        inputSize="sm"
                        aria-label="Öncelik filtresi"
                        value={priority}
                        onChange={e => set({ priority: e.target.value })}
                        style={{ width: "auto", minWidth: "130px" }}
                    >
                        <option value="">Tüm öncelikler</option>
                        {BUG_PRIORITIES.map(p => (
                            <option key={p} value={p}>{BUG_PRIORITY_LABELS[p]}</option>
                        ))}
                    </Select>
                    <Input
                        inputSize="sm"
                        type="search"
                        aria-label="Bug ara"
                        placeholder="Başlık / açıklama ara"
                        value={searchInput.value}
                        onChange={e => searchInput.setValue(e.target.value)}
                        style={{ width: "auto", minWidth: "200px", flex: 1 }}
                    />
                </div>
            </Card>

            {isLoading && !data ? (
                <LoadingState message="Bug'lar yükleniyor…" />
            ) : error && !data ? (
                <ErrorState message="Bug listesi yüklenemedi." onRetry={() => void mutate()} />
            ) : bugs.length === 0 ? (
                <Card>
                    <EmptyState
                        title="Bug yok"
                        description="Takibe alınmış bir problem bulunmuyor. Hata detayından 'Bug Oluştur' ile ekleyebilirsin."
                        action={{ label: "Yeni Bug", onClick: () => setCreateOpen(true) }}
                    />
                </Card>
            ) : (
                <DataTable
                    columns={columns}
                    rows={bugs}
                    rowKey={row => row.id}
                    minWidth="820px"
                    onRowClick={row => setEditing(row)}
                    rowAriaLabel={row => `${row.title} bug kaydını düzenle`}
                    rowStyle={row => (CLOSED.includes(row.status) ? { opacity: 0.55 } : {})}
                />
            )}

            {createOpen && (
                <BugModal
                    mode="create"
                    onClose={() => setCreateOpen(false)}
                    onSaved={async () => {
                        setCreateOpen(false);
                        await mutate();
                        toast({ type: "success", message: "Bug oluşturuldu." });
                    }}
                />
            )}

            {editing && (
                <BugModal
                    mode="edit"
                    bug={editing}
                    onClose={() => setEditing(null)}
                    onSaved={async () => {
                        setEditing(null);
                        await mutate();
                        toast({ type: "success", message: "Bug güncellendi." });
                    }}
                />
            )}
        </div>
    );
}

// ── Oluşturma / düzenleme modalı ─────────────────────────────────────────

function BugModal({
    mode,
    bug,
    onClose,
    onSaved,
}: {
    mode: "create" | "edit";
    bug?: DeveloperBugRow;
    onClose: () => void;
    onSaved: () => void | Promise<void>;
}) {
    const { toast } = useToast();
    const [title, setTitle] = useState(bug?.title ?? "");
    const [description, setDescription] = useState(bug?.description ?? "");
    const [notes, setNotes] = useState(bug?.developer_notes ?? "");
    const [status, setStatus] = useState<DeveloperBugStatus>(bug?.status ?? "open");
    const [priority, setPriority] = useState<DeveloperBugPriority>(bug?.priority ?? "medium");
    const [saving, setSaving] = useState(false);

    // Düzenlemede bağlı hataları göstermek için tekil kaydı çekiyoruz.
    const { data: detail } = useSWR<BugWithErrorsPayload>(
        mode === "edit" && bug ? `/api/developer/bugs/${bug.id}` : null,
        jsonFetcher,
        SWR_DEFAULTS,
    );

    const submit = async () => {
        if (!title.trim()) return;
        setSaving(true);
        try {
            const body = {
                title: title.trim(),
                description: description.trim() || null,
                developerNotes: notes.trim() || null,
                status,
                priority,
            };
            const res = await fetch(
                mode === "create" ? "/api/developer/bugs" : `/api/developer/bugs/${bug!.id}`,
                {
                    method: mode === "create" ? "POST" : "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(body),
                },
            );
            if (!res.ok) throw new Error("Kaydedilemedi.");
            await onSaved();
        } catch {
            toast({ type: "error", message: "Bug kaydedilemedi." });
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal
            onClose={onClose}
            labelledBy="bug-modal-title"
            dismissible={!saving}
            width="min(580px, calc(100vw - 28px))"
        >
            <div id="bug-modal-title" style={{ fontSize: "15px", fontWeight: 650, color: "var(--text-primary)" }}>
                {mode === "create" ? "Yeni Bug" : "Bug Düzenle"}
            </div>

            <label htmlFor="bugm-title" style={labelStyle}>Başlık</label>
            <Input id="bugm-title" value={title} maxLength={200} onChange={e => setTitle(e.target.value)} />

            <label htmlFor="bugm-desc" style={labelStyle}>Açıklama</label>
            <Textarea id="bugm-desc" rows={3} value={description} onChange={e => setDescription(e.target.value)} />

            <label htmlFor="bugm-notes" style={labelStyle}>Geliştirici notları</label>
            <Textarea id="bugm-notes" rows={3} value={notes} onChange={e => setNotes(e.target.value)} />

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: "150px" }}>
                    <label htmlFor="bugm-status" style={labelStyle}>Durum</label>
                    <Select id="bugm-status" value={status} onChange={e => setStatus(e.target.value as DeveloperBugStatus)}>
                        {BUG_STATUSES.map(s => <option key={s} value={s}>{BUG_STATUS_LABELS[s]}</option>)}
                    </Select>
                </div>
                <div style={{ flex: 1, minWidth: "150px" }}>
                    <label htmlFor="bugm-priority" style={labelStyle}>Öncelik</label>
                    <Select id="bugm-priority" value={priority} onChange={e => setPriority(e.target.value as DeveloperBugPriority)}>
                        {BUG_PRIORITIES.map(p => <option key={p} value={p}>{BUG_PRIORITY_LABELS[p]}</option>)}
                    </Select>
                </div>
            </div>

            {detail && detail.relatedErrors.length > 0 && (
                <div>
                    <div style={labelStyle}>Bağlı hatalar</div>
                    <ul style={{ margin: "4px 0 0", paddingLeft: "18px" }}>
                        {detail.relatedErrors.map(g => (
                            <li key={g.id} style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "1px 0" }}>
                                {g.title} <span>· {g.occurrence_count} tekrar</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "6px" }}>
                <Button variant="secondary" onClick={onClose} disabled={saving}>İptal</Button>
                <Button
                    variant="primary"
                    onClick={() => void submit()}
                    loading={saving}
                    disabled={saving || !title.trim()}
                >
                    Kaydet
                </Button>
            </div>
        </Modal>
    );
}

const labelStyle: React.CSSProperties = { ...sharedLabelStyle(), display: "block", marginTop: "4px", marginBottom: "3px" };
