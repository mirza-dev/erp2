"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { VendorSuppliedProduct, VendorPurchaseSummary } from "@/lib/vendor-detail";
import type { VendorRow } from "@/lib/database.types";

/**
 * A3 (2026-08-24): Tedarikçiler sayfası yalnız bir iletişim listesiydi — satırın
 * hiçbir detayı yoktu. Bu panel, satın alma kararının dayanağı olan ama hiçbir
 * ekranda gösterilmeyen veriyi açar: hangi ürünü veriyor, son hangi fiyattan,
 * temin süresi/MOQ ne, bu tedarikçiye kaç PO açılmış.
 *
 * Fiyatlar sunucuda `view_purchase_costs` ile redakte edilir; yetkisiz
 * kullanıcı ürün listesini görür, tutarları görmez ("—").
 */

interface VendorDetailPanelProps {
    vendor: VendorRow | null;
    onClose: () => void;
}

interface DetailResponse {
    products: VendorSuppliedProduct[];
    purchases: VendorPurchaseSummary;
}

const labelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
};

function StatBox({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div style={{ background: "var(--bg-secondary)", borderRadius: "6px", padding: "10px 12px" }}>
            <div style={{ ...labelStyle, marginBottom: "2px" }}>{label}</div>
            <div style={{ fontSize: "16px", fontWeight: 500, color: "var(--text-primary)" }}>{children}</div>
        </div>
    );
}

export default function VendorDetailPanel({ vendor, onClose }: VendorDetailPanelProps) {
    const [detail, setDetail] = useState<DetailResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);

    useEffect(() => {
        if (!vendor) return;
        let alive = true;
        setLoading(true);
        setError(false);
        setDetail(null);
        fetch(`/api/vendors/${vendor.id}/detail`)
            .then(r => (r.ok ? r.json() : Promise.reject(new Error("failed"))))
            .then(d => { if (alive) setDetail(d as DetailResponse); })
            .catch(() => { if (alive) setError(true); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [vendor]);

    if (!vendor) return null;

    const currencies = Object.entries(detail?.purchases.totalByCurrency ?? {});

    return (
        <>
            <div
                onClick={onClose}
                style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.5)" }}
            />
            <div
                className="animate-slide-in-right"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vendor-detail-title"
                style={{
                    position: "fixed", right: 0, top: 0, zIndex: 50,
                    height: "100vh", width: "100%", maxWidth: "460px",
                    background: "var(--bg-primary)",
                    borderLeft: "var(--line-width) solid var(--border-tertiary)",
                    overflowY: "auto", display: "flex", flexDirection: "column",
                }}
            >
                <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "14px 16px",
                    borderBottom: "var(--line-width) solid var(--border-tertiary)",
                    flexShrink: 0,
                }}>
                    <div>
                        <div id="vendor-detail-title" style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                            {vendor.name}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                            {vendor.currency}
                            {vendor.contact_person ? ` · ${vendor.contact_person}` : ""}
                        </div>
                    </div>
                    <Button variant="secondary" size="xs" leftIcon={<X size={13} />} onClick={onClose}>
                        Kapat
                    </Button>
                </div>

                <div style={{ padding: "16px", display: "flex", flexDirection: "column", gap: "18px" }}>
                    {/* Satın alma özeti */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                        <StatBox label="Satın Alma Siparişi">
                            {loading ? "…" : detail?.purchases.poCount ?? 0}
                        </StatBox>
                        <StatBox label="Toplam Alım">
                            {loading ? "…" : currencies.length === 0 ? "—" : (
                                <span style={{ display: "flex", flexDirection: "column" }}>
                                    {currencies.map(([cur, amount]) => (
                                        <span key={cur} style={{ fontSize: currencies.length > 1 ? "14px" : "16px" }}>
                                            {formatCurrency(amount, cur)}
                                        </span>
                                    ))}
                                </span>
                            )}
                        </StatBox>
                    </div>
                    {detail?.purchases.lastOrderDate && (
                        <div style={{ ...labelStyle, marginTop: "-10px" }}>
                            Son sipariş: {formatDate(detail.purchases.lastOrderDate)}
                        </div>
                    )}

                    {/* Tedarik ettiği ürünler */}
                    <div>
                        <div style={{
                            fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)",
                            marginBottom: "8px",
                        }}>
                            Tedarik Ettiği Ürünler
                        </div>

                        {loading && <div style={{ ...labelStyle }}>Yükleniyor…</div>}
                        {error && (
                            <div role="alert" style={{ fontSize: "12px", color: "var(--danger-text)" }}>
                                Detay yüklenemedi.
                            </div>
                        )}
                        {!loading && !error && detail?.products.length === 0 && (
                            <div style={{ ...labelStyle }}>
                                Bu tedarikçiye bağlı ürün yok. Fiyat talebi (RFQ) gönderildiğinde
                                veya satın alma siparişi açıldığında burada görünür.
                            </div>
                        )}

                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {detail?.products.map(p => (
                                <div
                                    key={p.productId}
                                    style={{
                                        border: "var(--line-width) solid var(--border-tertiary)",
                                        borderRadius: "6px", padding: "9px 11px",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", gap: "8px" }}>
                                        <Link
                                            href={`/dashboard/products/${p.productId}`}
                                            style={{ fontSize: "13px", color: "var(--text-primary)", textDecoration: "none", fontWeight: 500 }}
                                        >
                                            {p.name}
                                        </Link>
                                        {p.isPreferred && (
                                            <span style={{
                                                fontSize: "9.5px", padding: "1px 5px", borderRadius: "3px",
                                                background: "var(--accent-bg)", color: "var(--accent-text)",
                                                whiteSpace: "nowrap", alignSelf: "flex-start",
                                            }}>Tercih edilen</span>
                                        )}
                                    </div>
                                    <div style={{
                                        ...labelStyle, fontFamily: "var(--font-mono)", marginTop: "2px",
                                    }}>
                                        {p.sku}{p.vendorSku ? ` · Tedarikçi kodu: ${p.vendorSku}` : ""}
                                    </div>
                                    <div style={{
                                        display: "flex", flexWrap: "wrap", gap: "10px",
                                        marginTop: "6px", fontSize: "11.5px",
                                    }}>
                                        <span style={{ color: "var(--text-secondary)" }}>
                                            Son fiyat:{" "}
                                            <strong style={{ color: p.lastUnitPrice != null ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                                                {p.lastUnitPrice != null && p.lastPriceCurrency
                                                    ? formatCurrency(p.lastUnitPrice, p.lastPriceCurrency)
                                                    : "—"}
                                            </strong>
                                            {p.lastPriceAt && p.lastUnitPrice != null && (
                                                <span style={{ color: "var(--text-tertiary)" }}> ({formatDate(p.lastPriceAt)})</span>
                                            )}
                                        </span>
                                        {p.leadTimeDays != null && (
                                            <span style={{ color: "var(--text-secondary)" }}>Temin: {p.leadTimeDays} gün</span>
                                        )}
                                        {p.moq != null && (
                                            <span style={{ color: "var(--text-secondary)" }}>MOQ: {p.moq} {p.unit}</span>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
