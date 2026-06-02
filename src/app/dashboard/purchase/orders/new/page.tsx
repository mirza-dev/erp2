"use client";

import { useState, useEffect, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { VendorRow, ProductRow, PurchaseOrderRow, PurchaseOrderLineRow } from "@/lib/database.types";

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
    quantity: string;       // string state (UI), validated to int on submit
    unit_price: string;
    discount_pct: string;
    notes: string;
}

const emptyLine: LineDraft = { product_id: "", quantity: "1", unit_price: "0", discount_pct: "0", notes: "" };

const TODAY = new Date().toISOString().slice(0, 10);

/** Test edilebilir pure helper: PO line satırını UI draft state'ine çevirir.
 * fromDraft preload akışı bunu kullanır. */
export function lineFromDraft(line: PurchaseOrderLineRow): LineDraft {
    return {
        product_id:   line.product_id,
        quantity:     String(line.quantity),
        unit_price:   String(line.unit_price),
        discount_pct: String(line.discount_pct),
        notes:        line.notes ?? "",
    };
}

/** Test edilebilir pure helper: vendor lead_time_days'e göre expected_date hesaplar.
 * Vendor değişimi akışında dirty=false ise çağrılır. */
export function computeExpectedDate(leadTimeDays: number | null | undefined, baseDate: Date = new Date()): string {
    const lead = leadTimeDays ?? 14;
    const d = new Date(baseDate);
    d.setDate(d.getDate() + lead);
    return d.toISOString().slice(0, 10);
}

export default function NewPurchaseOrderPage() {
    // Next.js: useSearchParams Suspense boundary'si gerektirir (prerender).
    return (
        <Suspense fallback={<div style={{ padding: "32px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>Yükleniyor...</div>}>
            <NewPurchaseOrderPageInner />
        </Suspense>
    );
}

function NewPurchaseOrderPageInner() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const fromDraftId = searchParams.get("fromDraft");
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [vendors, setVendors] = useState<VendorRow[]>([]);
    const [products, setProducts] = useState<ProductRow[]>([]);
    const [vendorId, setVendorId] = useState<string>("");
    const [currency, setCurrency] = useState<string>("TRY");
    const [expectedDate, setExpectedDate] = useState<string>("");
    const [expectedDateDirty, setExpectedDateDirty] = useState(false);
    const [notes, setNotes] = useState<string>("");
    const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    useEffect(() => {
        void (async () => {
            try {
                const [vRes, pRes] = await Promise.all([
                    fetch("/api/vendors"),
                    fetch("/api/products?all=1"),
                ]);
                if (vRes.ok) setVendors(await vRes.json());
                if (pRes.ok) setProducts(await pRes.json());
            } catch {
                toast({ type: "error", message: "Veriler yüklenemedi." });
            }
        })();
    }, [toast]);

    // fromDraft preload: detail'deki "Düzenle" → ?fromDraft=<id> ile gelen taslağı yükle
    useEffect(() => {
        if (!fromDraftId) return;
        void (async () => {
            try {
                const res = await fetch(`/api/purchase-orders/${fromDraftId}`);
                if (!res.ok) {
                    toast({ type: "error", message: "Taslak yüklenemedi." });
                    return;
                }
                const draft = await res.json() as PurchaseOrderRow & { lines: PurchaseOrderLineRow[] };
                setVendorId(draft.vendor_id);
                setCurrency(draft.currency);
                setExpectedDate(draft.expected_date ?? "");
                setExpectedDateDirty(true);  // preload sonrası vendor değişimi tarihi ezmesin
                setNotes(draft.notes ?? "");
                setLines(draft.lines.length > 0 ? draft.lines.map(lineFromDraft) : [{ ...emptyLine }]);
                toast({ type: "info", message: `${draft.po_number} satırları yüklendi. Yeni taslak oluşturulacak.` });
            } catch {
                toast({ type: "error", message: "Taslak yüklenirken hata oluştu." });
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fromDraftId]);

    const selectedVendor = useMemo(() => vendors.find(v => v.id === vendorId), [vendors, vendorId]);

    // Vendor seçildiğinde defaults set et: currency + expected_date.
    // expected_date kullanıcı manuel düzenlemediyse (dirty=false) yeni vendor lead_time'ı ile auto-fill.
    useEffect(() => {
        if (!selectedVendor) return;
        setCurrency(selectedVendor.currency);
        if (!expectedDateDirty) {
            setExpectedDate(computeExpectedDate(selectedVendor.lead_time_days));
        }
    }, [selectedVendor, expectedDateDirty]);

    const updateLine = (idx: number, patch: Partial<LineDraft>) => {
        setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
    };
    const addLine = () => setLines(prev => [...prev, { ...emptyLine }]);
    const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

    const grandTotal = useMemo(() => {
        let subtotal = 0;
        for (const l of lines) {
            const qty = Number(l.quantity);
            const price = Number(l.unit_price);
            const disc = Number(l.discount_pct) || 0;
            if (Number.isFinite(qty) && Number.isFinite(price) && qty > 0 && price >= 0) {
                subtotal += qty * price * (1 - disc / 100);
            }
        }
        return Math.round(subtotal * 1.20 * 100) / 100;  // KDV %20
    }, [lines]);

    const handleSubmit = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setFormError(null);

        if (!vendorId) { setFormError("Tedarikçi seçiniz."); return; }
        if (!expectedDate) { setFormError("Beklenen tarih zorunludur."); return; }
        for (const [i, l] of lines.entries()) {
            if (!l.product_id) { setFormError(`Line ${i + 1}: ürün seçiniz.`); return; }
            const qty = Number(l.quantity);
            if (!Number.isInteger(qty) || qty <= 0) { setFormError(`Line ${i + 1}: miktar pozitif tam sayı olmalı.`); return; }
            const price = Number(l.unit_price);
            // Server (validatePoLines) sıfır/negatifi reddeder — client de aynı: price <= 0 geçersiz.
            if (!Number.isFinite(price) || price <= 0) { setFormError(`Line ${i + 1}: birim fiyat sıfırdan büyük olmalı.`); return; }
        }

        setSaving(true);
        try {
            const payload = {
                vendor_id: vendorId,
                currency,
                expected_date: expectedDate,
                notes: notes.trim() || null,
                lines: lines.map(l => ({
                    product_id: l.product_id,
                    quantity: Number(l.quantity),
                    unit_price: Number(l.unit_price),
                    discount_pct: Number(l.discount_pct) || 0,
                    notes: l.notes.trim() || null,
                })),
            };
            const res = await fetch("/api/purchase-orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) { setFormError(data.error ?? "Sipariş oluşturulamadı."); return; }
            toast({ type: "success", message: `Sipariş oluşturuldu: ${data.po_number}` });
            router.push(`/dashboard/purchase/orders/${data.id}`);
        } catch {
            setFormError("Beklenmeyen bir hata oluştu.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 20px" }}>
                Yeni Satın Alma Siparişi
            </h1>

            {/* Header form */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "12px", marginBottom: "20px" }}>
                <div>
                    <label style={labelStyle} htmlFor="po-vendor">Tedarikçi *</label>
                    <select id="po-vendor" value={vendorId} onChange={e => setVendorId(e.target.value)}
                        aria-label="Tedarikçi" style={inputStyle}>
                        <option value="">Seçiniz...</option>
                        {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                </div>
                <div>
                    <label style={labelStyle} htmlFor="po-currency">Para Birimi *</label>
                    <select id="po-currency" value={currency} onChange={e => setCurrency(e.target.value)}
                        aria-label="Para birimi" style={inputStyle}>
                        <option value="TRY">TRY</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                    </select>
                </div>
                <div>
                    <label style={labelStyle} htmlFor="po-expected">Beklenen Tarih *</label>
                    <input id="po-expected" type="date" min={TODAY} value={expectedDate}
                        onChange={e => { setExpectedDate(e.target.value); setExpectedDateDirty(true); }}
                        aria-label="Beklenen tarih"
                        style={inputStyle} />
                </div>
            </div>

            {/* Lines */}
            <div style={{
                background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                borderRadius: "8px", padding: "16px", marginBottom: "16px",
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                    <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>Satırlar</strong>
                    <button onClick={addLine} style={{
                        padding: "4px 12px", fontSize: "12px",
                        background: "var(--bg-tertiary)", color: "var(--text-primary)",
                        border: "0.5px solid var(--border-secondary)", borderRadius: "6px", cursor: "pointer",
                    }}>+ Satır Ekle</button>
                </div>
                {lines.map((l, idx) => (
                    <div key={idx} style={{
                        display: "grid",
                        gridTemplateColumns: "3fr 1fr 1.2fr 1fr auto",
                        gap: "8px", alignItems: "end", marginBottom: "10px",
                    }}>
                        <div>
                            {idx === 0 && <label style={labelStyle}>Ürün</label>}
                            <select value={l.product_id} onChange={e => updateLine(idx, { product_id: e.target.value })}
                                aria-label={`Line ${idx + 1} ürün`} style={inputStyle}>
                                <option value="">Seçiniz...</option>
                                {products.map(p => <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>)}
                            </select>
                        </div>
                        <div>
                            {idx === 0 && <label style={labelStyle}>Miktar</label>}
                            <input type="number" min={1} value={l.quantity}
                                onChange={e => updateLine(idx, { quantity: e.target.value })}
                                aria-label={`Line ${idx + 1} miktar`} style={inputStyle} />
                        </div>
                        <div>
                            {idx === 0 && <label style={labelStyle}>Birim Fiyat</label>}
                            <input type="number" min={0} step="0.01" value={l.unit_price}
                                onChange={e => updateLine(idx, { unit_price: e.target.value })}
                                aria-label={`Line ${idx + 1} birim fiyat`} style={inputStyle} />
                        </div>
                        <div>
                            {idx === 0 && <label style={labelStyle}>İskonto %</label>}
                            <input type="number" min={0} max={100} step="0.01" value={l.discount_pct}
                                onChange={e => updateLine(idx, { discount_pct: e.target.value })}
                                aria-label={`Line ${idx + 1} iskonto`} style={inputStyle} />
                        </div>
                        <button onClick={() => removeLine(idx)} disabled={lines.length === 1}
                            aria-label={`Line ${idx + 1} sil`}
                            style={{
                                padding: "6px 10px", fontSize: "12px",
                                background: "transparent", color: "var(--danger-text)",
                                border: "0.5px solid var(--border-tertiary)", borderRadius: "6px",
                                cursor: lines.length === 1 ? "not-allowed" : "pointer",
                                opacity: lines.length === 1 ? 0.4 : 1,
                            }}>✕</button>
                    </div>
                ))}
            </div>

            {/* Notes */}
            <div style={{ marginBottom: "16px" }}>
                <label style={labelStyle} htmlFor="po-notes">Notlar</label>
                <textarea id="po-notes" value={notes} onChange={e => setNotes(e.target.value)}
                    rows={3} aria-label="Notlar" style={{ ...inputStyle, resize: "vertical" }} />
            </div>

            {/* Total + actions */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)" }}>
                    Tahmini Toplam (KDV dahil): <strong style={{ color: "var(--text-primary)" }}>
                        {grandTotal.toLocaleString("tr-TR", { minimumFractionDigits: 2 })} {currency}
                    </strong>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => router.push("/dashboard/purchase/orders")}
                        style={{
                            padding: "8px 16px", fontSize: "13px",
                            background: "transparent", color: "var(--text-secondary)",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px", cursor: "pointer",
                        }}>İptal</button>
                    <button onClick={handleSubmit} disabled={isDemo || saving}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}
                        style={{
                            padding: "8px 16px", fontSize: "13px",
                            background: (isDemo || saving) ? "var(--bg-tertiary)" : "var(--accent)",
                            color: (isDemo || saving) ? "var(--text-tertiary)" : "#fff",
                            border: "none", borderRadius: "6px",
                            cursor: (isDemo || saving) ? "not-allowed" : "pointer",
                            fontWeight: 500,
                        }}>{saving ? "Kaydediliyor..." : "Sipariş Oluştur"}</button>
                </div>
            </div>

            {formError && (
                <div role="alert" aria-live="polite" style={{
                    padding: "10px 14px", fontSize: "13px",
                    background: "var(--danger-bg)", color: "var(--danger-text)",
                    border: "0.5px solid var(--danger-border)", borderRadius: "6px",
                }}>{formError}</div>
            )}
        </div>
    );
}
