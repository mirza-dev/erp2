"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useIsDemo, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { useToast } from "@/components/ui/Toast";

export interface ModalItem {
    recommendationId: string;
    productId: string;
    productName: string;
    sku: string;
    unit: string;
    suggestQty: number;
    unitPrice: number;
    leadTimeDays?: number | null;
    preferredVendorId?: string | null;
}

export interface VendorOption {
    id: string;
    name: string;
    currency: string;
    lead_time_days?: number | null;
}

export type PoModalMode = "single" | "bulk-vendor" | "bulk-orphan";

interface LineState {
    recommendation_id: string;
    product_id: string;
    productName: string;
    unit: string;
    quantity: string;
    unit_price: string;
    discount_pct: string;
    notes: string;
}

interface PurchaseOrderModalProps {
    open: boolean;
    onClose: () => void;
    mode: PoModalMode;
    initialItems: ModalItem[];
    vendors: VendorOption[];
    /** Called with po_id + po_number on success */
    onSuccess: (poId: string, poNumber: string) => void;
    /** For bulk-vendor mode: vendor is pre-selected and locked */
    lockedVendorId?: string;
}

function computeDefaultDate(leadTimeDays: number | null | undefined): string {
    const lead = leadTimeDays ?? 14;
    const d = new Date();
    d.setDate(d.getDate() + lead);
    return d.toISOString().slice(0, 10);
}

export default function PurchaseOrderModal({
    open,
    onClose,
    mode,
    initialItems,
    vendors,
    onSuccess,
    lockedVendorId,
}: PurchaseOrderModalProps) {
    const isDemo = useIsDemo();
    const { toast } = useToast();
    const panelRef = useRef<HTMLDivElement>(null);

    const [vendorId, setVendorId] = useState<string>(lockedVendorId ?? "");
    const [currency, setCurrency] = useState<string>("TRY");
    const [expectedDate, setExpectedDate] = useState<string>("");
    const [expectedDateDirty, setExpectedDateDirty] = useState(false);
    const [notes, setNotes] = useState<string>("");
    const [lines, setLines] = useState<LineState[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedVendor = vendors.find(v => v.id === vendorId) ?? null;

    useEffect(() => {
        if (!open) return;
        setError(null);
        setSubmitting(false);
        setNotes("");
        setExpectedDateDirty(false);

        // Init lines from items
        setLines(initialItems.map(item => ({
            recommendation_id: item.recommendationId,
            product_id: item.productId,
            productName: item.productName,
            unit: item.unit,
            quantity: String(item.suggestQty),
            unit_price: String(item.unitPrice ?? 0),
            discount_pct: "0",
            notes: "",
        })));

        // Vendor default: locked or first item's preferred vendor
        if (lockedVendorId) {
            setVendorId(lockedVendorId);
        } else {
            const preferred = initialItems[0]?.preferredVendorId;
            if (preferred && vendors.some(v => v.id === preferred)) {
                setVendorId(preferred);
            } else {
                setVendorId("");
            }
        }
    }, [open, initialItems, lockedVendorId, vendors]);

    useEffect(() => {
        if (!selectedVendor) return;
        setCurrency(selectedVendor.currency);
        if (!expectedDateDirty) {
            setExpectedDate(computeDefaultDate(selectedVendor.lead_time_days));
        }
    }, [selectedVendor, expectedDateDirty]);

    // ESC key close
    useEffect(() => {
        if (!open) return;
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [open, onClose]);

    // Focus trap
    useEffect(() => {
        if (!open) return;
        const firstFocusable = panelRef.current?.querySelector<HTMLElement>(
            "button, input, select, textarea",
        );
        firstFocusable?.focus();
    }, [open]);

    const updateLine = useCallback(<K extends keyof LineState>(
        index: number, field: K, value: LineState[K],
    ) => {
        setLines(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    }, []);

    const handleSubmit = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (!vendorId) { setError("Tedarikçi seçmelisiniz."); return; }
        if (!currency) { setError("Para birimi seçmelisiniz."); return; }

        const parsedLines = [];
        for (const [i, ln] of lines.entries()) {
            const qty = Number(ln.quantity);
            if (!Number.isFinite(qty) || !Number.isInteger(qty) || qty <= 0) {
                setError(`Satır ${i + 1} (${ln.productName}): miktar pozitif tam sayı olmalıdır.`);
                return;
            }
            const price = Number(ln.unit_price);
            if (!Number.isFinite(price) || price <= 0) {
                setError(`Satır ${i + 1} (${ln.productName}): birim fiyat geçersiz veya sıfır olamaz.`);
                return;
            }
            const disc = Number(ln.discount_pct || "0");
            if (!Number.isFinite(disc) || disc < 0 || disc > 100) {
                setError(`Satır ${i + 1}: iskonto 0-100 arası olmalıdır.`);
                return;
            }
            parsedLines.push({
                recommendation_id: ln.recommendation_id,
                quantity: qty,
                unit_price: price,
                discount_pct: disc,
                notes: ln.notes.trim() || null,
            });
        }

        setError(null);
        setSubmitting(true);
        try {
            const res = await fetch("/api/purchase-orders/from-recommendations", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    vendor_id: vendorId,
                    currency,
                    expected_date: expectedDate || null,
                    notes: notes.trim() || null,
                    lines: parsedLines,
                }),
            });
            const data = await res.json();
            if (!res.ok) {
                setError(data.error ?? "Sipariş oluşturulamadı.");
                return;
            }
            onSuccess(data.id, data.po_number);
            onClose();
        } catch {
            setError("Ağ hatası — tekrar deneyin.");
        } finally {
            setSubmitting(false);
        }
    };

    if (!open) return null;

    const isLocked = mode === "bulk-vendor" && !!lockedVendorId;
    const title = mode === "single"
        ? "Satın Alma Siparişi Oluştur"
        : mode === "bulk-vendor"
        ? "Toplu Sipariş — Tedarikçi Grubu"
        : "Tedarikçi Seç — Tedarikçisiz Ürünler";

    const inputStyle: React.CSSProperties = {
        fontSize: "13px",
        padding: "6px 10px",
        border: "0.5px solid var(--border-secondary)",
        borderRadius: "6px",
        background: "var(--bg-tertiary)",
        color: "var(--text-primary)",
        width: "100%",
        boxSizing: "border-box",
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: "fixed",
                    inset: 0,
                    zIndex: 200,
                    background: "rgba(0,0,0,0.5)",
                }}
                aria-hidden="true"
            />
            {/* Panel */}
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                style={{
                    position: "fixed",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 201,
                    width: "min(520px, 100vw)",
                    background: "var(--bg-primary)",
                    borderLeft: "0.5px solid var(--border-secondary)",
                    boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "16px 20px",
                    borderBottom: "0.5px solid var(--border-secondary)",
                    flexShrink: 0,
                }}>
                    <h2 style={{ margin: 0, fontSize: "15px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {title}
                    </h2>
                    <button
                        onClick={onClose}
                        aria-label="Kapat"
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            fontSize: "20px",
                            color: "var(--text-tertiary)",
                            padding: "2px 6px",
                            lineHeight: 1,
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Scrollable body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px" }}>
                    {/* Vendor */}
                    <div style={{ marginBottom: "14px" }}>
                        <label
                            htmlFor="po-modal-vendor"
                            style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}
                        >
                            Tedarikçi *
                        </label>
                        {isLocked ? (
                            <div style={{ ...inputStyle, color: "var(--text-tertiary)" }}>
                                {vendors.find(v => v.id === lockedVendorId)?.name ?? lockedVendorId}
                            </div>
                        ) : (
                            <select
                                id="po-modal-vendor"
                                value={vendorId}
                                onChange={e => setVendorId(e.target.value)}
                                aria-label="Tedarikçi seçin"
                                style={inputStyle}
                            >
                                <option value="">— Seçin —</option>
                                {vendors.map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                        )}
                    </div>

                    {/* Currency + Expected date */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "14px" }}>
                        <div>
                            <label
                                htmlFor="po-modal-currency"
                                style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}
                            >
                                Para Birimi
                            </label>
                            <select
                                id="po-modal-currency"
                                value={currency}
                                onChange={e => setCurrency(e.target.value)}
                                aria-label="Para birimi seçin"
                                style={inputStyle}
                            >
                                <option value="TRY">TRY</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                            </select>
                        </div>
                        <div>
                            <label
                                htmlFor="po-modal-date"
                                style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}
                            >
                                Beklenen Tarih
                            </label>
                            <input
                                id="po-modal-date"
                                type="date"
                                value={expectedDate}
                                onChange={e => { setExpectedDate(e.target.value); setExpectedDateDirty(true); }}
                                aria-label="Beklenen teslim tarihi"
                                style={inputStyle}
                            />
                        </div>
                    </div>

                    {/* Notes */}
                    <div style={{ marginBottom: "20px" }}>
                        <label
                            htmlFor="po-modal-notes"
                            style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--text-secondary)", marginBottom: "4px" }}
                        >
                            Notlar
                        </label>
                        <textarea
                            id="po-modal-notes"
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            rows={2}
                            placeholder="İsteğe bağlı sipariş notu…"
                            aria-label="Sipariş notları"
                            style={{ ...inputStyle, resize: "vertical" }}
                        />
                    </div>

                    {/* Lines */}
                    <div style={{ marginBottom: "8px" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "8px" }}>
                            Satırlar
                        </div>
                        {lines.map((ln, i) => (
                            <div
                                key={ln.recommendation_id}
                                style={{
                                    padding: "10px 12px",
                                    marginBottom: "8px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "8px",
                                    background: "var(--bg-secondary)",
                                }}
                            >
                                <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "8px" }}>
                                    {ln.productName}
                                </div>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: "8px" }}>
                                    <div>
                                        <label
                                            htmlFor={`po-modal-qty-${i}`}
                                            style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "3px" }}
                                        >
                                            Miktar ({ln.unit})
                                        </label>
                                        <input
                                            id={`po-modal-qty-${i}`}
                                            type="number"
                                            min={1}
                                            value={ln.quantity}
                                            onChange={e => updateLine(i, "quantity", e.target.value)}
                                            aria-label={`${ln.productName} miktarı`}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor={`po-modal-price-${i}`}
                                            style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "3px" }}
                                        >
                                            Birim Fiyat
                                        </label>
                                        <input
                                            id={`po-modal-price-${i}`}
                                            type="number"
                                            min={0}
                                            step="0.01"
                                            value={ln.unit_price}
                                            onChange={e => updateLine(i, "unit_price", e.target.value)}
                                            aria-label={`${ln.productName} birim fiyatı`}
                                            style={inputStyle}
                                        />
                                    </div>
                                    <div>
                                        <label
                                            htmlFor={`po-modal-disc-${i}`}
                                            style={{ display: "block", fontSize: "11px", color: "var(--text-secondary)", marginBottom: "3px" }}
                                        >
                                            İskonto %
                                        </label>
                                        <input
                                            id={`po-modal-disc-${i}`}
                                            type="number"
                                            min={0}
                                            max={100}
                                            step="0.01"
                                            value={ln.discount_pct}
                                            onChange={e => updateLine(i, "discount_pct", e.target.value)}
                                            aria-label={`${ln.productName} iskonto yüzdesi`}
                                            style={inputStyle}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Error */}
                    {error && (
                        <div
                            role="alert"
                            aria-live="polite"
                            style={{
                                marginTop: "12px",
                                padding: "10px 14px",
                                background: "var(--danger-bg)",
                                color: "var(--danger-text)",
                                border: "0.5px solid var(--danger-border)",
                                borderRadius: "6px",
                                fontSize: "13px",
                            }}
                        >
                            {error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: "16px 20px",
                    borderTop: "0.5px solid var(--border-secondary)",
                    display: "flex",
                    gap: "10px",
                    justifyContent: "flex-end",
                    flexShrink: 0,
                }}>
                    <button
                        onClick={onClose}
                        disabled={submitting}
                        style={{
                            padding: "8px 18px",
                            fontSize: "13px",
                            fontWeight: 500,
                            borderRadius: "6px",
                            border: "0.5px solid var(--border-secondary)",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: submitting ? "not-allowed" : "pointer",
                        }}
                    >
                        İptal
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={submitting || isDemo}
                        title={isDemo ? "Demo modunda devre dışı." : undefined}
                        aria-label="Siparişi oluştur"
                        style={{
                            padding: "8px 20px",
                            fontSize: "13px",
                            fontWeight: 600,
                            borderRadius: "6px",
                            border: "none",
                            background: submitting || isDemo ? "var(--border-secondary)" : "var(--accent)",
                            color: submitting || isDemo ? "var(--text-tertiary)" : "var(--accent-text)",
                            cursor: submitting || isDemo ? "not-allowed" : "pointer",
                        }}
                    >
                        {submitting ? "Oluşturuluyor…" : "Siparişi Oluştur"}
                    </button>
                </div>
            </div>
        </>
    );
}
