"use client";

import { useState, useEffect } from "react";
import type { PriceHistoryEntry } from "@/lib/supabase/supplier-rfqs";

/**
 * Ürün detayı → Tedarik sekmesi: "Tedarikçi Fiyatları" ("kimde ne kadar").
 * RFQ yanıtlarından/award'lardan biriken `supplier_price_history` kayıtları.
 * unit_price view_purchase_costs ile API tarafında redakte (null → maskeli "—").
 */
function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export default function SupplierPricesPanel({ productId }: { productId: string }) {
    const [rows, setRows] = useState<PriceHistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let active = true;
        void (async () => {
            try {
                const res = await fetch(`/api/products/${productId}/supplier-prices`);
                if (active && res.ok) setRows(await res.json());
            } catch { /* sessiz — panel boş kalır */ } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [productId]);

    const cardStyle: React.CSSProperties = {
        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
        borderRadius: "8px", padding: "16px", marginTop: "16px",
    };
    const titleStyle: React.CSSProperties = {
        fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px",
    };

    return (
        <div style={cardStyle}>
            <div style={titleStyle}>Tedarikçi Fiyatları <span style={{ color: "var(--text-tertiary)", fontWeight: 400 }}>(kimde ne kadar)</span></div>
            {loading ? (
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Yükleniyor...</div>
            ) : rows.length === 0 ? (
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>Henüz tedarikçi fiyatı kaydı yok. Fiyat Talebi (RFQ) yanıtları burada birikir.</div>
            ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                    <thead>
                        <tr style={{ color: "var(--text-tertiary)", textAlign: "left" }}>
                            <th style={{ padding: "5px 8px", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Tedarikçi</th>
                            <th style={{ padding: "5px 8px", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Birim Fiyat</th>
                            <th style={{ padding: "5px 8px", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Tarih</th>
                            <th style={{ padding: "5px 8px", fontWeight: 500, borderBottom: "0.5px solid var(--border-tertiary)" }}>Kaynak</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.id}>
                                <td style={{ padding: "5px 8px", color: "var(--text-primary)" }}>{r.vendor_name}</td>
                                <td style={{ padding: "5px 8px", color: "var(--text-secondary)" }}>
                                    {r.unit_price == null ? "—" : `${r.unit_price.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })} ${r.currency}`}
                                </td>
                                <td style={{ padding: "5px 8px", color: "var(--text-secondary)" }}>{fmtDate(r.recorded_at)}</td>
                                <td style={{ padding: "5px 8px", color: "var(--text-tertiary)" }}>{r.rfq_number ?? "—"}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </div>
    );
}
