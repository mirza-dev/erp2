"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    AlertTriangle,
    ArchiveRestore,
    Boxes,
    CheckCircle2,
    Eye,
    PackageSearch,
    Pencil,
    Plus,
    SlidersHorizontal,
} from "lucide-react";
import Button, { ButtonLink } from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type DataTableColumn } from "@/components/ui/DataTable";
import Card from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { DEMO_BLOCK_TOAST, DEMO_DISABLED_TOOLTIP, useIsDemo } from "@/lib/demo-utils";
import { usePermissions } from "@/lib/auth/use-permissions";
import type { ProductTypeStatsRow } from "@/lib/supabase/product-types";
import { fieldStyle } from "@/components/ui/Input";
import SectionHeader from "@/components/ui/SectionHeader";
import Stat from "@/components/ui/Stat";

const pageStyle: React.CSSProperties = {
    padding: "24px",
    maxWidth: "1180px",
    margin: "0 auto",
};

const metricGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
    gap: "10px",
    marginBottom: "14px",
};

// 2026-08-31: `metricStyle` `--bg-secondary`, `tableWrapStyle` `--bg-primary`
// kullanıyordu. `--bg-secondary` HER İKİ TEMADA sayfa zeminiyle birebir aynı
// renk (#e8eef5 / #131518) — yani metrik kartlarının yüzeyi hiç yoktu, yalnız
// kenarlıkları görünüyordu. İkisi de ortak `Card`'a bağlandı; `Card` dolgusuz
// olduğu için iç boşluk çağıranın işi.
const metricPadStyle: React.CSSProperties = { padding: "12px 14px", minHeight: "70px" };

// Ortak form alanı stili — token tek kaynaktan (`--input-bg`/`--input-border`/
// `--line-width`). Eskiden burada 0.5px + `--border-secondary` + `--bg-tertiary`
// vardı; koyu temada fark görünmüyordu ama AYDINLIK temada her form ekranı
// farklı duruyordu (2026-08-24 tespiti).
const inputStyle: React.CSSProperties = fieldStyle("lg");

/**
 * 2026-09-05: gövde ortak `ui/Stat`e taşındı. İkon etiketin sağından SOLUNA
 * geçti (çerçevenin `icon` yuvası baştadır) ve BÜYÜK HARF düştü — 26 stat
 * yüzeyinin yalnız 6'sı kullanıyordu.
 */
function Metric({ label, value, sub, icon }: {
    label: string; value: string | number; sub: string; icon: React.ReactNode;
}) {
    return (
        <Stat
            label={label}
            value={value}
            sub={sub}
            icon={<span style={{ color: "var(--text-tertiary)", display: "inline-flex" }}>{icon}</span>}
            surfaceStyle={metricPadStyle}
        />
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

/** Mutasyon uçlarının izin listesiyle BİREBİR (api/product-types/**: requirePermission). */
const NO_MANAGE_TOOLTIP = "Bu işlem için yetkiniz yok.";

export default function TechnicalTemplatesPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    // 2026-08-29 — sayfa yalnız `isDemo`ya bakıyordu: yetkisiz rol her butonu
    // ETKİN görüp tıklayınca 403 yiyordu. Kontrol sunucudaki
    // `requirePermission(["manage_product_types","manage_product_master"])`
    // ile birebir aynı; `has()` yüklenmeden true döner (Sidebar emsali) —
    // gerçek kapı sunucuda, bu yalnız UI'ı dürüst tutar.
    const { has } = usePermissions();
    const canManage = has("manage_product_types") || has("manage_product_master");
    const blocked = isDemo || !canManage;
    const blockedTitle = isDemo ? DEMO_DISABLED_TOOLTIP : !canManage ? NO_MANAGE_TOOLTIP : undefined;

    const [templates, setTemplates] = useState<ProductTypeStatsRow[]>([]);
    const [showInactive, setShowInactive] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Şablonsuz ürün sayısı — sayfanın kör noktası (bkz. dbGetProductTypeCoverage).
    const [coverage, setCoverage] = useState<{ totalProducts: number; withoutType: number } | null>(null);

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

    useEffect(() => {
        const ctrl = new AbortController();
        fetch("/api/product-types/coverage", { signal: ctrl.signal })
            .then(r => (r.ok ? r.json() : null))
            .then(d => { if (d) setCoverage(d); })
            .catch(() => {/* iptal veya ağ hatası — kart "—" gösterir */});
        return () => ctrl.abort();
    }, []);

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
        if (!canManage) {
            toast({ type: "error", message: NO_MANAGE_TOOLTIP });
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

    const templateColumns: DataTableColumn<ProductTypeStatsRow>[] = [
        {
            key: "name",
            header: "Şablon",
            cell: template => (
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
            ),
        },
        { key: "products", header: "Ürün", cell: t => t.product_count },
        { key: "fields", header: "Alan", cell: t => t.field_count },
        { key: "required", header: "Zorunlu", cell: t => t.required_field_count },
        { key: "missing", header: "Eksik Veri", cell: t => statusBadge(t) },
        {
            key: "status",
            header: "Durum",
            cell: t => t.is_active ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: "5px", color: "var(--success-text)", fontSize: "12px" }}>
                    <CheckCircle2 size={13} /> Aktif
                </span>
            ) : (
                <span style={{ color: "var(--text-tertiary)", fontSize: "12px" }}>Pasif</span>
            ),
        },
        {
            key: "action",
            header: "İşlem",
            align: "right",
            cell: t => (
                <ButtonLink
                    href={`/dashboard/settings/product-types/${t.id}`}
                    variant="secondary"
                    size="sm"
                    leftIcon={canManage ? <Pencil size={14} /> : <Eye size={14} />}
                >
                    {canManage ? "Düzenle" : "İncele"}
                </ButtonLink>
            ),
        },
    ];

    return (
        <div style={pageStyle}>
            {/* 2026-08-29: elle yazılmış üst şerit → ortak PageHeader (8 liste
                sayfasının standardı). Not/Ayarlar sekmeleri kabuklarını
                panelden alıyor; bağımsız kalan tek sayfa burası. */}
            <div style={{ marginBottom: "18px" }}>
                <PageHeader
                    title="Teknik Şablonlar"
                    subtitle="Ürün katalog alanları, teknik veri kalitesi ve AI import şeması."
                    onRefresh={() => void loadTemplates()}
                    refreshing={loading}
                    refreshAriaLabel="Teknik şablonları yenile"
                    actions={
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <Button
                                variant={showInactive ? "primary" : "secondary"}
                                onClick={() => setShowInactive(v => !v)}
                                aria-pressed={showInactive}
                            >
                                <Eye size={14} />
                                Pasifleri Göster
                            </Button>
                            <Button
                                size="cta"
                                leftIcon={<Plus size={15} />}
                                onClick={openCreate}
                                disabled={blocked}
                                title={blockedTitle}
                            >
                                Yeni Şablon
                            </Button>
                        </div>
                    }
                />
            </div>

            <div style={metricGridStyle}>
                <Metric label="Aktif Şablon" value={metrics.activeCount} sub="Yeni ürünlerde seçilebilir" icon={<SlidersHorizontal size={16} />} />
                <Metric label="Ürün Kullanımı" value={metrics.usedProducts} sub="Aktif şablon bağlı ürün" icon={<Boxes size={16} />} />
                <Metric label="Boş Şablon" value={metrics.unusedTemplates} sub="Henüz üründe kullanılmıyor" icon={<ArchiveRestore size={16} />} />
                <Metric label="Eksik Bilgi" value={metrics.missingProducts} sub="Zorunlu teknik alan eksiği" icon={<AlertTriangle size={16} />} />
                {/* "Eksik Bilgi" yalnız BİR şablona bağlı ürünleri tarar; şablonsuz
                    ürünler hiçbir metriğe girmiyordu. Aktif katalog bugün temiz
                    (0) — bu kart kusuru değil, kör noktayı gösterir. */}
                <Metric
                    label="Şablonsuz Ürün"
                    value={coverage ? coverage.withoutType : "—"}
                    sub={coverage ? `${coverage.totalProducts} aktif ürünün ${coverage.withoutType}'i şablonsuz` : "Yükleniyor…"}
                    icon={<PackageSearch size={16} />}
                />
            </div>

            {error && (
                <div role="alert" style={{ color: "var(--danger-text)", background: "var(--danger-bg)", border: "0.5px solid var(--danger-border)", borderRadius: "6px", padding: "10px 12px", marginBottom: "12px" }}>
                    {error}
                </div>
            )}

            <Card>
                {loading ? (
                    <div style={{ padding: "12px", color: "var(--text-tertiary)", fontSize: "13px" }}>Yükleniyor…</div>
                ) : (
                    <DataTable
                        columns={templateColumns}
                        rows={templates}
                        rowKey={t => t.id}
                        rowStyle={t => ({ opacity: t.is_active ? 1 : 0.55 })}
                        emptyMessage="Teknik şablon yok."
                    />
                )}
            </Card>

            {showCreate && (
                <Modal onClose={() => setShowCreate(false)} ariaLabel="Yeni teknik şablon" dismissible={!creating}>
                        <SectionHeader variant="dialog" style={{ marginBottom: "14px" }}>Yeni Teknik Şablon</SectionHeader>
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
                </Modal>
            )}
        </div>
    );
}
