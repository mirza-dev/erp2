"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { QuoteData } from "../components/quote-types";
import { useData } from "@/lib/data-context";
import type { Customer, Product, QuoteDetail } from "@/lib/mock-data";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import type { QuoteStatus } from "@/lib/database.types";

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuoteRow {
    id: number;
    code: string;
    lead: string;
    desc: string;
    qty: string;
    price: string;
    hs: string;
    kg: string;
}

type Currency = "TRY" | "USD" | "EUR";
const SYM: Record<Currency, string> = { TRY: "₺", USD: "$", EUR: "€" };

function fmt(n: number) {
    return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emptyRow(id: number): QuoteRow {
    return { id, code: "", lead: "", desc: "", qty: "", price: "", hs: "", kg: "" };
}

// ── Injected styles (hover states + print) ────────────────────────────────────

const INJECTED_CSS = `
.q-del-btn { opacity: 0; transition: opacity .1s; }
tr:hover .q-del-btn { opacity: 1; }
.q-del-btn:hover { background: var(--danger-bg) !important; color: var(--danger-text) !important; }
.q-card table tbody tr:hover td { background: var(--bg-hover, #2a2e37) !important; }
.q-cell:hover { border-color: var(--border-secondary) !important; background: var(--bg-secondary) !important; }
.q-cell:focus { border-color: var(--accent-border) !important; background: var(--bg-secondary) !important; outline: none; }
.q-total-inp:hover { border-color: var(--border-secondary) !important; background: var(--bg-secondary) !important; }
.q-total-inp:focus { border-color: var(--accent-border) !important; background: var(--bg-secondary) !important; outline: none; }
.q-add-btn:hover { color: var(--accent-text) !important; background: var(--accent-bg) !important; }
.q-btn:hover { background: var(--bg-tertiary) !important; color: var(--text-primary) !important; }
.q-btn-primary:hover { background: rgba(56,139,253,0.25) !important; }
.q-info-inp:focus { border-bottom-style: solid !important; border-bottom-color: var(--accent-border) !important; outline: none; }
.q-field-inp:focus { border-color: var(--accent-border) !important; outline: none; }
.q-notes:focus { border-color: var(--accent-border) !important; outline: none; }
.q-logo-ph:hover { border-color: var(--accent) !important; }
.q-cust-opt:hover { background: var(--bg-hover, #2a2e37) !important; }
`;

// ── Props ─────────────────────────────────────────────────────────────────────

interface QuoteFormProps {
    initialData?: QuoteDetail;
    readOnly?: boolean;
    status?: QuoteStatus;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuoteForm({ initialData, readOnly, status }: QuoteFormProps) {
    // ── Data context ──────────────────────────────────────────────────────────
    const { customers, products } = useData();

    // ── State ────────────────────────────────────────────────────────────────
    const [rows, setRows] = useState<QuoteRow[]>([]);
    const [nextId, setNextId] = useState(4);
    const [currency, setCurrency] = useState<Currency>("TRY");
    const [vatRate, setVatRate] = useState(20);
    const [logoSrc, setLogoSrc] = useState<string | null>(null);

    // DB persistence state
    const [quoteId, setQuoteId] = useState<string | null>(initialData?.id ?? null);
    const [saving, setSaving] = useState(false);

    // Manual total overrides
    const [ovSub, setOvSub] = useState<number | null>(null);
    const [ovVat, setOvVat] = useState<number | null>(null);
    const [ovGrand, setOvGrand] = useState<number | null>(null);

    // Edit buffers + focus tracking for total inputs (avoids useEffect-based sync)
    const [subDisp, setSubDisp] = useState("");
    const [vatDisp, setVatDisp] = useState("");
    const [grandDisp, setGrandDisp] = useState("");
    const [subFocused, setSubFocused] = useState(false);
    const [vatFocused, setVatFocused] = useState(false);
    const [grandFocused, setGrandFocused] = useState(false);

    // Customer fields
    const [custCompany, setCustCompany] = useState("");
    const [custContact, setCustContact] = useState("");
    const [custPhone, setCustPhone] = useState("");
    const [custEmail, setCustEmail] = useState("");

    // Quote detail fields
    const [salesRep, setSalesRep] = useState("");
    const [salesPhone, setSalesPhone] = useState("");
    const [salesEmail, setSalesEmail] = useState("");
    const [quoteNo, setQuoteNo] = useState("");
    const [quoteDate, setQuoteDate] = useState("");
    const [validUntil, setValidUntil] = useState("");

    // Seller (PMT) header info
    const [sellerName, setSellerName] = useState("PMT Endüstri A.Ş.");
    const [sellerTel, setSellerTel] = useState("");
    const [sellerEmail, setSellerEmail] = useState("");
    const [sellerAddr, setSellerAddr] = useState("");
    const [sellerTaxId, setSellerTaxId] = useState("");
    const [sellerWeb, setSellerWeb] = useState("");

    // Footer
    const [notes, setNotes] = useState("");
    const [sig1, setSig1] = useState("");
    const [sig2, setSig2] = useState("");
    const [sig3, setSig3] = useState("");
    const [sig1Title, setSig1Title] = useState("");
    const [sig2Title, setSig2Title] = useState("");
    const [sig3Title, setSig3Title] = useState("");

    // Toast
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    // Router
    const router = useRouter();

    // Autocomplete state — customer
    const [custSuggestions, setCustSuggestions] = useState<Customer[]>([]);
    const [custDropdownOpen, setCustDropdownOpen] = useState(false);

    // Autocomplete state — product (per-row, only one open at a time)
    const [prodOpenRowId, setProdOpenRowId] = useState<number | null>(null);
    const [prodSuggestions, setProdSuggestions] = useState<Product[]>([]);

    // Refs
    const logoFileRef = useRef<HTMLInputElement>(null);
    const custWrapperRef = useRef<HTMLDivElement>(null);

    // ── Computed ─────────────────────────────────────────────────────────────
    const sym = SYM[currency];
    const compSub = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
    const compKg  = rows.reduce((s, r) => s + (parseFloat(r.kg) || 0), 0);
    const effSub   = ovSub   !== null ? ovSub   : compSub;
    const effVat   = ovVat   !== null ? ovVat   : effSub * vatRate / 100;
    const effGrand = ovGrand !== null ? ovGrand : effSub + effVat;

    // ── Init ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (initialData) {
            // DB'den yüklenen veri ile hydrate et
            setQuoteDate(initialData.quoteDate ?? new Date().toISOString().slice(0, 10));
            setValidUntil(initialData.validUntil ?? "");
            setQuoteNo(initialData.quoteNumber);
            setCurrency(initialData.currency as Currency);
            setVatRate(initialData.vatRate);
            setCustCompany(initialData.customerName);
            setCustContact(initialData.customerContact);
            setCustPhone(initialData.customerPhone);
            setCustEmail(initialData.customerEmail);
            setSalesRep(initialData.salesRep);
            setSalesPhone(initialData.salesPhone);
            setSalesEmail(initialData.salesEmail);
            setNotes(initialData.notes);
            setSig1(initialData.sigPrepared);
            setSig2(initialData.sigApproved);
            setSig3(initialData.sigManager);
            if (initialData.lines.length > 0) {
                const mapped = initialData.lines.map((l, i) => ({
                    id: i + 1,
                    code: l.productCode,
                    lead: l.leadTime,
                    desc: l.description,
                    qty: l.quantity > 0 ? String(l.quantity) : "",
                    price: l.unitPrice > 0 ? String(l.unitPrice) : "",
                    hs: l.hsCode,
                    kg: l.weightKg !== null ? String(l.weightKg) : "",
                }));
                setRows(mapped);
                setNextId(initialData.lines.length + 1);
            } else {
                setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
            }
        } else {
            // Browser-only: current date cannot be set without hydration mismatch
            setQuoteDate(new Date().toISOString().slice(0, 10));
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const saved = JSON.parse(localStorage.getItem("teklif_v3") || "{}") as any;
                if (saved.currency) setCurrency(saved.currency as Currency);
                if (saved.rows?.length) {
                    setRows(saved.rows.map((r: QuoteRow, i: number) => ({ ...r, id: i + 1 })));
                    setNextId(saved.rows.length + 1);
                } else {
                    setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
                }
            } catch {
                setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Firma ayarlarını çek — satıcı alanları DB'de saklanmaz, her modda company_settings'ten gelir
    useEffect(() => {
        fetch("/api/settings/company")
            .then(r => r.ok ? r.json() : null)
            .then(s => {
                if (!s) return;
                setSellerName(prev => (prev === "" || prev === "PMT Endüstri A.Ş.") && s.name ? s.name : prev);
                setSellerTel(prev => prev === "" && s.phone ? s.phone : prev);
                setSellerEmail(prev => prev === "" && s.email ? s.email : prev);
                setSellerAddr(prev => prev === "" && s.address ? s.address : prev);
                setSellerTaxId(prev => prev === "" && s.tax_no ? s.tax_no : prev);
                setSellerWeb(prev => prev === "" && s.website ? s.website : prev);
                setLogoSrc(prev => prev === null && s.logo_url ? s.logo_url : prev);
            })
            .catch(() => {/* ağ hatası — form çalışmaya devam eder */});
    }, []);

    // ── Customer autocomplete ─────────────────────────────────────────────────
    const handleCustCompanyChange = (value: string) => {
        setCustCompany(value);
        if (value.trim().length < 1) {
            setCustSuggestions([]);
            setCustDropdownOpen(false);
            return;
        }
        const q = value.toLowerCase();
        const matches = customers
            .filter(c => c.isActive)
            .filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                c.country.toLowerCase().includes(q)
            )
            .slice(0, 8);
        setCustSuggestions(matches);
        setCustDropdownOpen(matches.length > 0);
    };

    const handleSelectCustomer = (c: Customer) => {
        setCustCompany(c.name);
        setCustPhone(c.phone || "");
        setCustEmail(c.email || "");
        setCustDropdownOpen(false);
        setCustSuggestions([]);
    };

    useEffect(() => {
        if (custCompany.trim().length < 1 || customers.length === 0) return;
        const q = custCompany.toLowerCase();
        const matches = customers
            .filter(c => c.isActive)
            .filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.email.toLowerCase().includes(q) ||
                c.country.toLowerCase().includes(q)
            )
            .slice(0, 8);
        setCustSuggestions(matches);
        if (matches.length > 0) setCustDropdownOpen(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customers]);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (custWrapperRef.current && !custWrapperRef.current.contains(e.target as Node)) {
                setCustDropdownOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // ── Product autocomplete ──────────────────────────────────────────────────
    const handleCodeChange = (rowId: number, value: string) => {
        updateRow(rowId, "code", value);
        if (value.trim().length < 1) {
            setProdSuggestions([]);
            setProdOpenRowId(null);
            return;
        }
        setProdOpenRowId(rowId);
        if (products.length === 0) return;
        const q = value.toLowerCase();
        const matches = products
            .filter(p => p.isActive)
            .filter(p =>
                p.sku.toLowerCase().includes(q) ||
                p.name.toLowerCase().includes(q)
            )
            .slice(0, 8);
        setProdSuggestions(matches);
    };

    const handleSelectProduct = (rowId: number, p: Product) => {
        updateRow(rowId, "code", p.sku);
        updateRow(rowId, "desc", p.name);
        updateRow(rowId, "price", p.currency === currency ? String(p.price) : "");
        if (p.weightKg) {
            updateRow(rowId, "kg", String(p.weightKg));
        }
        setProdOpenRowId(null);
        setProdSuggestions([]);
    };

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!(e.target as HTMLElement).closest(".q-prod-cell")) {
                setProdOpenRowId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        if (!prodOpenRowId || products.length === 0) return;
        const row = rows.find(r => r.id === prodOpenRowId);
        if (!row || row.code.trim().length < 1) return;
        const q = row.code.toLowerCase();
        const matches = products
            .filter(p => p.isActive)
            .filter(p => p.sku.toLowerCase().includes(q) || p.name.toLowerCase().includes(q))
            .slice(0, 8);
        setProdSuggestions(matches);
        if (matches.length === 0) setProdOpenRowId(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [products]);

    // ── Auto-save to localStorage ─────────────────────────────────────────────
    const autoSave = useCallback(() => {
        if (readOnly) return;
        try {
            localStorage.setItem("teklif_v3", JSON.stringify({ currency, rows }));
            const fullData: QuoteData = {
                sellerName, sellerTel, sellerEmail, sellerAddr, sellerTaxId, sellerWeb, logoSrc,
                custCompany, custContact, custPhone, custEmail,
                quoteNo, quoteDate, validUntil, salesRep, salesPhone, salesEmail,
                currency, vatRate, rows,
                subtotal: ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0),
                vatTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    return ovVat !== null ? ovVat : sub * vatRate / 100;
                })(),
                grandTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    const vat = ovVat !== null ? ovVat : sub * vatRate / 100;
                    return ovGrand !== null ? ovGrand : sub + vat;
                })(),
                totalKg: rows.reduce((s, r) => s + (parseFloat(r.kg) || 0), 0),
                notes,
                signatures: [
                    { role: "Prepared by", roleTr: "Hazırlayan",   name: sig1, title: sig1Title },
                    { role: "Approved by", roleTr: "Onay",         name: sig2, title: sig2Title },
                    { role: "Manager Seal", roleTr: "Mühür Onayı", name: sig3, title: sig3Title },
                ],
                status: "draft",
            };
            localStorage.setItem("teklif_v3_full", JSON.stringify(fullData));
        } catch { /* noop */ }
    }, [readOnly, currency, rows, sellerName, sellerTel, sellerEmail, sellerAddr, sellerTaxId, sellerWeb, logoSrc,
        custCompany, custContact, custPhone, custEmail, quoteNo, quoteDate, validUntil,
        salesRep, salesPhone, salesEmail, vatRate, ovSub, ovVat, ovGrand,
        notes, sig1, sig1Title, sig2, sig2Title, sig3, sig3Title]);

    // Saves preview data regardless of readOnly — used by preview button
    const savePreviewData = useCallback(() => {
        try {
            localStorage.setItem("teklif_v3", JSON.stringify({ currency, rows }));
            const fullData: QuoteData = {
                sellerName, sellerTel, sellerEmail, sellerAddr, sellerTaxId, sellerWeb, logoSrc,
                custCompany, custContact, custPhone, custEmail,
                quoteNo, quoteDate, validUntil, salesRep, salesPhone, salesEmail,
                currency, vatRate, rows,
                subtotal: ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0),
                vatTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    return ovVat !== null ? ovVat : sub * vatRate / 100;
                })(),
                grandTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    const vat = ovVat !== null ? ovVat : sub * vatRate / 100;
                    return ovGrand !== null ? ovGrand : sub + vat;
                })(),
                totalKg: rows.reduce((s, r) => s + (parseFloat(r.kg) || 0), 0),
                notes,
                signatures: [
                    { role: "Prepared by", roleTr: "Hazırlayan",   name: sig1, title: sig1Title },
                    { role: "Approved by", roleTr: "Onay",         name: sig2, title: sig2Title },
                    { role: "Manager Seal", roleTr: "Mühür Onayı", name: sig3, title: sig3Title },
                ],
                status: (status ?? "draft") as QuoteData["status"],
            };
            localStorage.setItem("teklif_v3_full", JSON.stringify(fullData));
        } catch { /* noop */ }
    }, [status, currency, rows, sellerName, sellerTel, sellerEmail, sellerAddr, sellerTaxId, sellerWeb, logoSrc,
        custCompany, custContact, custPhone, custEmail, quoteNo, quoteDate, validUntil,
        salesRep, salesPhone, salesEmail, vatRate, ovSub, ovVat, ovGrand,
        notes, sig1, sig1Title, sig2, sig2Title, sig3, sig3Title]);

    useEffect(() => { autoSave(); }, [rows, currency, autoSave]);

    // ── Row handlers ─────────────────────────────────────────────────────────
    function addRow() {
        setRows(prev => [...prev, emptyRow(nextId)]);
        setNextId(n => n + 1);
    }
    function deleteRow(id: number) { setRows(prev => prev.filter(r => r.id !== id)); }
    function updateRow(id: number, field: keyof QuoteRow, value: string) {
        setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    }
    function clearAll() {
        if (!confirm("Tüm satırlar silinecek. Devam edilsin mi?")) return;
        setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
        setNextId(4);
    }

    // ── Other handlers ───────────────────────────────────────────────────────
    function handleLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => setLogoSrc(ev.target?.result as string);
        reader.readAsDataURL(file);
    }

    function showToast(msg: string, type: "success" | "error") {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 2500);
    }

    function lineTotal(r: QuoteRow) { return (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0); }

    // ── DB Persistence ────────────────────────────────────────────────────────
    function buildQuotePayload(): CreateQuoteInput {
        return {
            customer_name: custCompany,
            customer_contact: custContact || undefined,
            customer_phone: custPhone || undefined,
            customer_email: custEmail || undefined,
            sales_rep: salesRep || undefined,
            sales_phone: salesPhone || undefined,
            sales_email: salesEmail || undefined,
            currency,
            vat_rate: vatRate,
            subtotal: effSub,
            vat_total: effVat,
            grand_total: effGrand,
            notes: notes || undefined,
            sig_prepared: sig1 || undefined,
            sig_approved: sig2 || undefined,
            sig_manager: sig3 || undefined,
            quote_date: quoteDate || undefined,
            valid_until: validUntil || undefined,
            lines: rows
                .filter(r => r.code.trim() || r.desc.trim())
                .map((r, i) => ({
                    position: i,
                    product_code: r.code,
                    lead_time: r.lead || undefined,
                    description: r.desc,
                    quantity: parseFloat(r.qty) || 0,
                    unit_price: parseFloat(r.price) || 0,
                    line_total: (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0),
                    hs_code: r.hs || undefined,
                    weight_kg: r.kg ? parseFloat(r.kg) : undefined,
                })),
        };
    }

    async function handleSave() {
        setSaving(true);
        try {
            const payload = buildQuotePayload();
            if (quoteId === null) {
                const res = await fetch("/api/quotes", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Kaydetme başarısız");
                const data = await res.json() as QuoteDetail;
                setQuoteId(data.id);
                setQuoteNo(data.quoteNumber);
                window.history.replaceState(null, "", "/dashboard/quotes/" + data.id);
            } else {
                const res = await fetch("/api/quotes/" + quoteId, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });
                if (!res.ok) throw new Error("Güncelleme başarısız");
            }
            autoSave();
            showToast("Kaydedildi", "success");
        } catch {
            showToast("Kaydetme hatası", "error");
        } finally {
            setSaving(false);
        }
    }

    // ── Styles ───────────────────────────────────────────────────────────────
    const btn: React.CSSProperties = {
        display: "inline-flex", alignItems: "center", gap: "6px",
        padding: "5px 12px", fontSize: "12px", fontWeight: 500,
        border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
        background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
    };
    const fieldInput: React.CSSProperties = {
        background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)",
        borderRadius: "4px", padding: "5px 9px", fontSize: "12.5px",
        color: "var(--text-primary)", width: "100%",
    };
    const cellInput: React.CSSProperties = {
        background: "transparent", border: "0.5px solid transparent",
        borderRadius: "3px", padding: "5px 6px", fontSize: "12px",
        color: "var(--text-primary)", width: "100%",
    };
    const totalInput: React.CSSProperties = {
        background: "transparent", border: "0.5px solid transparent",
        borderRadius: "3px", padding: "5px 8px",
        fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px",
        color: "var(--text-primary)", width: "100%", textAlign: "right", fontWeight: 500,
    };
    const th: React.CSSProperties = {
        padding: "7px 8px", fontSize: "10px", fontWeight: 600,
        color: "white", textTransform: "uppercase", letterSpacing: "0.06em",
        border: "0.5px solid rgba(255,255,255,0.18)", background: "#0072BC",
        whiteSpace: "nowrap",
    };
    const tdBase: React.CSSProperties = {
        padding: "2px 4px",
        border: "0.5px solid var(--border-secondary)",
        verticalAlign: "middle",
    };
    const totalRowBg: React.CSSProperties = { background: "var(--bg-tertiary)" };
    const totalLabel: React.CSSProperties = {
        padding: "7px 8px", fontSize: "11px", fontWeight: 600,
        color: "var(--text-secondary)", textAlign: "right",
        border: "0.5px solid var(--border-secondary)",
    };

    // ── JSX ──────────────────────────────────────────────────────────────────
    return (
        <>
            {/* Injected CSS for hover + print */}
            <style dangerouslySetInnerHTML={{ __html: INJECTED_CSS }} />

            {/* Page wrapper */}
            <div style={{ padding: "0 0 80px" }}>

                {/* ── Action bar ── */}
                <div className="q-no-print" style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    marginBottom: "16px",
                }}>
                    {/* Breadcrumbs + badges */}
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12.5px", color: "var(--text-secondary)", flexWrap: "wrap" }}>
                        <span>Satış</span>
                        <span style={{ color: "var(--text-tertiary)" }}>/</span>
                        <span>Teklifler</span>
                        <span style={{ color: "var(--text-tertiary)" }}>/</span>
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                            {readOnly ? "Teklif Detay" : quoteId ? "Teklif Düzenle" : "Yeni Teklif"}
                        </span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", padding: "2px 8px", background: "var(--bg-tertiary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "3px", color: "var(--text-secondary)" }}>
                            {quoteNo || "(Otomatik)"}
                        </span>
                        {(() => {
                            const cfg: Record<string, { label: string; bg: string; color: string }> = {
                                draft:    { label: "Taslak",       bg: "var(--warning-bg)",  color: "var(--warning-text)"   },
                                sent:     { label: "Gönderildi",   bg: "var(--accent-bg)",   color: "var(--accent-text)"    },
                                accepted: { label: "Kabul Edildi", bg: "var(--success-bg)",  color: "var(--success-text)"   },
                                rejected: { label: "Reddedildi",   bg: "var(--danger-bg)",   color: "var(--danger-text)"    },
                                expired:  { label: "Süresi Doldu", bg: "var(--bg-tertiary)", color: "var(--text-secondary)" },
                            };
                            const b = cfg[status ?? "draft"] ?? cfg["draft"];
                            return (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "10.5px", fontWeight: 600, background: b.bg, color: b.color }}>
                                    <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                                    {b.label}
                                </span>
                            );
                        })()}
                    </div>
                    {/* Buttons */}
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button className="q-btn q-btn-primary" style={{ ...btn, background: "var(--accent-bg)", borderColor: "var(--accent-border)", color: "var(--accent-text)" }} onClick={() => { savePreviewData(); router.push("/dashboard/quotes/preview"); }}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6V2h8v4M4 11H3a1 1 0 01-1-1V7a1 1 0 011-1h10a1 1 0 011 1v3a1 1 0 01-1 1h-1M4 11v3h8v-3H4z" /><circle cx="12.5" cy="8.5" r=".5" fill="currentColor" /></svg>
                            Önizle &amp; PDF
                        </button>
                        {!readOnly && (
                        <button
                            className="q-btn"
                            style={{ ...btn, opacity: saving ? 0.6 : 1 }}
                            onClick={handleSave}
                            disabled={saving}
                        >
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 3l-2-2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3z" /><path d="M10 1v4H6V1M5 9h6" /></svg>
                            {saving ? "Kaydediliyor…" : "Kaydet"}
                        </button>
                        )}
                    </div>
                </div>

                {/* ── Form Card ── */}
                <div className="q-card" style={{
                    background: "var(--bg-primary)", border: "1px solid var(--border-secondary)",
                    ...(readOnly ? { pointerEvents: "none" as const } : {}),
                    borderRadius: "6px", overflow: "hidden", maxWidth: "1100px", margin: "0 auto",
                }}>

                    {/* ── Form Header: Logo + Seller info ── */}
                    <div className="q-form-header" style={{
                        display: "grid", gridTemplateColumns: "auto 1fr", gap: "28px",
                        padding: "24px 28px 22px", borderBottom: "1px solid var(--border-secondary)",
                        background: "rgba(0,114,188,0.04)", alignItems: "start",
                    }}>
                        {/* Logo */}
                        <div>
                            <input ref={logoFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoFile} />
                            <div className="q-logo-ph" title="Logo değiştir" onClick={() => logoFileRef.current?.click()} style={{
                                width: "120px", height: "120px",
                                border: "1.5px dashed var(--border-primary)", borderRadius: "12px",
                                display: "grid", placeItems: "center", cursor: "pointer",
                                overflow: "hidden", background: "white", flexShrink: 0,
                            }}>
                                {logoSrc
                                    // eslint-disable-next-line @next/next/no-img-element
                                    ? <img src={logoSrc} alt="logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                                    : <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9ca3b0" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></svg>
                                }
                            </div>
                        </div>

                        {/* Seller (PMT) info */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", paddingTop: "4px", minWidth: 0 }}>
                            <input
                                className="q-info-inp"
                                style={{ fontSize: "17px", fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.01em", textAlign: "right", background: "transparent", border: "none", borderBottom: "0.5px dashed var(--border-primary)", padding: "2px 4px", width: "100%" }}
                                value={sellerName}
                                onChange={e => setSellerName(e.target.value)}
                                placeholder="Firma Adı"
                            />
                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 18px" }}>
                                {([
                                    ["Tel",   sellerTel,   setSellerTel,   "+90 …"],
                                    ["Email", sellerEmail, setSellerEmail, "info@firma.com"],
                                    ["Adres", sellerAddr,  setSellerAddr,  "Adres…"],
                                    ["VKN",   sellerTaxId, setSellerTaxId, "123 456 7890"],
                                    ["Web",   sellerWeb,   setSellerWeb,   "www.firma.com.tr"],
                                ] as [string, string, React.Dispatch<React.SetStateAction<string>>, string][]).map(([key, val, set, ph]) => (
                                    <div key={key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                        <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", minWidth: "44px" }}>{key}</span>
                                        <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>:</span>
                                        <input
                                            className="q-info-inp"
                                            style={{ flex: 1, background: "transparent", border: "none", borderBottom: "0.5px dashed var(--border-primary)", padding: "2px 4px", fontSize: "12px", color: "var(--text-primary)" }}
                                            value={val} onChange={e => set(e.target.value)} placeholder={ph}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* ── Title Band ── */}
                    <div className="q-title-band" style={{
                        padding: "14px 28px", borderBottom: "1px solid var(--border-secondary)",
                        background: "var(--bg-primary)", textAlign: "center",
                    }}>
                        <div style={{ fontSize: "22px", fontWeight: 700, letterSpacing: "-0.01em" }}>
                            <span style={{ color: "#0072BC" }}>TEKLİF</span>
                            <span style={{ color: "rgba(0,114,188,0.35)", margin: "0 10px", fontWeight: 300 }}>|</span>
                            <span style={{ color: "#0072BC", fontStyle: "italic", fontWeight: 600 }}>QUOTATION</span>
                        </div>
                    </div>

                    {/* ── Meta Grid ── */}
                    <div className="q-meta-grid" style={{
                        display: "grid", gridTemplateColumns: "1fr 1fr",
                        borderBottom: "1px solid var(--border-secondary)",
                    }}>
                        {/* Left: Customer */}
                        <div className="q-meta-col" style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "9px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#0072BC", textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: "4px", borderBottom: "1px solid rgba(0,114,188,0.25)" }}>
                                Müşteri / Customer
                            </div>
                            {/* Company — autocomplete */}
                            <div ref={custWrapperRef} style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px", paddingBottom: "7px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                    Company <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontStyle: "normal", fontWeight: 400 }}>Firma Adı</span>
                                </div>
                                <div style={{ position: "relative" }}>
                                    <input
                                        className="q-field-inp"
                                        style={fieldInput}
                                        type="text"
                                        placeholder="Firma adını girin veya seçin…"
                                        value={custCompany}
                                        autoComplete="off"
                                        onChange={e => handleCustCompanyChange(e.target.value)}
                                        onFocus={() => { if (custSuggestions.length > 0) setCustDropdownOpen(true); }}
                                    />
                                    {custDropdownOpen && custSuggestions.length > 0 && (
                                        <div style={{
                                            position: "absolute", top: "100%", left: 0, right: 0, zIndex: 200,
                                            background: "var(--bg-secondary)",
                                            border: "0.5px solid var(--border-secondary)",
                                            borderRadius: "6px",
                                            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                                            maxHeight: "200px", overflowY: "auto",
                                            marginTop: "3px",
                                        }}>
                                            {custSuggestions.map(c => (
                                                <div
                                                    key={c.id}
                                                    className="q-cust-opt"
                                                    onMouseDown={e => { e.preventDefault(); handleSelectCustomer(c); }}
                                                    style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "0.5px solid var(--border-tertiary)" }}
                                                >
                                                    <div style={{ fontSize: "12.5px", color: "var(--text-primary)", fontWeight: 500 }}>{c.name}</div>
                                                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                                                        {[c.country, c.email].filter(Boolean).join(" · ")}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Contact, Phone, Email */}
                            {([
                                ["Contact",  "İrtibat Kişisi",  custContact, setCustContact, "Ad Soyad",           "text"],
                                ["Phone",    "Telefon",         custPhone,   setCustPhone,   "+90 532 …",          "text"],
                                ["Email",    "E-posta",         custEmail,   setCustEmail,   "ornek@firma.com",    "email"],
                            ] as [string, string, string, React.Dispatch<React.SetStateAction<string>>, string, string][])
                                .map(([en, tr, val, set, ph, type]) => (
                                    <div key={en} style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px", paddingBottom: "7px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                            {en} <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontStyle: "normal", fontWeight: 400 }}>{tr}</span>
                                        </div>
                                        <input
                                            className="q-field-inp"
                                            style={fieldInput}
                                            type={type} placeholder={ph} value={val}
                                            onChange={e => set(e.target.value)}
                                        />
                                    </div>
                                ))}
                        </div>

                        {/* Right: Quote details */}
                        <div className="q-meta-col" style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "9px", borderLeft: "1px solid var(--border-secondary)" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#0072BC", textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: "4px", borderBottom: "1px solid rgba(0,114,188,0.25)" }}>
                                Teklif Detayları / Quote Details
                            </div>
                            {/* Quote No — read-only, DB'de otomatik üretilir */}
                            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px", paddingBottom: "7px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                    Quote No <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontWeight: 400 }}>Teklif No</span>
                                </div>
                                <input
                                    className="q-field-inp"
                                    style={{ ...fieldInput, color: quoteNo ? "var(--text-primary)" : "var(--text-tertiary)", cursor: "default" }}
                                    type="text"
                                    value={quoteNo}
                                    placeholder="(Otomatik)"
                                    readOnly
                                />
                            </div>
                            {([
                                ["Sales Rep",  "Satış Temsilcisi", salesRep,   setSalesRep,   "Ad Soyad",             "text"],
                                ["Phone",      "Telefon",          salesPhone, setSalesPhone, "+90 …",                "text"],
                                ["Email",      "E-posta",          salesEmail, setSalesEmail, "temsilci@pmt.com.tr",  "email"],
                                ["Date",       "Tarih",            quoteDate,  setQuoteDate,  "",                     "date"],
                                ["Valid Until","Geçerlilik",       validUntil, setValidUntil, "",                     "date"],
                            ] as [string, string, string, React.Dispatch<React.SetStateAction<string>>, string, string][])
                                .map(([en, tr, val, set, ph, type]) => (
                                    <div key={en} style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px", paddingBottom: "7px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                            {en} <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontWeight: 400 }}>{tr}</span>
                                        </div>
                                        <input className="q-field-inp" style={fieldInput} type={type} placeholder={ph} value={val} onChange={e => set(e.target.value)} />
                                    </div>
                                ))}
                            {/* Currency */}
                            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px", paddingBottom: "7px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                    Currency <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontWeight: 400 }}>Para Birimi</span>
                                </div>
                                <select className="q-field-inp" style={fieldInput} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
                                    <option value="TRY">₺ TRY — Türk Lirası</option>
                                    <option value="USD">$ USD — US Dollar</option>
                                    <option value="EUR">€ EUR — Euro</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* ── Items Table ── */}
                    <div>
                        {/* Toolbar */}
                        <div className="q-table-toolbar" style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "10px 24px", borderBottom: "1px solid var(--border-secondary)",
                            background: "var(--bg-tertiary)",
                        }}>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Line Items <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontStyle: "italic" }}>/ Kalemler</span>
                            </div>
                            {!readOnly && (
                            <div className="q-no-print" style={{ display: "flex", gap: "6px" }}>
                                <button className="q-btn" style={btn} onClick={clearAll}>
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4l8 8M12 4l-8 8" /></svg>
                                    Temizle
                                </button>
                                <button className="q-btn q-btn-primary" style={{ ...btn, background: "var(--accent-bg)", borderColor: "var(--accent-border)", color: "var(--accent-text)" }} onClick={addRow}>
                                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
                                    Satır Ekle
                                </button>
                            </div>
                            )}
                        </div>

                        {/* Table */}
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--border-secondary)" }}>
                                <thead>
                                    <tr>
                                        <th className="q-th" style={{ ...th, width: "32px", textAlign: "center" }}>#</th>
                                        <th className="q-th" style={{ ...th, width: "90px" }}>Product Code<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Ürün Kodu</span></th>
                                        <th className="q-th" style={{ ...th, width: "90px" }}>Lead Time<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Teslim Süresi</span></th>
                                        <th className="q-th" style={th}>Description<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Ürün Açıklaması</span></th>
                                        <th className="q-th" style={{ ...th, width: "70px", textAlign: "center" }}>Qty<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Adet</span></th>
                                        <th className="q-th" style={{ ...th, width: "110px", textAlign: "right" }}>Unit Price<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Birim Fiyat</span></th>
                                        <th className="q-th" style={{ ...th, width: "115px", textAlign: "right" }}>Total Price<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Toplam Fiyat</span></th>
                                        <th className="q-th" style={{ ...th, width: "90px" }}>HS Code<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>GTİP Kodu</span></th>
                                        <th className="q-th" style={{ ...th, width: "70px", textAlign: "right" }}>Kg<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Ağırlık</span></th>
                                        <th className="q-th q-no-print" style={{ ...th, width: "28px" }} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, idx) => {
                                        const lt = lineTotal(row);
                                        return (
                                            <tr key={row.id}>
                                                {/* # */}
                                                <td style={{ ...tdBase, textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", color: "var(--text-tertiary)", width: "32px" }}>{idx + 1}</td>
                                                {/* Code — autocomplete */}
                                                <td style={{ ...tdBase, position: "relative" }} className="q-prod-cell">
                                                    <input
                                                        className="q-cell"
                                                        style={cellInput}
                                                        placeholder="KOD-001"
                                                        value={row.code}
                                                        autoComplete="off"
                                                        onChange={e => handleCodeChange(row.id, e.target.value)}
                                                        onFocus={() => {
                                                            if (prodSuggestions.length > 0 && prodOpenRowId === row.id)
                                                                setProdOpenRowId(row.id);
                                                        }}
                                                    />
                                                    {prodOpenRowId === row.id && prodSuggestions.length > 0 && (
                                                        <div className="q-prod-cell" style={{
                                                            position: "absolute", top: "100%", left: 0, zIndex: 200,
                                                            minWidth: "280px",
                                                            background: "var(--bg-secondary)",
                                                            border: "0.5px solid var(--border-secondary)",
                                                            borderRadius: "6px",
                                                            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                                                            maxHeight: "200px", overflowY: "auto",
                                                            marginTop: "3px",
                                                        }}>
                                                            {prodSuggestions.map(p => (
                                                                <div
                                                                    key={p.id}
                                                                    className="q-cust-opt"
                                                                    onMouseDown={e => { e.preventDefault(); handleSelectProduct(row.id, p); }}
                                                                    style={{ padding: "7px 12px", cursor: "pointer", borderBottom: "0.5px solid var(--border-tertiary)" }}
                                                                >
                                                                    <div style={{ fontSize: "11px", fontFamily: "'JetBrains Mono', monospace", color: "var(--accent-text)" }}>{p.sku}</div>
                                                                    <div style={{ fontSize: "12px", color: "var(--text-primary)", marginTop: "1px" }}>{p.name}</div>
                                                                    <div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                                                                        {p.currency} {fmt(p.price)} · {p.unit} · {p.category}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </td>
                                                {/* Lead */}
                                                <td style={tdBase}><input className="q-cell" style={cellInput} placeholder="30 gün" value={row.lead} onChange={e => updateRow(row.id, "lead", e.target.value)} /></td>
                                                {/* Desc */}
                                                <td style={tdBase}><input className="q-cell" style={cellInput} placeholder="Ürün açıklaması / Description" value={row.desc} onChange={e => updateRow(row.id, "desc", e.target.value)} /></td>
                                                {/* Qty */}
                                                <td style={tdBase}><input className="q-cell" style={{ ...cellInput, textAlign: "center" }} type="number" min="0" step="any" placeholder="0" value={row.qty} onChange={e => updateRow(row.id, "qty", e.target.value)} /></td>
                                                {/* Unit Price */}
                                                <td style={tdBase}><input className="q-cell" style={{ ...cellInput, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px" }} type="number" min="0" step="any" placeholder="0.00" value={row.price} onChange={e => updateRow(row.id, "price", e.target.value)} /></td>
                                                {/* Line Total */}
                                                <td className="q-computed" style={{ ...tdBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px", color: "var(--text-primary)", textAlign: "right", paddingRight: "8px", whiteSpace: "nowrap" }}>
                                                    {lt > 0 ? `${sym} ${fmt(lt)}` : "—"}
                                                </td>
                                                {/* HS Code */}
                                                <td style={tdBase}><input className="q-cell" style={cellInput} placeholder="8481.80" value={row.hs} onChange={e => updateRow(row.id, "hs", e.target.value)} /></td>
                                                {/* Kg */}
                                                <td style={tdBase}><input className="q-cell" style={{ ...cellInput, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px" }} type="number" min="0" step="any" placeholder="0.00" value={row.kg} onChange={e => updateRow(row.id, "kg", e.target.value)} /></td>
                                                {/* Delete */}
                                                {!readOnly && (
                                                <td style={{ ...tdBase, width: "28px", textAlign: "center", padding: "0 4px" }} className="q-no-print">
                                                    <button className="q-del-btn" style={{ width: "22px", height: "22px", borderRadius: "3px", display: "grid", placeItems: "center", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }} onClick={() => deleteRow(row.id)} title="Sil">
                                                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" /></svg>
                                                    </button>
                                                </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Add row button */}
                        {!readOnly && (
                        <button className="q-add-btn q-no-print" style={{
                            display: "flex", alignItems: "center", gap: "7px",
                            padding: "8px 24px", fontSize: "12px", color: "var(--text-tertiary)",
                            borderTop: "0.5px dashed var(--border-tertiary)", width: "100%",
                            background: "none", border: "none",
                            cursor: "pointer",
                        } as React.CSSProperties} onClick={addRow}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M8 3v10M3 8h10" /></svg>
                            Add line item / Yeni satır ekle
                        </button>
                        )}

                        {/* Totals */}
                        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid var(--border-secondary)", borderTop: "none" }}>
                            <tbody>
                                {/* Subtotal */}
                                <tr style={totalRowBg}>
                                    <td colSpan={6} className="q-total-label" style={totalLabel}>Subtotal / Ara Toplam</td>
                                    <td style={tdBase}>
                                        <input
                                            className="q-total-inp"
                                            style={totalInput}
                                            placeholder="—"
                                            value={subFocused ? subDisp : (effSub > 0 ? `${sym} ${fmt(effSub)}` : "")}
                                            onFocus={() => { setSubFocused(true); setSubDisp(effSub > 0 ? `${sym} ${fmt(effSub)}` : ""); }}
                                            onChange={e => {
                                                setSubDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvSub(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setSubFocused(false)}
                                        />
                                    </td>
                                    <td colSpan={2} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px", color: "var(--text-tertiary)", textAlign: "right", padding: "0 8px" }}>
                                        {compKg > 0 ? `${fmt(compKg)} kg` : "—"}
                                    </td>
                                    <td className="q-no-print" style={{ width: "28px", padding: "0 4px", textAlign: "center" }}>
                                        {ovSub !== null && <button style={{ width: "20px", height: "20px", borderRadius: "3px", display: "inline-grid", placeItems: "center", fontSize: "13px", color: "var(--warning-text)", background: "var(--warning-bg)", border: "none", cursor: "pointer" }} onClick={() => setOvSub(null)} title="Otomatik hesaplamaya dön">↻</button>}
                                    </td>
                                </tr>
                                {/* VAT */}
                                <tr style={totalRowBg}>
                                    <td colSpan={6} className="q-total-label" style={totalLabel}>
                                        VAT / KDV{" "}
                                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                            (<select className="q-vat-sel" value={vatRate} onChange={e => setVatRate(Number(e.target.value))} style={{ background: "transparent", border: "none", fontSize: "10px", color: "var(--text-tertiary)", cursor: "pointer", padding: 0 }}>
                                                <option value={0}>%0</option>
                                                <option value={10}>%10</option>
                                                <option value={20}>%20</option>
                                            </select>)
                                        </span>
                                    </td>
                                    <td style={tdBase}>
                                        <input
                                            className="q-total-inp"
                                            style={totalInput}
                                            placeholder="—"
                                            value={vatFocused ? vatDisp : (effVat > 0 ? `${sym} ${fmt(effVat)}` : "")}
                                            onFocus={() => { setVatFocused(true); setVatDisp(effVat > 0 ? `${sym} ${fmt(effVat)}` : ""); }}
                                            onChange={e => {
                                                setVatDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvVat(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setVatFocused(false)}
                                        />
                                    </td>
                                    <td colSpan={2} />
                                    <td className="q-no-print" style={{ width: "28px", padding: "0 4px", textAlign: "center" }}>
                                        {ovVat !== null && <button style={{ width: "20px", height: "20px", borderRadius: "3px", display: "inline-grid", placeItems: "center", fontSize: "13px", color: "var(--warning-text)", background: "var(--warning-bg)", border: "none", cursor: "pointer" }} onClick={() => setOvVat(null)} title="Otomatik hesaplamaya dön">↻</button>}
                                    </td>
                                </tr>
                                {/* Grand Total */}
                                <tr style={totalRowBg}>
                                    <td colSpan={6} style={{ ...totalLabel, fontWeight: 700, color: "var(--text-primary)" }}>GRAND TOTAL / Genel Toplam</td>
                                    <td style={tdBase}>
                                        <input
                                            className="q-total-inp q-grand-total-inp"
                                            style={{ ...totalInput, fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}
                                            placeholder="—"
                                            value={grandFocused ? grandDisp : (effGrand > 0 ? `${sym} ${fmt(effGrand)}` : "")}
                                            onFocus={() => { setGrandFocused(true); setGrandDisp(effGrand > 0 ? `${sym} ${fmt(effGrand)}` : ""); }}
                                            onChange={e => {
                                                setGrandDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvGrand(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setGrandFocused(false)}
                                        />
                                    </td>
                                    <td colSpan={2} />
                                    <td className="q-no-print" style={{ width: "28px", padding: "0 4px", textAlign: "center" }}>
                                        {ovGrand !== null && <button style={{ width: "20px", height: "20px", borderRadius: "3px", display: "inline-grid", placeItems: "center", fontSize: "13px", color: "var(--warning-text)", background: "var(--warning-bg)", border: "none", cursor: "pointer" }} onClick={() => setOvGrand(null)} title="Otomatik hesaplamaya dön">↻</button>}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* ── Notes ── */}
                    <div className="q-notes-block" style={{ padding: "16px 24px", borderTop: "1px solid var(--border-secondary)" }}>
                        <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                            Notes &amp; Terms <span style={{ fontStyle: "italic", fontWeight: 400, opacity: 0.6 }}>/ Notlar</span>
                        </div>
                        <textarea
                            className="q-notes"
                            style={{ width: "100%", background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", padding: "8px 10px", fontSize: "12px", color: "var(--text-primary)", resize: "vertical", minHeight: "80px", lineHeight: 1.6 }}
                            placeholder={"Ödeme koşulları, geçerlilik süresi, teslimat şartları vb.\nPayment terms, validity period, delivery conditions, etc."}
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                        />
                    </div>

                    {/* ── Signatures ── */}
                    <div className="q-sigs-block" style={{ padding: "16px 24px 28px", borderTop: "1px solid var(--border-secondary)" }}>
                        <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "12px" }}>
                            Signatures / İmzalar
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "32px" }}>
                            {([
                                ["Prepared by",  "Hazırlayan",  sig1, setSig1,  sig1Title, setSig1Title],
                                ["Approved by",  "Onay",        sig2, setSig2,  sig2Title, setSig2Title],
                                ["Manager Seal", "Mühür Onayı", sig3, setSig3,  sig3Title, setSig3Title],
                            ] as [string, string, string, React.Dispatch<React.SetStateAction<string>>, string, React.Dispatch<React.SetStateAction<string>>][]).map(([role, roleTr, val, set, titleVal, setTitle]) => (
                                <div key={role} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", letterSpacing: "-0.01em" }}>{role}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", fontStyle: "italic", marginBottom: "8px" }}>{roleTr}</div>
                                    <div className="q-sig-space" style={{ height: "56px", borderBottom: "0.5px solid var(--border-secondary)" }} />
                                    <input
                                        className="q-sig-name"
                                        style={{ background: "transparent", border: "none", borderBottom: "0.5px solid var(--border-tertiary)", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", padding: "4px 0", marginTop: "6px", width: "100%" }}
                                        placeholder="Ad Soyad / Name"
                                        value={val}
                                        onChange={e => set(e.target.value)}
                                    />
                                    <input
                                        className="q-sig-title"
                                        style={{ background: "transparent", border: "none", borderBottom: "0.5px solid var(--border-tertiary)", fontSize: "10.5px", color: "var(--text-secondary)", padding: "3px 0", width: "100%" }}
                                        placeholder="Unvan / Pozisyon"
                                        value={titleVal}
                                        onChange={e => setTitle(e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                </div>{/* /form-card */}
            </div>{/* /page-wrapper */}

            {/* ── Toast ── */}
            {toast && (
                <div style={{
                    position: "fixed", bottom: "70px", left: "50%", transform: "translateX(-50%)",
                    padding: "8px 18px", borderRadius: "6px", fontSize: "12px", fontWeight: 500,
                    zIndex: 9999, whiteSpace: "nowrap",
                    background: toast.type === "success" ? "var(--success-bg)" : "var(--danger-bg)",
                    color:      toast.type === "success" ? "var(--success-text)" : "var(--danger-text)",
                    border:    `0.5px solid ${toast.type === "success" ? "var(--success)" : "var(--danger)"}`,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                }}>
                    {toast.msg}
                </div>
            )}
        </>
    );
}
