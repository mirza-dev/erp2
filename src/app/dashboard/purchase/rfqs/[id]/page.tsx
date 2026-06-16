"use client";

import { useState, useEffect, useCallback, useMemo, use } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import type { RfqDetail, RfqVendorWithPrices } from "@/lib/supabase/supplier-rfqs";
import type { SupplierRfqStatus } from "@/lib/database.types";
import { bestVendorPerLine, type RateMap, type ComparisonLine } from "@/lib/rfq-comparison";

const STATUS_LABEL: Record<SupplierRfqStatus, string> = {
    draft: "Taslak", sent: "Gönderildi", awarded: "Karara Bağlandı", cancelled: "İptal",
};

const inputStyle: React.CSSProperties = {
    fontSize: "13px", padding: "5px 8px", border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px", background: "var(--bg-tertiary)", color: "var(--text-primary)", width: "100%", boxSizing: "border-box",
};
const btn = (variant: "primary" | "ghost" | "danger" = "primary"): React.CSSProperties => ({
    padding: "7px 14px", fontSize: "13px", borderRadius: "6px", cursor: "pointer", fontWeight: 500,
    border: variant === "ghost" ? "0.5px solid var(--border-secondary)" : "none",
    background: variant === "primary" ? "var(--accent)" : variant === "danger" ? "var(--danger-bg)" : "transparent",
    color: variant === "primary" ? "#fff" : variant === "danger" ? "var(--danger-text)" : "var(--text-secondary)",
});

function fmtMoney(n: number | null, cur: string): string {
    if (n == null) return "—";
    return `${n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${cur}`;
}
function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export default function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = use(params);
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [rfq, setRfq] = useState<RfqDetail | null>(null);
    const [rates, setRates] = useState<RateMap>({ TRY: 1 });
    const [tab, setTab] = useState<"lines" | "compare">("lines");
    const [entryVendor, setEntryVendor] = useState<RfqVendorWithPrices | null>(null);
    const [busy, setBusy] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const load = useCallback(async () => {
        const res = await fetch(`/api/rfqs/${id}`);
        if (res.status === 404) { setNotFound(true); return; }
        if (res.ok) setRfq(await res.json());
    }, [id]);

    useEffect(() => { void load(); }, [load]);
    useEffect(() => {
        void (async () => {
            try {
                const res = await fetch("/api/exchange-rates");
                if (!res.ok) return;
                const data = await res.json();
                const usd = data?.rates?.USD?.selling, eur = data?.rates?.EUR?.selling;
                setRates({ TRY: 1, ...(usd ? { USD: usd } : {}), ...(eur ? { EUR: eur } : {}) });
            } catch { /* kur yoksa aynı-para-birimi karşılaştırması */ }
        })();
    }, []);

    // Karar (award) seçimi: rfq_line_id → seçili vendor_id
    const [awardSel, setAwardSel] = useState<Record<string, string>>({});

    const comparison = useMemo<ComparisonLine[]>(() => {
        if (!rfq) return [];
        return rfq.lines.map(line => ({
            rfqLineId: line.id,
            cells: rfq.vendors.map(v => ({
                vendorId: v.vendor_id,
                unitPrice: v.prices.find(p => p.rfq_line_id === line.id)?.unit_price ?? null,
                currency: v.currency,
            })),
        }));
    }, [rfq]);
    const best = useMemo(() => bestVendorPerLine(comparison, rates), [comparison, rates]);

    // Karşılaştırma sekmesine geçince en iyi tedarikçiyi varsayılan seç
    useEffect(() => {
        if (tab !== "compare" || !rfq) return;
        setAwardSel(prev => {
            const next = { ...prev };
            for (const [lineId, pick] of best.entries()) if (!next[lineId]) next[lineId] = pick.vendorId;
            return next;
        });
    }, [tab, rfq, best]);

    if (notFound) return <div style={{ padding: 32, color: "var(--text-tertiary)" }}>Fiyat talebi bulunamadı.</div>;
    if (!rfq) return <div style={{ padding: 32, color: "var(--text-tertiary)" }}>Yükleniyor...</div>;

    const respondedCount = rfq.vendors.filter(v => v.status === "responded").length;

    const doAction = async (url: string, body?: unknown, okMsg?: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return false; }
        setBusy(true);
        try {
            const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast({ type: "error", message: data.error ?? "İşlem başarısız." }); return false; }
            if (okMsg) toast({ type: "success", message: okMsg });
            await load();
            return true;
        } catch {
            toast({ type: "error", message: "Beklenmeyen hata." });
            return false;
        } finally { setBusy(false); }
    };

    const handleSend = async () => {
        const ok = await doAction(`/api/rfqs/${id}/send`, undefined);
        if (ok) toast({ type: "success", message: "Talep gönderildi (tedarikçilere e-posta + belge)." });
    };
    const handleCancel = async () => {
        if (!confirm("Bu fiyat talebini iptal etmek istiyor musunuz?")) return;
        await doAction(`/api/rfqs/${id}/cancel`, { reason: "Kullanıcı iptali" }, "İptal edildi.");
    };

    const handleAward = async () => {
        const awards = rfq.lines.flatMap(line => {
            const vendorId = awardSel[line.id];
            if (!vendorId) return [];
            const v = rfq.vendors.find(x => x.vendor_id === vendorId);
            const cell = v?.prices.find(p => p.rfq_line_id === line.id);
            if (!v || !cell || cell.unit_price == null) return []; // fiyatsız kalemi atla (UX); fiyat/qty sunucudan
            return [{ rfq_line_id: line.id, vendor_id: vendorId }];
        });
        if (awards.length === 0) { toast({ type: "error", message: "Kazanan kalem seçilmedi (fiyatlı tedarikçi gerekli)." }); return; }
        if (!confirm(`${awards.length} kalem için satın alma siparişi oluşturulacak. Onaylıyor musunuz?`)) return;
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setBusy(true);
        try {
            const res = await fetch(`/api/rfqs/${id}/award`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ awards }) });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast({ type: "error", message: data.error ?? "Karar başarısız." }); return; }
            const nums = (data.pos ?? []).map((p: { po_number: string }) => p.po_number).join(", ");
            toast({ type: "success", message: `Satın alma siparişi oluşturuldu: ${nums}` });
            await load();
        } catch {
            toast({ type: "error", message: "Beklenmeyen hata." });
        } finally { setBusy(false); }
    };

    return (
        <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>{rfq.rfq_number}</h1>
                        <span style={{ padding: "2px 10px", borderRadius: "5px", fontSize: "11px", fontWeight: 600, background: "var(--bg-tertiary)", color: "var(--text-secondary)" }}>{STATUS_LABEL[rfq.status]}</span>
                    </div>
                    {rfq.title && <div style={{ color: "var(--text-secondary)", fontSize: "13px", marginTop: "4px" }}>{rfq.title}</div>}
                    <div style={{ color: "var(--text-tertiary)", fontSize: "12px", marginTop: "4px" }}>
                        Yanıt son tarihi: {fmtDate(rfq.due_date)} · {respondedCount}/{rfq.vendors.length} tedarikçi yanıtladı
                    </div>
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                    {rfq.status === "draft" && <button onClick={() => router.push(`/dashboard/purchase/rfqs/new`)} style={btn("ghost")}>Geri</button>}
                    {(rfq.status === "draft" || rfq.status === "sent") && (
                        <button onClick={handleSend} disabled={busy} style={btn("primary")}>{rfq.status === "draft" ? "Gönder" : "Yeniden Gönder"}</button>
                    )}
                    {rfq.status === "sent" && <button onClick={() => setTab("compare")} style={btn("primary")}>Karşılaştır & Karar</button>}
                    {rfq.status !== "awarded" && rfq.status !== "cancelled" && <button onClick={handleCancel} disabled={busy} style={btn("danger")}>İptal</button>}
                </div>
            </div>

            {/* Vendor panel */}
            <div style={{ border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", padding: "14px", marginBottom: "16px" }}>
                <strong style={{ fontSize: "13px", color: "var(--text-primary)" }}>Tedarikçiler</strong>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "8px", marginTop: "10px" }}>
                    {rfq.vendors.map(v => (
                        <div key={v.id} style={{ border: "0.5px solid var(--border-tertiary)", borderRadius: "6px", padding: "10px", background: "var(--bg-tertiary)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                <span style={{ fontWeight: 600, fontSize: "13px", color: "var(--text-primary)" }}>{v.vendor_name}</span>
                                <span style={{ fontSize: "11px", color: v.status === "responded" ? "var(--success-text)" : "var(--text-tertiary)" }}>
                                    {v.status === "responded" ? "✓ yanıtladı" : v.status === "sent" ? "gönderildi" : v.status === "declined" ? "reddetti" : "bekliyor"}
                                </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                {v.vendor_email || "e-posta yok"}{v.valid_until ? ` · geçerlilik ${fmtDate(v.valid_until)}` : ""}
                            </div>
                            <div style={{ display: "flex", gap: "6px", marginTop: "8px" }}>
                                {rfq.status !== "cancelled" && (
                                    <button onClick={() => setEntryVendor(v)} style={{ ...btn("ghost"), padding: "4px 10px", fontSize: "12px" }}>
                                        {v.prices.some(p => p.unit_price != null) ? "Fiyatları Düzenle" : "Fiyat Gir"}
                                    </button>
                                )}
                                {(rfq.status === "sent" || rfq.status === "awarded") && (
                                    <a href={`/api/rfqs/${id}/archive?vendor=${v.vendor_id}&view=1`} target="_blank" rel="noopener noreferrer"
                                        style={{ ...btn("ghost"), padding: "4px 10px", fontSize: "12px", textDecoration: "none", display: "inline-block" }}>Belge</a>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Tabs */}
            <div style={{ display: "flex", gap: "6px", marginBottom: "12px" }}>
                <button onClick={() => setTab("lines")} style={{ ...btn(tab === "lines" ? "primary" : "ghost") }}>İstenen Kalemler</button>
                <button onClick={() => setTab("compare")} style={{ ...btn(tab === "compare" ? "primary" : "ghost") }}>Karşılaştırma</button>
            </div>

            {tab === "lines" ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)", textAlign: "left" }}>
                            <th style={{ padding: "8px 12px", fontWeight: 500 }}>#</th>
                            <th style={{ padding: "8px 12px", fontWeight: 500 }}>Kod</th>
                            <th style={{ padding: "8px 12px", fontWeight: 500 }}>Açıklama</th>
                            <th style={{ padding: "8px 12px", fontWeight: 500 }}>Miktar</th>
                            <th style={{ padding: "8px 12px", fontWeight: 500 }}>İstenen Teslim</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rfq.lines.map(l => (
                            <tr key={l.id} style={{ borderTop: "0.5px solid var(--border-tertiary)" }}>
                                <td style={{ padding: "8px 12px" }}>{l.position + 1}</td>
                                <td style={{ padding: "8px 12px" }}>{l.product_code || "—"}</td>
                                <td style={{ padding: "8px 12px" }}>{l.description || "—"}</td>
                                <td style={{ padding: "8px 12px" }}>{l.quantity}{l.unit ? ` ${l.unit}` : ""}</td>
                                <td style={{ padding: "8px 12px" }}>{fmtDate(l.target_date)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <ComparisonMatrix rfq={rfq} best={best} awardSel={awardSel} setAwardSel={setAwardSel} onAward={handleAward} busy={busy} />
            )}

            {entryVendor && (
                <VendorQuoteModal
                    rfqId={id}
                    vendor={entryVendor}
                    lines={rfq.lines}
                    onClose={() => setEntryVendor(null)}
                    onSaved={async () => { setEntryVendor(null); await load(); toast({ type: "success", message: "Tedarikçi fiyatları kaydedildi." }); }}
                />
            )}
        </div>
    );
}

// ── Karşılaştırma matrisi + karar ─────────────────────────────
function ComparisonMatrix({ rfq, best, awardSel, setAwardSel, onAward, busy }: {
    rfq: RfqDetail;
    best: Map<string, { vendorId: string; unitPrice: number; currency: string }>;
    awardSel: Record<string, string>;
    setAwardSel: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    onAward: () => void;
    busy: boolean;
}) {
    const canAward = rfq.status === "sent";
    return (
        <div>
            <div style={{ overflowX: "auto", border: "0.5px solid var(--border-tertiary)", borderRadius: "8px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)", textAlign: "left" }}>
                            <th style={{ padding: "8px 12px", fontWeight: 500, minWidth: "180px" }}>Kalem</th>
                            {rfq.vendors.map(v => <th key={v.id} style={{ padding: "8px 12px", fontWeight: 500 }}>{v.vendor_name}</th>)}
                            {canAward && <th style={{ padding: "8px 12px", fontWeight: 500 }}>Kazanan</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {rfq.lines.map(line => {
                            const bestPick = best.get(line.id);
                            return (
                                <tr key={line.id} style={{ borderTop: "0.5px solid var(--border-tertiary)" }}>
                                    <td style={{ padding: "8px 12px" }}>
                                        <div style={{ fontWeight: 500, color: "var(--text-primary)" }}>{line.description || line.product_code || "—"}</div>
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{line.quantity}{line.unit ? ` ${line.unit}` : ""}</div>
                                    </td>
                                    {rfq.vendors.map(v => {
                                        const cell = v.prices.find(p => p.rfq_line_id === line.id);
                                        const isBest = bestPick?.vendorId === v.vendor_id && cell?.unit_price != null;
                                        return (
                                            <td key={v.id} style={{ padding: "8px 12px", background: isBest ? "var(--success-bg)" : undefined, color: isBest ? "var(--success-text)" : "var(--text-secondary)", fontWeight: isBest ? 600 : 400 }}>
                                                {fmtMoney(cell?.unit_price ?? null, v.currency)}
                                                {cell?.lead_time_days != null && <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{cell.lead_time_days} gün</div>}
                                            </td>
                                        );
                                    })}
                                    {canAward && (
                                        <td style={{ padding: "8px 12px" }}>
                                            <select value={awardSel[line.id] ?? ""} onChange={e => setAwardSel(prev => ({ ...prev, [line.id]: e.target.value }))} aria-label={`${line.description} kazanan`} style={{ ...inputStyle, minWidth: "140px" }}>
                                                <option value="">— seçilmedi —</option>
                                                {rfq.vendors.filter(v => v.prices.some(p => p.rfq_line_id === line.id && p.unit_price != null)).map(v => (
                                                    <option key={v.id} value={v.vendor_id}>{v.vendor_name}</option>
                                                ))}
                                            </select>
                                        </td>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            {canAward && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "14px" }}>
                    <button onClick={onAward} disabled={busy} style={btn("primary")}>Seçilenlerden Satın Alma Siparişi Oluştur</button>
                </div>
            )}
            {rfq.status === "awarded" && (
                <div style={{ marginTop: "12px", fontSize: "13px", color: "var(--success-text)" }}>Bu talep karara bağlandı ve satın alma siparişi(leri) oluşturuldu.</div>
            )}
        </div>
    );
}

// ── Tedarikçi fiyat giriş modalı ──────────────────────────────
function VendorQuoteModal({ rfqId, vendor, lines, onClose, onSaved }: {
    rfqId: string;
    vendor: RfqVendorWithPrices;
    lines: RfqDetail["lines"];
    onClose: () => void;
    onSaved: () => void;
}) {
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [currency, setCurrency] = useState(vendor.currency);
    const [validUntil, setValidUntil] = useState(vendor.valid_until ?? "");
    const [rows, setRows] = useState<Record<string, { unit_price: string; lead_time_days: string; moq: string }>>(() => {
        const init: Record<string, { unit_price: string; lead_time_days: string; moq: string }> = {};
        for (const l of lines) {
            const p = vendor.prices.find(x => x.rfq_line_id === l.id);
            init[l.id] = {
                unit_price: p?.unit_price != null ? String(p.unit_price) : "",
                lead_time_days: p?.lead_time_days != null ? String(p.lead_time_days) : "",
                moq: p?.moq != null ? String(p.moq) : "",
            };
        }
        return init;
    });
    const [saving, setSaving] = useState(false);

    const save = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setSaving(true);
        try {
            const prices = lines.map(l => ({
                rfq_line_id: l.id,
                unit_price: rows[l.id].unit_price.trim() === "" ? null : Number(rows[l.id].unit_price),
                lead_time_days: rows[l.id].lead_time_days.trim() === "" ? null : Number(rows[l.id].lead_time_days),
                moq: rows[l.id].moq.trim() === "" ? null : Number(rows[l.id].moq),
            }));
            const res = await fetch(`/api/rfqs/${rfqId}/vendors/${vendor.id}/quote`, {
                method: "PATCH", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currency, valid_until: validUntil || null, prices }),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) { toast({ type: "error", message: data.error ?? "Kaydedilemedi." }); return; }
            onSaved();
        } catch {
            toast({ type: "error", message: "Beklenmeyen hata." });
        } finally { setSaving(false); }
    };

    return (
        <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg-primary)", borderRadius: "10px", padding: "20px", width: "min(720px, 100%)", maxHeight: "85vh", overflowY: "auto", border: "0.5px solid var(--border-tertiary)" }}>
                <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: "0 0 14px" }}>{vendor.vendor_name} — Fiyat Girişi</h2>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                    <div>
                        <label style={{ fontSize: "11px", color: "var(--text-tertiary)", display: "block", marginBottom: "3px" }}>Para Birimi</label>
                        <select value={currency} onChange={e => setCurrency(e.target.value)} style={inputStyle}>
                            <option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ fontSize: "11px", color: "var(--text-tertiary)", display: "block", marginBottom: "3px" }}>Geçerlilik Tarihi</label>
                        <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={inputStyle} />
                    </div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                        <tr style={{ color: "var(--text-tertiary)", textAlign: "left" }}>
                            <th style={{ padding: "4px 6px", fontWeight: 500 }}>Kalem</th>
                            <th style={{ padding: "4px 6px", fontWeight: 500, width: "120px" }}>Birim Fiyat</th>
                            <th style={{ padding: "4px 6px", fontWeight: 500, width: "90px" }}>Termin (gün)</th>
                            <th style={{ padding: "4px 6px", fontWeight: 500, width: "90px" }}>MOQ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map(l => (
                            <tr key={l.id}>
                                <td style={{ padding: "4px 6px", color: "var(--text-primary)" }}>{l.description || l.product_code || "—"} <span style={{ color: "var(--text-tertiary)" }}>({l.quantity}{l.unit ? ` ${l.unit}` : ""})</span></td>
                                <td style={{ padding: "4px 6px" }}><input type="number" min={0} step="0.0001" value={rows[l.id].unit_price} onChange={e => setRows(p => ({ ...p, [l.id]: { ...p[l.id], unit_price: e.target.value } }))} aria-label={`${l.description} birim fiyat`} style={inputStyle} /></td>
                                <td style={{ padding: "4px 6px" }}><input type="number" min={0} value={rows[l.id].lead_time_days} onChange={e => setRows(p => ({ ...p, [l.id]: { ...p[l.id], lead_time_days: e.target.value } }))} style={inputStyle} /></td>
                                <td style={{ padding: "4px 6px" }}><input type="number" min={0} value={rows[l.id].moq} onChange={e => setRows(p => ({ ...p, [l.id]: { ...p[l.id], moq: e.target.value } }))} style={inputStyle} /></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "6px" }}>Boş bırakılan birim fiyat = bu kalem için teklif verilmedi.</div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" }}>
                    <button onClick={onClose} style={btn("ghost")}>Vazgeç</button>
                    <button onClick={save} disabled={saving} style={btn("primary")}>{saving ? "Kaydediliyor..." : "Kaydet"}</button>
                </div>
            </div>
        </div>
    );
}
