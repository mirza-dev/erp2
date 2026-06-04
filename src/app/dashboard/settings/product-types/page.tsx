"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { ProductType } from "@/lib/mock-data";
import { mapProductType } from "@/lib/api-mappers";
import type { ProductTypeRow } from "@/lib/database.types";

/** Liste endpoint'i artık her tipin fieldCount'unu döner (N+1 fetch kaldırıldı). */
type ProductTypeListRowApi = ProductTypeRow & { fieldCount?: number };

interface ProductTypeListItem extends ProductType {
    fieldCount: number;
}

const containerStyle: React.CSSProperties = {
    padding: "24px",
    maxWidth: "1100px",
    margin: "0 auto",
};

const headerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "24px",
};

const cardGridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
};

const cardStyle: React.CSSProperties = {
    background: "var(--bg-secondary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "8px",
    padding: "16px",
    cursor: "pointer",
    transition: "border-color 120ms ease",
};

const cardIconStyle: React.CSSProperties = {
    fontSize: "32px",
    marginBottom: "8px",
};

const cardTitleStyle: React.CSSProperties = {
    fontSize: "16px",
    fontWeight: 600,
    color: "var(--text-primary)",
    marginBottom: "4px",
};

const cardMetaStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-tertiary)",
    marginBottom: "8px",
};

const cardDescStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--text-secondary)",
    minHeight: "36px",
    lineHeight: 1.4,
};

const systemBadgeStyle: React.CSSProperties = {
    display: "inline-block",
    fontSize: "10px",
    padding: "2px 6px",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    borderRadius: "4px",
    marginLeft: "8px",
    verticalAlign: "middle",
};

const modalBackdropStyle: React.CSSProperties = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    zIndex: 200,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
};

const modalStyle: React.CSSProperties = {
    background: "var(--bg-primary)",
    border: "0.5px solid var(--border-tertiary)",
    borderRadius: "10px",
    padding: "24px",
    width: "100%",
    maxWidth: "440px",
    zIndex: 201,
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

const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
};

const errStyle: React.CSSProperties = {
    color: "var(--danger)",
    fontSize: "12px",
    marginTop: "8px",
};

export default function ProductTypesPage() {
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [types, setTypes] = useState<ProductTypeListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Modal state
    const [showCreate, setShowCreate] = useState(false);
    const [createName, setCreateName] = useState("");
    const [createIcon, setCreateIcon] = useState("");
    const [createDescription, setCreateDescription] = useState("");
    const [createError, setCreateError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);

    const loadTypes = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/product-types");
            if (!res.ok) throw new Error("Tipler yüklenemedi");
            const rows = (await res.json()) as ProductTypeListRowApi[];

            // Alan sayısı liste endpoint'inden tek sorguda gelir (N+1 fetch kaldırıldı).
            const items: ProductTypeListItem[] = rows.map((row) => ({
                ...mapProductType(row),
                fieldCount: row.fieldCount ?? 0,
            }));

            setTypes(items);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Bilinmeyen hata");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadTypes();
    }, [loadTypes]);

    const openCreate = () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setCreateName("");
        setCreateIcon("📦");
        setCreateDescription("");
        setCreateError(null);
        setShowCreate(true);
    };

    const submitCreate = async () => {
        setCreateError(null);
        if (!createName.trim()) {
            setCreateError("Tip adı zorunludur.");
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
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error ?? "Tip oluşturulamadı");
            }
            const row = (await res.json()) as ProductTypeRow;
            toast({ type: "success", message: `"${row.name}" tipi oluşturuldu.` });
            setShowCreate(false);
            loadTypes();
        } catch (e) {
            setCreateError(e instanceof Error ? e.message : "Bilinmeyen hata");
        } finally {
            setCreating(false);
        }
    };

    return (
        <div style={containerStyle}>
            <div style={headerStyle}>
                <div>
                    <h1 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "4px" }}>Ürün Tipleri</h1>
                    <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                        Her tipin teknik alanlarını burada tanımla. Hazır 8 tip ile başla, kendine özel tipler ekle.
                    </div>
                </div>
                <Button
                    onClick={openCreate}
                    disabled={isDemo}
                    title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                >
                    + Yeni Tip Ekle
                </Button>
            </div>

            {loading && <div style={{ color: "var(--text-secondary)" }}>Yükleniyor...</div>}
            {error && <div style={errStyle} role="alert">{error}</div>}

            {!loading && !error && (
                <div style={cardGridStyle}>
                    {types.map((t) => (
                        <Link
                            key={t.id}
                            href={`/dashboard/settings/product-types/${t.id}`}
                            style={{ ...cardStyle, textDecoration: "none", display: "block" }}
                            aria-label={`${t.name} tipini düzenle`}
                        >
                            <div style={cardIconStyle}>{t.icon ?? "📦"}</div>
                            <div style={cardTitleStyle}>
                                {t.name}
                                {t.isSystem && <span style={systemBadgeStyle}>SİSTEM</span>}
                            </div>
                            <div style={cardMetaStyle}>{t.fieldCount} alan</div>
                            <div style={cardDescStyle}>{t.description ?? "—"}</div>
                        </Link>
                    ))}
                </div>
            )}

            {!loading && !error && types.length === 0 && (
                <div style={{ color: "var(--text-tertiary)", marginTop: "24px" }}>
                    Henüz tip yok. Yeni Tip Ekle ile başla.
                </div>
            )}

            {showCreate && (
                <div style={modalBackdropStyle} role="dialog" aria-modal="true" aria-label="Yeni tip ekle">
                    <div style={modalStyle}>
                        <h2 style={{ fontSize: "16px", fontWeight: 600, marginBottom: "16px" }}>
                            Yeni Ürün Tipi
                        </h2>

                        <label style={labelStyle}>Tip Adı *</label>
                        <input
                            type="text"
                            value={createName}
                            onChange={(e) => setCreateName(e.target.value)}
                            placeholder="örn: Pompa"
                            style={inputStyle}
                            aria-label="Tip adı"
                            autoFocus
                        />

                        <label style={{ ...labelStyle, marginTop: "12px" }}>Icon (emoji)</label>
                        <input
                            type="text"
                            value={createIcon}
                            onChange={(e) => setCreateIcon(e.target.value)}
                            placeholder="📦"
                            style={inputStyle}
                            aria-label="Icon"
                            maxLength={4}
                        />

                        <label style={{ ...labelStyle, marginTop: "12px" }}>Açıklama (opsiyonel)</label>
                        <textarea
                            value={createDescription}
                            onChange={(e) => setCreateDescription(e.target.value)}
                            placeholder="Bu tip neyi kapsar?"
                            style={{ ...inputStyle, minHeight: "60px", resize: "vertical" as const }}
                            aria-label="Açıklama"
                        />

                        {createError && <div style={errStyle} role="alert" aria-live="polite">{createError}</div>}

                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end", marginTop: "16px" }}>
                            <Button variant="ghost" onClick={() => setShowCreate(false)} disabled={creating}>
                                İptal
                            </Button>
                            <Button onClick={submitCreate} disabled={creating || isDemo}>
                                {creating ? "Kaydediliyor..." : "Kaydet"}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

