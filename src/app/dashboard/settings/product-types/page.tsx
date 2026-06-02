"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ArchiveRestore,
    Boxes,
    CheckCircle2,
    Eye,
    Plus,
    SlidersHorizontal,
} from "lucide-react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP, useIsDemo } from "@/lib/demo-utils";
import type { ProductTypeStatsRow } from "@/lib/supabase/product-types";

const pageStyle: React.CSSProperties = {
    padding: "24px",
    maxWidth: "1180px",
    margin: "0 auto",
};

const toolbarStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    marginBottom: "18px",
};

const metricGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "14px",
};

const metricStyle: React.CSSProperties = {
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px",
    background: "var(--bg-secondary)",
    padding: "12px 14px",
    minHeight: "70px",
};

const tableWrapStyle: React.CSSProperties = {
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px",
    overflow: "hidden",
    background: "var(--bg-primary)",
};

const thStyle: React.CSSProperties = {
    padding: "10px 12px",
    fontSize: "11px",
    color: "var(--text-tertiary)",
    textAlign: "left",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    borderBottom: "0.5px solid var(--border-tertiary)",
    background: "var(--bg-secondary)",
};

const tdStyle: React.CSSProperties = {
    padding: "12px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
    fontSize: "13px",
    verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
    width: "100%",
    fontSize: "13px",
    padding: "8px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    boxSizing: "border-box",
};

const modalBackdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "18px",
};

const modalStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "460px",
    background: "var(--bg-primary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px",
    padding: "20px",
};

function Metric({
    label,
    value,
    sub,
    icon,
}: {
    label: string;
    value: string | number;
    sub: string;
    icon: React.ReactNode;
}) {
    return (
        <div style={metricStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                <span style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
                <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
            </div>
            <div style={{ fontSize: "22px", fontWeight: 700, color: "var(--text-primary)", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "6px" }}>{sub}</div>
        </div>
    );
}

function statusBadge(type: ProductTypeStatsRow): React.ReactNode {
    if (!type.is_active) {
        return (
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", border: "0.5px solid var(--border-secondary)", borderRadius: "999px", padding: "3px 8px" }}>
                Pasif
            </span>
        );
    }
    if (type.missing_required_product_count > 0) {
        return (
            <span style={{ fontSize: "11px", color: "var(--warning-text)", background: "var(--warning-bg)", border: "0.5px solid var(--warning-border)", borderRadius: "999px", padding: "3px 8px" }}>
                {type.missing_required_product_count} ürün eksik
            </span>
        );
    }
    if (type.product_count === 0) {
        return (
            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", border: "0.5px solid var(--border-secondary)", borderRadius: "999px", padding: "3px 8px" }}>
                Kullanılmıyor
            </span>
        );
    }
    return (
        <span style={{ fontSize: "11px", color: "var(--success-text)", background: "var(--success-bg)", border: "0.5px solid var(--success-border)", borderRadius: "999px", padding: "3px 8px" }}>
            Tamam
        </span>
    );
}

export default function TechnicalTemplatesPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [templates, setTemplates] = useState<ProductTypeStatsRow[]>([]);
    const [showInactive, setShowInactive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createIcon, setCreateIcon] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const loadTemplates = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const query = new URLSearchParams({ withStats: "1" });
            if (showInactive) query.set("includeInactive", "1");
            const res = await fetch(`/api/product-types?${query.toString()}`);
            if (!res.ok) throw new Error("Teknik şablonlar yüklenemedi");
            const data = await res.json() as ProductTypeStatsRow[];
            setTemplates(data);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Bilinmeyen hata");
        } finally {
            setLoading(false);
        }
    }, [showInactive]);

    useEffect(() => {
        void loadTemplates();
    }, [loadTemplates]);

    const metrics = useMemo(() => {
        const active = templates.filter(t => t.is_active);
        return {
            activeCount: active.length,
            usedProducts: active.reduce((sum, t) => sum + t.product_count, 0),
            unusedTemplates: active.filter(t => t.product_count === 0).length,
            missingProducts: active.reduce((sum, t) => sum + t.missing_required_product_count, 0),
        };
    }, [templates]);

    function openCreate() {
        if (isDemo) {
            toast({ type: "info", message: DEMO_BLOCK_TOAST });
            return;
        }
        setCreateName("");
        setCreateDescription("");
        setCreateIcon("");
        setCreateError(null);
        setShowCreate(true);
    }

    async function submitCreate() {
        setCreateError(null);
        if (!createName.trim()) {
            setCreateError("Şablon adı zorunludur.");
            return;
        }
        setCreating(true);
        try {
            const res = await fetch("/api/product-types", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: createName.trim(),
                    description: createDescription.trim() || null,
                    icon: createIcon.trim() || null,
                }),
            });
            const body = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(body.error ?? "Şablon oluşturulamadı");
            toast({ type: "success", message: "Teknik şablon oluşturuldu." });
            setShowCreate(false);
            await loadTemplates();
        } catch (err) {
            setCreateError(err instanceof Error ? err.message : "Bilinmeyen hata");
        } finally {
            setCreating(false);
        }
    }

    return (
        <div style={pageStyle}>
            <div style={toolbarStyle}>
                <div>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 4px", color: "var(--text-primary)" }}>
                        Teknik Şablonlar
                    </h1>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        Ürün katalog alanları, teknik veri kalitesi ve AI import şeması.
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Button
                        variant={showInactive ? "primary" : "secondary"}
                        onClick={() => setShowInactive(v => !v)}
                        aria-pressed={showInactive}
                    >
                        <Eye size={14} />
                        Pasifleri Göster
                    </Button>
                    <Button onClick={openCreate} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                        <Plus size={14} />
                        Yeni Şablon
                    </Button>
                </div>
            </div>

            <div style={metricGridStyle}>
                <Metric label="Aktif Şablon" value={metrics.activeCount} sub="Yeni ürünlerde seçilebilir" icon={<SlidersHorizontal size={16} />} />
                <Metric label="Ürün Kullanımı" value={metrics.usedProducts} sub="Aktif şablon bağlı ürün" icon={<Boxes size={16} />} />
                <Metric label="Boş Şablon" value={metrics.unusedTemplates} sub="Henüz üründe kullanılmıyor" icon={<ArchiveRestore size={16} />} />
                <Metric label="Eksik Bilgi" value={metrics.missingProducts} sub="Zorunlu teknik alan eksiği" icon={<AlertTriangle size={16} />} />
            </div>

            {error && (
                <div role="alert" style={{ color: "var(--danger-text)", background: "var(--danger-bg)", border: "0.5px solid var(--danger-border)", borderRadius: "6px", padding: "10px 12px", marginBottom: "12px" }}>
                    {error}
                </div>
            )}

            <div style={tableWrapStyle}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr>
                            <th style={thStyle}>Şablon</th>
                            <th style={thStyle}>Ürün</th>
                            <th style={thStyle}>Alan</th>
                            <th style={thStyle}>Zorunlu</th>
                            <th style={thStyle}>Eksik Veri</th>
                            <th style={thStyle}>Durum</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>İşlem</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan={7} style={{ ...tdStyle, color: "var(--text-tertiary)" }}>Yükleniyor…</td>
                            </tr>
                        ) : templates.length === 0 ? (
                            <tr>
                                <td colSpan={7} style={{ ...tdStyle, color: "var(--text-tertiary)" }}>Teknik şablon yok.</td>
                            </tr>
                        ) : templates.map(template => (
                            <tr key={template.id} style={{ opacity: template.is_active ? 1 : 0.55 }}>
                                <td style={tdStyle}>
                                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                        <span style={{
                                            width: "30px",
                                            height: "30px",
                                            borderRadius: "8px",
                                            border: "0.5px solid var(--border-secondary)",
                                            display: "inline-flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            color: "var(--text-secondary)",
                                            background: "var(--bg-secondary)",
                                            flex: "0 0 auto",
                                        }}>
                                            {template.icon || <SlidersHorizontal size={15} />}
                                        </span>
                                        <div>
                                            <Link
                                                href={`/dashboard/settings/product-types/${template.id}`}
                                                style={{ color: "var(--text-primary)", textDecoration: "none", fontWeight: 650 }}
                                            >
                                                {template.name}
                                            </Link>
                                            {template.description && (
                                                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px", maxWidth: "360px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                                    {template.description}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td style={tdStyle}>{template.product_count}</td>
                                <td style={tdStyle}>{template.field_count}</td>
                                <td style={tdStyle}>{template.required_field_count}</td>
                                <td style={tdStyle}>{statusBadge(template)}</td>
                                <td style={tdStyle}>
                                    {template.is_active ? (
                                        <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--success-text)", fontSize: "12px" }}>
                                            <CheckCircle2 size={13} /> Aktif
                                        </span>
                                    ) : (
                                        <span style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>Pasif</span>
                                    )}
                                </td>
                                <td style={{ ...tdStyle, textAlign: "right" }}>
                                    <Link href={`/dashboard/settings/product-types/${template.id}`} style={{ color: "var(--accent-text)", textDecoration: "none", fontWeight: 600 }}>
                                        Düzenle
                                    </Link>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showCreate && (
                <div style={modalBackdropStyle} role="dialog" aria-modal="true" aria-label="Yeni teknik şablon">
                    <div style={modalStyle}>
                        <h2 style={{ fontSize: "16px", fontWeight: 700, margin: "0 0 14px" }}>Yeni Teknik Şablon</h2>
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                            <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                Şablon Adı
                                <input aria-label="Şablon adı" value={createName} onChange={e => setCreateName(e.target.value)} style={{ ...inputStyle, marginTop: "4px" }} />
                            </label>
                            <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                Kısa Simge
                                <input aria-label="Kısa simge" value={createIcon} onChange={e => setCreateIcon(e.target.value)} style={{ ...inputStyle, marginTop: "4px" }} maxLength={4} placeholder="V" />
                            </label>
                            <label style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                Açıklama
                                <textarea aria-label="Açıklama" value={createDescription} onChange={e => setCreateDescription(e.target.value)} style={{ ...inputStyle, marginTop: "4px", minHeight: "72px", resize: "vertical" }} />
                            </label>
                        </div>
                        {createError && <div role="alert" style={{ color: "var(--danger-text)", fontSize: "12px", marginTop: "10px" }}>{createError}</div>}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                            <Button variant="secondary" onClick={() => setShowCreate(false)} disabled={creating}>İptal</Button>
                            <Button onClick={submitCreate} loading={creating}>Oluştur</Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
