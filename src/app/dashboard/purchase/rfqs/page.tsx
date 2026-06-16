"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RfqListRow } from "@/lib/supabase/supplier-rfqs";
import type { SupplierRfqStatus } from "@/lib/database.types";

const STATUS_LABEL: Record<SupplierRfqStatus, string> = {
    draft: "Taslak",
    sent: "Gönderildi",
    awarded: "Karara Bağlandı",
    cancelled: "İptal",
};
const STATUS_TONE: Record<SupplierRfqStatus, { bg: string; fg: string }> = {
    draft: { bg: "var(--bg-tertiary)", fg: "var(--text-secondary)" },
    sent: { bg: "var(--accent-bg)", fg: "var(--accent-text)" },
    awarded: { bg: "var(--success-bg)", fg: "var(--success-text)" },
    cancelled: { bg: "var(--danger-bg)", fg: "var(--danger-text)" },
};

const TABS: { key: "all" | SupplierRfqStatus; label: string }[] = [
    { key: "all", label: "Tümü" },
    { key: "draft", label: "Taslak" },
    { key: "sent", label: "Gönderildi" },
    { key: "awarded", label: "Karara Bağlandı" },
    { key: "cancelled", label: "İptal" },
];

function fmtDate(iso: string | null): string {
    if (!iso) return "—";
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

export default function RfqListPage() {
    const router = useRouter();
    const [rows, setRows] = useState<RfqListRow[]>([]);
    const [tab, setTab] = useState<"all" | SupplierRfqStatus>("all");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError(false);
        try {
            const params = new URLSearchParams();
            if (tab !== "all") params.set("status", tab);
            if (search.trim()) params.set("search", search.trim());
            const res = await fetch(`/api/rfqs?${params.toString()}`);
            if (!res.ok) { setError(true); return; }
            setRows(await res.json());
        } catch {
            setError(true);
        } finally {
            setLoading(false);
        }
    }, [tab, search]);

    useEffect(() => {
        const t = setTimeout(() => void load(), 200);
        return () => clearTimeout(t);
    }, [load]);

    const isOverdue = (r: RfqListRow) =>
        r.status === "sent" && r.due_date != null && r.due_date < new Date().toISOString().slice(0, 10);

    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                <h1 style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    Fiyat Talepleri
                </h1>
                <Link href="/dashboard/purchase/rfqs/new" style={{
                    padding: "8px 16px", fontSize: "13px", fontWeight: 500,
                    background: "var(--accent)", color: "#fff", borderRadius: "6px", textDecoration: "none",
                }}>+ Yeni Fiyat Talebi</Link>
            </div>

            <div style={{ display: "flex", gap: "6px", marginBottom: "14px", flexWrap: "wrap" }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)} style={{
                        padding: "6px 14px", fontSize: "12px", borderRadius: "6px", cursor: "pointer",
                        border: "0.5px solid var(--border-secondary)",
                        background: tab === t.key ? "var(--accent)" : "var(--bg-tertiary)",
                        color: tab === t.key ? "#fff" : "var(--text-secondary)",
                        fontWeight: tab === t.key ? 600 : 400,
                    }}>{t.label}</button>
                ))}
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Ara: talep no / başlık"
                    aria-label="Ara" style={{
                        marginLeft: "auto", fontSize: "13px", padding: "6px 10px", minWidth: "220px",
                        border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                        background: "var(--bg-tertiary)", color: "var(--text-primary)",
                    }} />
            </div>

            {error && (
                <div role="alert" style={{
                    padding: "10px 14px", marginBottom: "12px", fontSize: "13px",
                    background: "var(--danger-bg)", color: "var(--danger-text)",
                    border: "0.5px solid var(--danger-border)", borderRadius: "6px",
                }}>Liste yüklenemedi. <button onClick={() => void load()} style={{ marginLeft: 8, cursor: "pointer" }}>Yeniden dene</button></div>
            )}

            <div style={{ border: "0.5px solid var(--border-tertiary)", borderRadius: "8px", overflow: "hidden" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-tertiary)", color: "var(--text-tertiary)", textAlign: "left" }}>
                            <th style={{ padding: "9px 12px", fontWeight: 500 }}>Talep No</th>
                            <th style={{ padding: "9px 12px", fontWeight: 500 }}>Başlık</th>
                            <th style={{ padding: "9px 12px", fontWeight: 500 }}>Durum</th>
                            <th style={{ padding: "9px 12px", fontWeight: 500 }}>Tedarikçi / Yanıt</th>
                            <th style={{ padding: "9px 12px", fontWeight: 500 }}>Kalem</th>
                            <th style={{ padding: "9px 12px", fontWeight: 500 }}>Yanıt Son Tarihi</th>
                            <th style={{ padding: "9px 12px", fontWeight: 500 }}>Oluşturma</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "var(--text-tertiary)" }}>Yükleniyor...</td></tr>
                        ) : rows.length === 0 ? (
                            <tr><td colSpan={7} style={{ padding: "24px", textAlign: "center", color: "var(--text-tertiary)" }}>Kayıt yok.</td></tr>
                        ) : rows.map(r => {
                            const tone = STATUS_TONE[r.status];
                            return (
                                <tr key={r.id} onClick={() => router.push(`/dashboard/purchase/rfqs/${r.id}`)}
                                    style={{ borderTop: "0.5px solid var(--border-tertiary)", cursor: "pointer" }}>
                                    <td style={{ padding: "9px 12px", fontWeight: 600, color: "var(--text-primary)" }}>{r.rfq_number}</td>
                                    <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{r.title || "—"}</td>
                                    <td style={{ padding: "9px 12px" }}>
                                        <span style={{ padding: "2px 8px", borderRadius: "5px", fontSize: "11px", fontWeight: 600, background: tone.bg, color: tone.fg }}>
                                            {STATUS_LABEL[r.status]}
                                        </span>
                                    </td>
                                    <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>
                                        {r.responded_count}/{r.vendor_count} yanıtladı
                                    </td>
                                    <td style={{ padding: "9px 12px", color: "var(--text-secondary)" }}>{r.line_count}</td>
                                    <td style={{ padding: "9px 12px", color: isOverdue(r) ? "var(--danger-text)" : "var(--text-secondary)", fontWeight: isOverdue(r) ? 600 : 400 }}>
                                        {fmtDate(r.due_date)}{isOverdue(r) ? " (geçti)" : ""}
                                    </td>
                                    <td style={{ padding: "9px 12px", color: "var(--text-tertiary)" }}>{fmtDate(r.created_at)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
