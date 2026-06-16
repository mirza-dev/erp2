"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { VendorRow, ProductRow } from "@/lib/database.types";

const inputStyle: React.CSSProperties = {
    fontSize: "13px", padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
    background: "var(--bg-tertiary)", color: "var(--text-primary)",
    width: "100%", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = {
    fontSize: "11px", color: "var(--text-tertiary)", display: "block", marginBottom: "3px",
};

interface LineDraft {
    product_id: string;
    product_code: string;
    description: string;
    quantity: string;
    unit: string;
    target_date: string;
    notes: string;
}
const emptyLine: LineDraft = { product_id: "", product_code: "", description: "", quantity: "1", unit: "", target_date: "", notes: "" };

export default function NewRfqPage() {
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [vendors, setVendors] = useState<VendorRow[]>([]);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [loadError, setLoadError] = useState(false);

    const [title, setTitle] = useState("");
    const [currency, setCurrency] = useState("TRY");
    const [dueDate, setDueDate] = useState("");
    const [notes, setNotes] = useState("");
    const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
    const [vendorIds, setVendorIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoadError(false);
        try {
            const [vRes, pRes] = await Promise.all([fetch("/api/vendors"), fetch("/api/products?all=1")]);
            if (!vRes.ok || !pRes.ok) { setLoadError(true); return; }
            setVendors((await vRes.json() as VendorRow[]).filter(v => v.is_active));
            setProducts(await pRes.json());
        } catch { setLoadError(true); }
    }, []);
    useEffect(() => { void load(); }, [load]);

    const updateLine = (idx: number, patch: Partial<LineDraft>) =>
        setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
    const addLine = () => setLines(prev => [...prev, { ...emptyLine }]);
    const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

    const handleProductSelect = (idx: number, productId: string) => {
        const p = products.find(x => x.id === productId);
        updateLine(idx, {
            product_id: productId,
            product_code: p?.sku ?? "",
            description: p?.name ?? "",
            unit: p?.unit ?? "",
        });
    };

    const toggleVendor = (id: string) =>
        setVendorIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);

    const selectedProductIds = useMemo(() => new Set(lines.map(l => l.product_id).filter(Boolean)), [lines]);

    const handleSubmit = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setFormError(null);

        for (const [i, l] of lines.entries()) {
            if (!l.product_id) { setFormError(`Kalem ${i + 1}: ürün seçiniz.`); return; }
            const qty = Number(l.quantity);
            if (!Number.isInteger(qty) || qty <= 0) { setFormError(`Kalem ${i + 1}: miktar pozitif tam sayı olmalı.`); return; }
        }
        if (vendorIds.length === 0) { setFormError("En az 1 tedarikçi seçiniz."); return; }

        setSaving(true);
        try {
            const payload = {
                title: title.trim() || null,
                currency,
                due_date: dueDate || null,
                notes: notes.trim() || null,
                lines: lines.map(l => ({
                    product_id: l.product_id,
                    product_code: l.product_code.trim() || null,
                    description: l.description.trim() || null,
                    quantity: Number(l.quantity),
                    unit: l.unit.trim() || null,
                    target_date: l.target_date || null,
                    notes: l.notes.trim() || null,
                })),
                vendor_ids: vendorIds,
            };
            const res = await fetch("/api/rfqs", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) { setFormError(data.error ?? "Talep oluşturulamadı."); return; }
            toast({ type: "success", message: `Fiyat talebi oluşturuldu: ${data.rfq_number}` });
            router.push(`/dashboard/purchase/rfqs/${data.id}`);
        } catch {
            setFormError("Beklenmeyen bir hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: "920px", margin: "0 auto" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 20px" }}>
                Yeni Fiyat Talebi
            </h1>

            {loadError && (
                <div role="alert" style={{ padding: "10px 14px", marginBottom: "16px", fontSize: "13px", background: "var(--danger-bg)", color: "var(--danger-text)", border: "0.5px solid var(--danger-border)", borderRadius: "6px" }}>
                    Form verileri yüklenemedi. <button onClick={() => void load()} style={{ marginLeft: 8, cursor: "pointer" }}>Yeniden dene</button>
                </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div>
                    <label style={labelStyle} htmlFor="rfq-title">Başlık</label>
                    <input id="rfq-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="ör. DN50 vana fiyat araştırması" style={inputStyle} />
                </div>
                <div>
                    <label style={labelStyle} htmlFor="rfq-currency">Para Birimi</label>
                    <select id="rfq-currency" value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle}>
                        <option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option>
                    </select>
                </div>
                <div>
                    <label style={labelStyle} htmlFor="rfq-due">Yanıt Son Tarihi</label>
                    <input id="rfq-due" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={inputStyle} />
                </div>
            </div>

            {/* Lines */}
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>İstenen Kalemler</strong>
                    <button onClick={addLine} style={{ padding: "4px 12px", fontSize: "12px", background: "var(--bg-tertiary)", color: "var(--text-primary)", border: "0.5px solid var(--border-secondary)", borderRadius: "6px", cursor: "pointer" }}>+ Kalem Ekle</button>
                </div>
                {lines.map((l, idx) => (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "3fr 1fr 1fr 1.2fr auto", gap: "8px", alignItems: "end", marginBottom: "10px" }}>
                        <div>
                            {idx === 0 && <label style={labelStyle}>Ürün</label>}
                            <select value={l.product_id} onChange={e => handleProductSelect(idx, e.target.value)} aria-label={`Kalem ${idx + 1} ürün`} style={inputStyle}>
                                <option value="">Seçiniz...</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            {idx === 0 && <label style={labelStyle}>Miktar</label>}
                            <input type="number" min={1} value={l.quantity} onChange={e => updateLine(idx, { quantity: e.target.value })} aria-label={`Kalem ${idx + 1} miktar`} style={inputStyle} />
                        </div>
                        <div>
                            {idx === 0 && <label style={labelStyle}>Birim</label>}
                            <input value={l.unit} onChange={e => updateLine(idx, { unit: e.target.value })} placeholder="adet" aria-label={`Kalem ${idx + 1} birim`} style={inputStyle} />
                        </div>
                        <div>
                            {idx === 0 && <label style={labelStyle}>İstenen Teslim</label>}
                            <input type="date" value={l.target_date} onChange={e => updateLine(idx, { target_date: e.target.value })} aria-label={`Kalem ${idx + 1} teslim`} style={inputStyle} />
                        </div>
                        <button onClick={() => removeLine(idx)} disabled={lines.length === 1} aria-label={`Kalem ${idx + 1} sil`} style={{ padding: "6px 10px", fontSize: "12px", background: "transparent", color: "var(--danger-text)", border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", cursor: lines.length === 1 ? "not-allowed" : "pointer", opacity: lines.length === 1 ? 0.4 : 1 }}>✕</button>
                    </div>
                ))}
            </div>

            {/* Vendors */}
            <div style={{ background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", padding: "16px", marginBottom: "16px" }}>
                <strong style={{ fontSize: "13px", color: "var(--text-primary)", display: "block", marginBottom: "10px" }}>
                    Tedarikçiler {vendorIds.length > 0 && <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>({vendorIds.length} seçili)</span>}
                </strong>
                {vendors.length === 0 ? (
                    <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Aktif tedarikçi yok. Önce Tedarikçiler sayfasından ekleyin.</div>
                ) : (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "6px" }}>
                        {vendors.map(v => {
                            const selected = vendorIds.includes(v.id);
                            return (
                                <label key={v.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "13px", border: "0.5px solid var(--border-tertiary)", background: selected ? "var(--accent-bg)" : "var(--bg-tertiary)", color: "var(--text-primary)" }}>
                                    <input type="checkbox" checked={selected} onChange={() => toggleVendor(v.id)} aria-label={v.name} />
                                    <span>{v.name}{!v.contact_email && <span style={{ color: "var(--warning-text)", fontSize: "10px" }}> (e-posta yok)</span>}</span>
                                </label>
                            );
                        })}
                    </div>
                )}
                {selectedProductIds.size > 0 && (
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "8px" }}>
                        Seçilen ürünler için fiyat istenecek tedarikçileri işaretleyin (3–5 önerilir).
                    </div>
                )}
            </div>

            {notes !== undefined && (
                <div style={{ marginBottom: "16px" }}>
                    <label style={labelStyle} htmlFor="rfq-notes">Notlar</label>
                    <textarea id="rfq-notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
                </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "16px" }}>
                <button onClick={() => router.push("/dashboard/purchase/rfqs")} style={{ padding: "8px 16px", fontSize: "13px", background: "transparent", color: "var(--text-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "6px", cursor: "pointer" }}>İptal</button>
                <button onClick={handleSubmit} disabled={isDemo || saving} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined} style={{ padding: "8px 16px", fontSize: "13px", background: (isDemo || saving) ? "var(--bg-tertiary)" : "var(--accent)", color: (isDemo || saving) ? "var(--text-tertiary)" : "#fff", border: "none", borderRadius: "6px", cursor: (isDemo || saving) ? "not-allowed" : "pointer", fontWeight: 500 }}>{saving ? "Kaydediliyor..." : "Talep Oluştur"}</button>
            </div>

            {formError && (
                <div role="alert" style={{ padding: "10px 14px", fontSize: "13px", background: "var(--danger-bg)", color: "var(--danger-text)", border: "0.5px solid var(--danger-border)", borderRadius: "6px" }}>{formError}</div>
            )}
        </div>
    );
}
