"use client";

import { useState, useRef, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { formatCurrency } from "@/lib/utils";
import { type Customer, type Product, type OrderLineItem } from "@/lib/mock-data";
import { useData } from "@/lib/data-context";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";

interface OrderLine {
    id: string;
    product: Product | null;
    quantity: number;
    unitPrice: number;
    discountPct: number;
}

function newLine(): OrderLine {
    return { id: crypto.randomUUID(), product: null, quantity: 1, unitPrice: 0, discountPct: 0 };
}

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: "11px",
    fontWeight: 500,
    color: "var(--text-tertiary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    whiteSpace: "nowrap",
};

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "5px 8px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "4px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
};

function NewOrderForm() {
    const { customers, products, addOrder } = useData();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customerSearch, setCustomerSearch] = useState("");
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [lines, setLines] = useState<OrderLine[]>([newLine()]);
    const [notes, setNotes] = useState("");
    const [quoteValidUntil, setQuoteValidUntil] = useState<string>(
        new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
    );
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitAttempted, setSubmitAttempted] = useState(false);
    const [windowWidth, setWindowWidth] = useState<number>(
        typeof window !== "undefined" ? window.innerWidth : 1200
    );
    const dropdownRef    = useRef<HTMLDivElement>(null);
    const prefillDoneRef = useRef(false);
    // Capture URL params once — searchParams identity can change between renders in Next.js
    const prefillIdRef   = useRef(searchParams.get("customerId"));
    const prefillNameRef = useRef(searchParams.get("customerName"));

    // Pre-fill customer from query param — prefer customerId, fall back to customerName.
    // Depends on `customers` so the effect re-fires after async data loads on cold/deep-link.
    // prefillDoneRef ensures the lookup runs at most once regardless of how many times
    // `customers` updates.
    useEffect(() => {
        if (prefillDoneRef.current) return;
        if (customers.length === 0) return;
        prefillDoneRef.current = true;
        const id   = prefillIdRef.current;
        const name = prefillNameRef.current;
        if (!id && !name) return;
        let found: Customer | undefined;
        if (id) found = customers.find(c => c.id === id);
        if (!found && name) found = customers.find(c => c.name === decodeURIComponent(name));
        if (found) setSelectedCustomer(found);
    }, [customers]);

    // Close dropdown on outside click
    useEffect(() => {
        function handleClick(e: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setDropdownOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Track window width for mobile layout
    useEffect(() => {
        function handleResize() { setWindowWidth(window.innerWidth); }
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    }, []);

    const isMobile = windowWidth < 768;

    const filteredCustomers = customers.filter((c: Customer) =>
        c.isActive && c.name.trim() &&
        (c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
        c.country.toLowerCase().includes(customerSearch.toLowerCase()))
    );

    // Line operations
    const updateProduct = (lineId: string, productId: string) => {
        const product = products.find((p: Product) => p.id === productId) || null;
        setLines(lines.map(l =>
            l.id === lineId ? { ...l, product, unitPrice: product ? product.price : 0 } : l
        ));
    };

    const updateField = (lineId: string, field: "quantity" | "unitPrice" | "discountPct", val: number) => {
        setLines(lines.map(l => l.id === lineId ? { ...l, [field]: val } : l));
    };

    const removeLine = (lineId: string) => {
        if (lines.length > 1) setLines(lines.filter(l => l.id !== lineId));
    };

    // Calculations
    const currency = selectedCustomer?.currency ?? "USD";
    const lineTotal = (l: OrderLine) =>
        l.product ? l.quantity * l.unitPrice * (1 - l.discountPct / 100) : 0;
    const subtotal = lines.reduce((acc, l) => acc + lineTotal(l), 0);
    const vat = subtotal * 0.20;
    const grandTotal = subtotal + vat;

    const filledLines = lines.filter(l => l.product !== null).length;
    const canSubmit = selectedCustomer !== null && filledLines > 0 && grandTotal > 0;

    const blockReasons: string[] = [];
    if (!selectedCustomer) blockReasons.push("Müşteri seçilmedi");
    if (filledLines === 0)  blockReasons.push("En az 1 ürün gerekli");
    if (filledLines > 0 && grandTotal <= 0) blockReasons.push("Sipariş tutarı 0'dan büyük olmalı");
    const disabledReasonText = blockReasons.join(" · ");

    const buildAndSave = async (mode: "draft" | "pending_approval") => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setSubmitAttempted(true);
        if (!canSubmit) return;
        setIsSubmitting(true);
        try {
            const orderLines: OrderLineItem[] = lines
                .filter(l => l.product !== null)
                .map(l => ({
                    id: crypto.randomUUID(),
                    productId: l.product!.id,
                    productName: l.product!.name,
                    productSku: l.product!.sku,
                    unit: l.product!.unit,
                    quantity: l.quantity,
                    unitPrice: l.unitPrice,
                    discountPct: l.discountPct,
                    lineTotal: lineTotal(l),
                }));
            await addOrder({
                customerName: selectedCustomer.name,
                customerId: selectedCustomer.id,
                customerEmail: selectedCustomer.email,
                customerCountry: selectedCustomer.country,
                customerTaxOffice: selectedCustomer.taxOffice,
                customerTaxNumber: selectedCustomer.taxNumber,
                commercial_status: mode,
                fulfillment_status: "unallocated",
                currency,
                createdAt: new Date().toISOString().slice(0, 10),
                subtotal,
                vatTotal: vat,
                grandTotal,
                notes,
                quoteValidUntil: quoteValidUntil || undefined,
                lines: orderLines,
            });
            toast({ type: "success", message: mode === "draft" ? "Sipariş taslak olarak kaydedildi" : "Sipariş oluşturuldu ve onaya gönderildi" });
            router.push("/dashboard/orders");
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Sipariş kaydedilemedi. Lütfen tekrar deneyin.";
            toast({ type: "error", message: msg });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <Link href="/dashboard/orders">
                        <button
                            style={{
                                fontSize: "12px",
                                padding: "5px 10px",
                                border: "0.5px solid var(--border-secondary)",
                                borderRadius: "6px",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M8 2L4 6l4 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                            Siparişler
                        </button>
                    </Link>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M3 2l3 3-3 3" stroke="var(--text-tertiary)" strokeWidth="1" strokeLinecap="round" />
                    </svg>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Yeni Sipariş
                    </div>
                </div>
                {!isMobile && (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px" }}>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <Button variant="secondary" loading={isSubmitting} onClick={() => buildAndSave("draft")} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                {isSubmitting ? "Kaydediliyor…" : "Taslak Kaydet"}
                            </Button>
                            <Button variant="primary" loading={isSubmitting} onClick={() => buildAndSave("pending_approval")} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                {isSubmitting ? "Gönderiliyor…" : "Gönder →"}
                            </Button>
                        </div>
                        {submitAttempted && !canSubmit && !isSubmitting && (
                            <div style={{ fontSize: "11px", color: "var(--danger-text)" }}>
                                {disabledReasonText}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Main grid */}
            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr" : "1fr 300px",
                gap: "12px",
                alignItems: "start",
                paddingBottom: isMobile ? "80px" : undefined,
            }}>

                {/* Left column */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>

                    {/* Customer selector */}
                    <div
                        style={{
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--border-tertiary)",
                            borderRadius: "6px",
                            padding: "14px 16px",
                        }}
                    >
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "10px" }}>
                            Müşteri
                            <span style={{ color: "var(--danger-text)", marginLeft: "2px" }}>*</span>
                        </div>

                        {/* Dropdown */}
                        <div ref={dropdownRef} style={{ position: "relative" }}>
                            <button
                                onClick={() => setDropdownOpen(!dropdownOpen)}
                                style={{
                                    width: "100%",
                                    fontSize: "13px",
                                    padding: "7px 10px",
                                    border: `0.5px solid ${
                                    submitAttempted && !selectedCustomer
                                        ? "var(--danger-border)"
                                        : dropdownOpen ? "var(--accent-border)" : "var(--border-secondary)"
                                }`,
                                    borderRadius: "6px",
                                    background: "var(--bg-secondary)",
                                    color: selectedCustomer ? "var(--text-primary)" : "var(--text-tertiary)",
                                    cursor: "pointer",
                                    textAlign: "left",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                }}
                            >
                                <span>{selectedCustomer ? selectedCustomer.name : "Müşteri ara veya seç..."}</span>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <path d="M2 3.5L5 6.5l3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                                </svg>
                            </button>

                            {dropdownOpen && (
                                <div
                                    style={{
                                        position: "absolute",
                                        top: "calc(100% + 4px)",
                                        left: 0,
                                        right: 0,
                                        background: "var(--bg-primary)",
                                        border: "0.5px solid var(--border-primary)",
                                        borderRadius: "6px",
                                        zIndex: 100,
                                        boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                                        overflow: "hidden",
                                    }}
                                >
                                    <div style={{ padding: "8px" }}>
                                        <input
                                            autoFocus
                                            type="text"
                                            value={customerSearch}
                                            onChange={e => setCustomerSearch(e.target.value)}
                                            placeholder="Firma adı veya ülke..."
                                            style={{
                                                ...inputStyle,
                                                background: "var(--bg-secondary)",
                                                padding: "6px 10px",
                                            }}
                                        />
                                    </div>
                                    <div style={{ maxHeight: "200px", overflowY: "auto" }}>
                                        {filteredCustomers.length === 0 ? (
                                            <div style={{ padding: "12px 16px", fontSize: "12px", color: "var(--text-tertiary)" }}>
                                                Müşteri bulunamadı
                                            </div>
                                        ) : filteredCustomers.map(c => (
                                            <div
                                                key={c.id}
                                                onClick={() => {
                                                    setSelectedCustomer(c);
                                                    setDropdownOpen(false);
                                                    setCustomerSearch("");
                                                }}
                                                style={{
                                                    padding: "8px 16px",
                                                    cursor: "pointer",
                                                    fontSize: "13px",
                                                    color: "var(--text-primary)",
                                                    display: "flex",
                                                    justifyContent: "space-between",
                                                    alignItems: "center",
                                                    borderBottom: "0.5px solid var(--border-tertiary)",
                                                }}
                                                onMouseEnter={e => (e.currentTarget.style.background = "var(--bg-secondary)")}
                                                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                            >
                                                <span>{c.name}</span>
                                                <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{c.country} · {c.currency}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Selected customer preview */}
                        {selectedCustomer && (
                            <div
                                style={{
                                    marginTop: "10px",
                                    padding: "10px 12px",
                                    background: "var(--bg-secondary)",
                                    borderRadius: "4px",
                                    fontSize: "12px",
                                    color: "var(--text-secondary)",
                                    lineHeight: 1.6,
                                }}
                            >
                                <div style={{ color: "var(--text-primary)", fontWeight: 500, marginBottom: "2px" }}>{selectedCustomer.name}</div>
                                <div>{selectedCustomer.address}</div>
                                <div>{selectedCustomer.taxOffice} VD · {selectedCustomer.taxNumber}</div>
                            </div>
                        )}

                        {submitAttempted && !selectedCustomer && (
                            <div style={{
                                marginTop: "6px",
                                fontSize: "11px",
                                color: "var(--danger-text)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                            }}>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1"/>
                                    <path d="M5 3v2.5M5 7h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                                Lütfen bir müşteri seçin
                            </div>
                        )}
                    </div>

                    {/* Order lines */}
                    <div
                        style={{
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--border-tertiary)",
                            borderRadius: "6px",
                            overflow: "hidden",
                        }}
                    >
                        <div
                            style={{
                                padding: "12px 16px",
                                borderBottom: "0.5px solid var(--border-tertiary)",
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "var(--text-primary)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                            }}
                        >
                            Sipariş Kalemleri
                            <span style={{ color: "var(--danger-text)" }}>*</span>
                        </div>

                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                            <thead>
                                <tr style={{ background: "var(--bg-secondary)" }}>
                                    <th style={{ ...thStyle, width: "36px" }}>#</th>
                                    <th style={thStyle}>Ürün</th>
                                    <th style={{ ...thStyle, width: "80px", textAlign: "right" }}>Adet</th>
                                    <th style={{ ...thStyle, width: "110px", textAlign: "right" }}>Birim Fiyat</th>
                                    <th style={{ ...thStyle, width: "70px", textAlign: "right" }}>İsk. %</th>
                                    <th style={{ ...thStyle, width: "110px", textAlign: "right" }}>Toplam</th>
                                    <th style={{ ...thStyle, width: "32px" }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((line, idx) => {
                                    const total = lineTotal(line);
                                    const liveProduct = line.product ? products.find(p => p.id === line.product!.id) : null;
                                    const promisable = liveProduct?.promisable ?? null;
                                    const stockInsufficient = promisable !== null && line.quantity > promisable;
                                    const stockLow = promisable !== null && !stockInsufficient && promisable <= (liveProduct?.minStockLevel ?? 0);
                                    return (
                                        <tr key={line.id} style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                            <td style={{ padding: "8px 12px", color: "var(--text-tertiary)", fontSize: "12px", textAlign: "center" }}>
                                                {idx + 1}
                                            </td>
                                            <td style={{ padding: "8px 12px" }}>
                                                <select
                                                    value={line.product?.id || ""}
                                                    onChange={e => updateProduct(line.id, e.target.value)}
                                                    style={{
                                                        ...inputStyle,
                                                        minWidth: "200px",
                                                    }}
                                                >
                                                    <option value="" disabled>Ürün seç...</option>
                                                    {products.map((p: Product) => (
                                                        <option key={p.id} value={p.id}>
                                                            {p.sku} — {p.name}
                                                        </option>
                                                    ))}
                                                </select>
                                                {promisable !== null && (
                                                    <div style={{
                                                        fontSize: "11px",
                                                        marginTop: "3px",
                                                        color: stockInsufficient ? "var(--danger-text)" : stockLow ? "var(--warning-text)" : "var(--text-tertiary)",
                                                        fontWeight: stockInsufficient ? 600 : 400,
                                                    }}>
                                                        {stockInsufficient
                                                            ? `Teklif verilemez — ${promisable} ${liveProduct?.unit} verilebilir (Stokta ${liveProduct?.on_hand}, Tekliflerde ${liveProduct?.quoted})`
                                                            : `Stokta: ${liveProduct?.on_hand} | Tekliflerde: ${liveProduct?.quoted} | Verilebilir: ${promisable} ${liveProduct?.unit}${stockLow ? " — Düşük" : ""}`
                                                        }
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: "8px 12px" }}>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    value={line.quantity}
                                                    onChange={e => updateField(line.id, "quantity", Math.max(1, parseInt(e.target.value) || 1))}
                                                    style={{
                                                        ...inputStyle,
                                                        textAlign: "right",
                                                        width: "64px",
                                                        borderColor: stockInsufficient ? "var(--danger-border)" : undefined,
                                                    }}
                                                />
                                            </td>
                                            <td style={{ padding: "8px 12px" }}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step={0.01}
                                                    value={line.unitPrice}
                                                    onChange={e => updateField(line.id, "unitPrice", parseFloat(e.target.value) || 0)}
                                                    style={{ ...inputStyle, textAlign: "right", width: "90px" }}
                                                />
                                            </td>
                                            <td style={{ padding: "8px 12px" }}>
                                                <input
                                                    type="number"
                                                    min={0}
                                                    max={100}
                                                    step={1}
                                                    value={line.discountPct}
                                                    onChange={e => updateField(line.id, "discountPct", Math.min(100, parseFloat(e.target.value) || 0))}
                                                    style={{ ...inputStyle, textAlign: "right", width: "52px" }}
                                                />
                                            </td>
                                            <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 500, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                                                {total > 0 ? formatCurrency(total, currency) : "—"}
                                            </td>
                                            <td style={{ padding: "8px 12px", textAlign: "center" }}>
                                                <button
                                                    onClick={() => { removeLine(line.id); if (lines.length > 1) toast({ type: "success", message: "Satır kaldırıldı" }); }}
                                                    disabled={lines.length === 1}
                                                    style={{
                                                        fontSize: "14px",
                                                        color: lines.length === 1 ? "var(--text-tertiary)" : "var(--danger-text)",
                                                        background: "transparent",
                                                        border: "none",
                                                        cursor: lines.length === 1 ? "not-allowed" : "pointer",
                                                        padding: "2px 4px",
                                                        opacity: lines.length === 1 ? 0.3 : 1,
                                                    }}
                                                >
                                                    ×
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>

                        {submitAttempted && filledLines === 0 && (
                            <div style={{
                                padding: "6px 16px",
                                fontSize: "11px",
                                color: "var(--danger-text)",
                                display: "flex",
                                alignItems: "center",
                                gap: "4px",
                            }}>
                                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                                    <circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1"/>
                                    <path d="M5 3v2.5M5 7h.01" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                                </svg>
                                En az bir ürün seçilmeli
                            </div>
                        )}

                        {/* Add line */}
                        <button
                            onClick={() => setLines([...lines, newLine()])}
                            style={{
                                width: "100%",
                                height: "40px",
                                fontSize: "13px",
                                border: "none",
                                borderTop: "0.5px dashed var(--border-secondary)",
                                borderRadius: "0 0 6px 6px",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                            }}
                            onMouseEnter={e => {
                                e.currentTarget.style.color = "var(--accent-text)";
                                e.currentTarget.style.background = "var(--accent-bg)";
                                e.currentTarget.style.borderTopColor = "var(--accent-border)";
                            }}
                            onMouseLeave={e => {
                                e.currentTarget.style.color = "var(--text-secondary)";
                                e.currentTarget.style.background = "transparent";
                                e.currentTarget.style.borderTopColor = "var(--border-secondary)";
                            }}
                        >
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                            </svg>
                            Kalem Ekle
                        </button>
                    </div>
                </div>

                {/* Right column — Summary */}
                <div
                    style={{
                        position: isMobile ? "static" : "sticky",
                        top: isMobile ? undefined : "68px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                    }}
                >
                    <div
                        style={{
                            background: "var(--bg-primary)",
                            border: "0.5px solid var(--border-tertiary)",
                            borderRadius: "6px",
                            padding: "14px 16px",
                        }}
                    >
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "14px" }}>
                            Sipariş Özeti
                        </div>

                        {/* Stats */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                            {[
                                { label: "Ara Toplam", value: formatCurrency(subtotal, currency) },
                                { label: "KDV (%20)", value: formatCurrency(vat, currency) },
                            ].map(row => (
                                <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "12px" }}>
                                    <span style={{ color: "var(--text-secondary)" }}>{row.label}</span>
                                    <span style={{ color: "var(--text-primary)" }}>{row.value}</span>
                                </div>
                            ))}
                            <div
                                style={{
                                    borderTop: "0.5px solid var(--border-tertiary)",
                                    paddingTop: "10px",
                                    marginTop: "4px",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "baseline",
                                }}
                            >
                                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>Genel Toplam</span>
                                <span style={{ fontSize: "20px", fontWeight: 700, color: "var(--text-primary)" }}>
                                    {formatCurrency(grandTotal, currency)}
                                </span>
                            </div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textAlign: "right" }}>
                                {filledLines} kalem · {currency} para birimi
                            </div>
                        </div>

                        {/* Notes */}
                        <div style={{ marginTop: "14px" }}>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                Sipariş Notu
                            </div>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                placeholder="Özel talimatlar, referans no..."
                                rows={3}
                                style={{
                                    ...inputStyle,
                                    resize: "vertical",
                                    padding: "7px 10px",
                                    lineHeight: 1.5,
                                    fontFamily: "inherit",
                                }}
                            />
                        </div>

                        {/* Teklif Geçerliliği */}
                        <div style={{ marginTop: "14px" }}>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                                Teklif Geçerliliği
                            </div>
                            <input
                                type="date"
                                value={quoteValidUntil}
                                onChange={e => setQuoteValidUntil(e.target.value)}
                                min={new Date().toISOString().slice(0, 10)}
                                style={{ ...inputStyle, padding: "7px 10px" }}
                            />
                            {quoteValidUntil && (
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px" }}>
                                    {(() => {
                                        const d = Math.ceil((new Date(quoteValidUntil).getTime() - Date.now()) / 86_400_000);
                                        return d < 0
                                            ? <span style={{ color: "var(--danger-text)" }}>{Math.abs(d)} gün geçti</span>
                                            : `${d} gün kaldı`;
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "12px" }}>
                            <Button variant="primary" size="md" fullWidth loading={isSubmitting} onClick={() => buildAndSave("pending_approval")} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                {isSubmitting ? "Gönderiliyor…" : "Siparişi Oluştur ve Gönder"}
                            </Button>
                            <Button variant="secondary" fullWidth loading={isSubmitting} onClick={() => buildAndSave("draft")} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                                {isSubmitting ? "Kaydediliyor…" : "Taslak Olarak Kaydet"}
                            </Button>
                            {submitAttempted && !canSubmit && !isSubmitting && (
                                <div style={{ fontSize: "11px", color: "var(--danger-text)", textAlign: "center", marginTop: "2px" }}>
                                    {disabledReasonText}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile sticky action bar */}
            {isMobile && (
                <div
                    style={{
                        position: "fixed",
                        bottom: 0,
                        left: 0,
                        right: 0,
                        background: "var(--bg-primary)",
                        borderTop: "0.5px solid var(--border-tertiary)",
                        padding: "12px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                        zIndex: 50,
                    }}
                >
                    <div style={{ display: "flex", gap: "8px" }}>
                        <Button variant="secondary" fullWidth loading={isSubmitting} onClick={() => buildAndSave("draft")} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                            {isSubmitting ? "Kaydediliyor…" : "Taslak Kaydet"}
                        </Button>
                        <Button variant="primary" fullWidth loading={isSubmitting} onClick={() => buildAndSave("pending_approval")} disabled={isDemo} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                            {isSubmitting ? "Gönderiliyor…" : "Gönder →"}
                        </Button>
                    </div>
                    {submitAttempted && !canSubmit && !isSubmitting && (
                        <div style={{ fontSize: "11px", color: "var(--danger-text)", textAlign: "center" }}>
                            {disabledReasonText}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function NewOrderPage() {
    return (
        <Suspense>
            <NewOrderForm />
        </Suspense>
    );
}
