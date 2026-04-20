"use client";

import { useState, useEffect, useRef, useCallback } from "react";

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
`;

// ── Component ─────────────────────────────────────────────────────────────────

export default function NewQuotePage() {
    // ── State ────────────────────────────────────────────────────────────────
    const [rows, setRows] = useState<QuoteRow[]>([]);
    const [nextId, setNextId] = useState(4);
    const [currency, setCurrency] = useState<Currency>("TRY");
    const [vatRate, setVatRate] = useState(20);
    const [logoSrc, setLogoSrc] = useState<string | null>(null);

    // Manual total overrides
    const [ovSub, setOvSub] = useState<number | null>(null);
    const [ovVat, setOvVat] = useState<number | null>(null);
    const [ovGrand, setOvGrand] = useState<number | null>(null);

    // Display strings for editable total inputs
    const [subDisp, setSubDisp] = useState("");
    const [vatDisp, setVatDisp] = useState("");
    const [grandDisp, setGrandDisp] = useState("");

    // Customer fields
    const [custCompany, setCustCompany] = useState("");
    const [custContact, setCustContact] = useState("");
    const [custPhone, setCustPhone] = useState("");
    const [custEmail, setCustEmail] = useState("");

    // Quote detail fields
    const [salesRep, setSalesRep] = useState("");
    const [salesPhone, setSalesPhone] = useState("");
    const [salesEmail, setSalesEmail] = useState("");
    const [quoteNo, setQuoteNo] = useState("TKL-2026-001");
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

    // Refs
    const logoFileRef = useRef<HTMLInputElement>(null);
    const subInputRef = useRef<HTMLInputElement>(null);
    const vatInputRef = useRef<HTMLInputElement>(null);
    const grandInputRef = useRef<HTMLInputElement>(null);

    // ── Computed ─────────────────────────────────────────────────────────────
    const sym = SYM[currency];
    const compSub = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
    const compKg  = rows.reduce((s, r) => s + (parseFloat(r.kg) || 0), 0);
    const effSub   = ovSub   !== null ? ovSub   : compSub;
    const effVat   = ovVat   !== null ? ovVat   : effSub * vatRate / 100;
    const effGrand = ovGrand !== null ? ovGrand : effSub + effVat;

    // ── Init ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        setQuoteDate(new Date().toISOString().slice(0, 10));
        try {
            const saved = JSON.parse(localStorage.getItem("teklif_v3") || "{}");
            if (saved.currency) setCurrency(saved.currency as Currency);
            if (saved.rows?.length) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setRows(saved.rows.map((r: any, i: number) => ({ ...r, id: i + 1 })));
                setNextId(saved.rows.length + 1);
            } else {
                setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
            }
        } catch {
            setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
        }
    }, []);

    // Sync total display strings (when not focused)
    useEffect(() => {
        if (document.activeElement !== subInputRef.current)
            setSubDisp(effSub > 0 ? `${sym} ${fmt(effSub)}` : "");
        if (document.activeElement !== vatInputRef.current)
            setVatDisp(effVat > 0 ? `${sym} ${fmt(effVat)}` : "");
        if (document.activeElement !== grandInputRef.current)
            setGrandDisp(effGrand > 0 ? `${sym} ${fmt(effGrand)}` : "");
    }, [effSub, effVat, effGrand, sym]);

    // Auto-save to localStorage
    const autoSave = useCallback(() => {
        try { localStorage.setItem("teklif_v3", JSON.stringify({ currency, rows })); } catch { /* noop */ }
    }, [currency, rows]);
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

    function handleSave()  { autoSave(); showToast("Taslak kaydedildi", "success"); }

    function lineTotal(r: QuoteRow) { return (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0); }

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
        borderBottom: "none", background: "#0072BC",
        whiteSpace: "nowrap",
    };
    const tdBase: React.CSSProperties = {
        padding: "2px 4px", borderBottom: "0.5px solid var(--border-tertiary)", verticalAlign: "middle",
    };
    const totalRowBg: React.CSSProperties = { background: "var(--bg-tertiary)" };
    const totalLabel: React.CSSProperties = {
        padding: "7px 8px", fontSize: "11px", fontWeight: 600,
        color: "var(--text-secondary)", textAlign: "right",
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
                        <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>Yeni Teklif</span>
                        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: "11px", padding: "2px 8px", background: "var(--bg-tertiary)", border: "0.5px solid var(--border-tertiary)", borderRadius: "3px", color: "var(--text-secondary)" }}>
                            {quoteNo || "TKL-???"}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "4px", fontSize: "10.5px", fontWeight: 600, background: "var(--warning-bg)", color: "var(--warning-text)" }}>
                            <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: "currentColor", display: "inline-block" }} />
                            Taslak
                        </span>
                    </div>
                    {/* Buttons */}
                    <div style={{ display: "flex", gap: "6px", flexShrink: 0 }}>
                        <button className="q-btn" style={btn} onClick={() => window.print()}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 6V2h8v4M4 11H3a1 1 0 01-1-1V7a1 1 0 011-1h10a1 1 0 011 1v3a1 1 0 01-1 1h-1M4 11v3h8v-3H4z" /><circle cx="12.5" cy="8.5" r=".5" fill="currentColor" /></svg>
                            Yazdır / PDF
                        </button>
                        <button className="q-btn" style={btn} onClick={handleSave}>
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 3l-2-2H3a1 1 0 00-1 1v10a1 1 0 001 1h10a1 1 0 001-1V3z" /><path d="M10 1v4H6V1M5 9h6" /></svg>
                            Kaydet
                        </button>
                    </div>
                </div>

                {/* ── Form Card ── */}
                <div className="q-card" style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", overflow: "hidden", maxWidth: "1100px", margin: "0 auto",
                }}>

                    {/* ── Form Header: Logo + Seller info ── */}
                    <div className="q-form-header" style={{
                        display: "grid", gridTemplateColumns: "auto 1fr", gap: "28px",
                        padding: "24px 28px 22px", borderBottom: "0.5px solid var(--border-tertiary)",
                        background: "var(--bg-tertiary)", alignItems: "start",
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
                        padding: "14px 28px", borderBottom: "0.5px solid var(--border-tertiary)",
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
                        borderBottom: "0.5px solid var(--border-tertiary)",
                    }}>
                        {/* Left: Customer */}
                        <div className="q-meta-col" style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#0072BC", textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: "4px", borderBottom: "1px solid rgba(0,114,188,0.25)" }}>
                                Müşteri / Customer
                            </div>
                            {([
                                ["Company",  "Firma Adı",       custCompany, setCustCompany, "Firma adını girin…", "text"],
                                ["Contact",  "İrtibat Kişisi",  custContact, setCustContact, "Ad Soyad",           "text"],
                                ["Phone",    "Telefon",         custPhone,   setCustPhone,   "+90 532 …",          "text"],
                                ["Email",    "E-posta",         custEmail,   setCustEmail,   "ornek@firma.com",    "email"],
                            ] as [string, string, string, React.Dispatch<React.SetStateAction<string>>, string, string][])
                                .map(([en, tr, val, set, ph, type]) => (
                                    <div key={en} style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px" }}>
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
                        <div className="q-meta-col" style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: "10px", borderLeft: "0.5px solid var(--border-tertiary)" }}>
                            <div style={{ fontSize: "10px", fontWeight: 700, color: "#0072BC", textTransform: "uppercase", letterSpacing: "0.07em", paddingBottom: "4px", borderBottom: "1px solid rgba(0,114,188,0.25)" }}>
                                Teklif Detayları / Quote Details
                            </div>
                            {([
                                ["Sales Rep",  "Satış Temsilcisi", salesRep,   setSalesRep,   "Ad Soyad",             "text"],
                                ["Phone",      "Telefon",          salesPhone, setSalesPhone, "+90 …",                "text"],
                                ["Email",      "E-posta",          salesEmail, setSalesEmail, "temsilci@pmt.com.tr",  "email"],
                                ["Quote No",   "Teklif No",        quoteNo,    setQuoteNo,    "TKL-2026-001",         "text"],
                                ["Date",       "Tarih",            quoteDate,  setQuoteDate,  "",                     "date"],
                                ["Valid Until","Geçerlilik",       validUntil, setValidUntil, "",                     "date"],
                            ] as [string, string, string, React.Dispatch<React.SetStateAction<string>>, string, string][])
                                .map(([en, tr, val, set, ph, type]) => (
                                    <div key={en} style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px" }}>
                                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                            {en} <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontWeight: 400 }}>{tr}</span>
                                        </div>
                                        <input className="q-field-inp" style={fieldInput} type={type} placeholder={ph} value={val} onChange={e => set(e.target.value)} />
                                    </div>
                                ))}
                            {/* Currency */}
                            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px" }}>
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
                            padding: "10px 24px", borderBottom: "0.5px solid var(--border-tertiary)",
                            background: "var(--bg-tertiary)",
                        }}>
                            <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                                Line Items <span style={{ color: "var(--text-tertiary)", fontWeight: 400, fontStyle: "italic" }}>/ Kalemler</span>
                            </div>
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
                        </div>

                        {/* Table */}
                        <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                                                {/* Code */}
                                                <td style={tdBase}><input className="q-cell" style={cellInput} placeholder="KOD-001" value={row.code} onChange={e => updateRow(row.id, "code", e.target.value)} /></td>
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
                                                <td style={{ ...tdBase, width: "28px", textAlign: "center", padding: "0 4px" }} className="q-no-print">
                                                    <button className="q-del-btn" style={{ width: "22px", height: "22px", borderRadius: "3px", display: "grid", placeItems: "center", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }} onClick={() => deleteRow(row.id)} title="Sil">
                                                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 4h10M6 4V2h4v2M5 4v9a1 1 0 001 1h4a1 1 0 001-1V4" /></svg>
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Add row button */}
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

                        {/* Totals */}
                        <table style={{ width: "100%", borderCollapse: "collapse", borderTop: "0.5px solid var(--border-tertiary)" }}>
                            <tbody>
                                {/* Subtotal */}
                                <tr style={totalRowBg}>
                                    <td colSpan={6} className="q-total-label" style={totalLabel}>Subtotal / Ara Toplam</td>
                                    <td style={tdBase}>
                                        <input
                                            ref={subInputRef}
                                            className="q-total-inp"
                                            style={totalInput}
                                            placeholder="—"
                                            value={subDisp}
                                            onChange={e => {
                                                setSubDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvSub(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setSubDisp(effSub > 0 ? `${sym} ${fmt(effSub)}` : "")}
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
                                            ref={vatInputRef}
                                            className="q-total-inp"
                                            style={totalInput}
                                            placeholder="—"
                                            value={vatDisp}
                                            onChange={e => {
                                                setVatDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvVat(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setVatDisp(effVat > 0 ? `${sym} ${fmt(effVat)}` : "")}
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
                                            ref={grandInputRef}
                                            className="q-total-inp q-grand-total-inp"
                                            style={{ ...totalInput, fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}
                                            placeholder="—"
                                            value={grandDisp}
                                            onChange={e => {
                                                setGrandDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvGrand(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setGrandDisp(effGrand > 0 ? `${sym} ${fmt(effGrand)}` : "")}
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
                    <div className="q-notes-block" style={{ padding: "16px 24px", borderTop: "0.5px solid var(--border-tertiary)" }}>
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
                    <div className="q-sigs-block" style={{ padding: "16px 24px 28px", borderTop: "0.5px solid var(--border-tertiary)" }}>
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
