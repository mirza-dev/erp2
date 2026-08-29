"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductVendorLinkRow } from "@/lib/database.types";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";

/**
 * Ürün detayı → Tedarik sekmesi: "Tedarikçiler" (alternatif kaynaklar).
 *
 * KOBİ-sim O5: ürünün tedarikçisi tek bir SERBEST METİN alanıydı ("Tercihli
 * Tedarikçi"); ikinci bir tedarikçi tanımlanamıyordu, üzerine yazınca öncekini
 * siliyordu. Kerem: "0 stok + 68 gün gecikmiş sipariş + tek tedarikçi (60 gün
 * temin süresi) durumunda tek-kaynak riskini sistemde hiç görünür kılamıyorum."
 *
 * Veri modeli (product_vendor_links, mig.084) çoklu tedarikçiyi zaten
 * destekliyordu ve `products.preferred_vendor_id` kolonu vardı; eksik olan tek
 * şey yazma yoluydu — Excel import dışında hiçbir UI bunu yazmıyordu.
 */

interface VendorOption { id: string; name: string; isActive?: boolean }

export default function ProductVendorsPanel({
    productId,
    onChanged,
}: {
    productId: string;
    onChanged?: () => void;
}) {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [links, setLinks] = useState<ProductVendorLinkRow[]>([]);
    const [vendors, setVendors] = useState<VendorOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [addOpen, setAddOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // form
    const [vendorId, setVendorId] = useState("");
    const [vendorSku, setVendorSku] = useState("");
    const [leadDays, setLeadDays] = useState("");
    const [moq, setMoq] = useState("");
    const [preferred, setPreferred] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await fetch(`/api/product-vendor-links?product_ids=${productId}`);
            if (res.ok) setLinks(await res.json());
        } catch { /* sessiz — panel boş kalır */ } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const res = await fetch("/api/vendors?all=1");
                if (!active || !res.ok) return;
                const data = await res.json();
                const rows = Array.isArray(data) ? data : (data.rows ?? []);
                setVendors(rows.map((v: { id: string; name: string; is_active?: boolean }) => ({
                    id: v.id, name: v.name, isActive: v.is_active !== false,
                })));
            } catch { /* sessiz — seçici boş kalır */ }
        })();
        return () => { active = false; };
    }, []);

    const vendorName = (id: string) => vendors.find(v => v.id === id)?.name ?? id.slice(0, 8);

    const handleAdd = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!vendorId) return;
        setSaving(true);
        try {
            const res = await fetch("/api/product-vendor-links", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    product_id: productId,
                    vendor_id: vendorId,
                    vendor_sku: vendorSku.trim() || null,
                    lead_time_days: leadDays.trim() === "" ? null : Number(leadDays),
                    moq: moq.trim() === "" ? null : Number(moq),
                    is_preferred: preferred,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                toast({ type: "error", message: data.error ?? "Tedarikçi bağlanamadı." });
                return;
            }
            toast({ type: "success", message: `${vendorName(vendorId)} bu ürünün tedarikçisi olarak kaydedildi.` });
            setAddOpen(false);
            setVendorId(""); setVendorSku(""); setLeadDays(""); setMoq(""); setPreferred(false);
            await load();
            onChanged?.();
        } catch {
            toast({ type: "error", message: "Beklenmeyen hata." });
        } finally {
            setSaving(false);
        }
    };

    const cardStyle: React.CSSProperties = {
        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
        borderRadius: "8px", padding: "16px", marginTop: "16px",
    };
    const inputStyle: React.CSSProperties = {
        fontSize: "13px", padding: "6px 8px",
        border: "var(--line-width) solid var(--input-border)", borderRadius: "5px",
        background: "var(--input-bg)", color: "var(--text-primary)",
        width: "100%", boxSizing: "border-box",
    };
    const th: React.CSSProperties = {
        padding: "5px 8px", fontWeight: 500, textAlign: "left",
        borderBottom: "0.5px solid var(--border-tertiary)",
    };
    const td: React.CSSProperties = { padding: "5px 8px", color: "var(--text-secondary)" };

    return (
        <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "10px" }}>
                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>
                    Tedarikçiler{" "}
                    <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(alternatif kaynaklar)</span>
                </div>
                {!addOpen && (
                    <Button
                        size="xs"
                        variant="secondary"
                        onClick={() => setAddOpen(true)}
                        disabled={isDemo}
                        title={isDemo ? DEMO_DISABLED_TOOLTIP : "Bu ürüne tedarikçi bağla"}
                    >
                        + Tedarikçi ekle
                    </Button>
                )}
            </div>

            {loading ? (
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Yükleniyor...</div>
            ) : links.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--warning-text)" }}>
                    Bu ürüne bağlı tedarikçi yok — tek-kaynak riski değerlendirilemiyor.
                </div>
            ) : (
                <>
                    {links.length === 1 && (
                        <div style={{ fontSize: "11.5px", color: "var(--warning-text)", marginBottom: "8px" }}>
                            ⚠ Tek tedarikçi — bu ürün tek kaynağa bağlı.
                        </div>
                    )}
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                        <thead>
                            <tr style={{ color: "var(--text-tertiary)" }}>
                                <th style={th}>Tedarikçi</th>
                                <th style={th}>Tedarikçi Kodu</th>
                                <th style={th}>Temin (gün)</th>
                                <th style={th}>Min. Sipariş</th>
                                <th style={th}>Tercihli</th>
                            </tr>
                        </thead>
                        <tbody>
                            {links.map(l => (
                                <tr key={l.id}>
                                    <td style={{ ...td, color: "var(--text-primary)" }}>{vendorName(l.vendor_id)}</td>
                                    <td style={td}>{l.vendor_sku || "—"}</td>
                                    <td style={td}>{l.lead_time_days ?? "—"}</td>
                                    <td style={td}>{l.moq ?? "—"}</td>
                                    <td style={td}>{l.is_preferred ? "✓" : "—"}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}

            {addOpen && (
                <div style={{ marginTop: "12px", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "8px" }}>
                        <div>
                            <label htmlFor="pv-vendor" style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "3px" }}>Tedarikçi</label>
                            <select id="pv-vendor" value={vendorId} onChange={e => setVendorId(e.target.value)} style={inputStyle}>
                                <option value="">Seçin…</option>
                                {vendors.filter(v => v.isActive).map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="pv-sku" style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "3px" }}>Tedarikçi Kodu</label>
                            <input id="pv-sku" value={vendorSku} onChange={e => setVendorSku(e.target.value)} style={inputStyle} maxLength={100} />
                        </div>
                        <div>
                            <label htmlFor="pv-lead" style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "3px" }}>Temin (gün)</label>
                            <input id="pv-lead" type="number" min={0} value={leadDays} onChange={e => setLeadDays(e.target.value)} style={inputStyle} />
                        </div>
                        <div>
                            <label htmlFor="pv-moq" style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "3px" }}>Min. Sipariş</label>
                            <input id="pv-moq" type="number" min={0} value={moq} onChange={e => setMoq(e.target.value)} style={inputStyle} />
                        </div>
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-secondary)" }}>
                        <input type="checkbox" checked={preferred} onChange={e => setPreferred(e.target.checked)} />
                        Tercihli tedarikçi yap (ürün kartındaki tedarikçiyi günceller)
                    </label>
                    <div style={{ display: "flex", gap: "6px" }}>
                        <Button size="xs" onClick={handleAdd} disabled={!vendorId || saving}>
                            {saving ? "Kaydediliyor…" : "Kaydet"}
                        </Button>
                        <Button size="xs" variant="secondary" onClick={() => setAddOpen(false)} disabled={saving}>
                            Vazgeç
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
}
