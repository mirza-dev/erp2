"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { QuoteData } from "../components/quote-types";
import { useData } from "@/lib/data-context";
import type { Customer, Product, QuoteDetail } from "@/lib/mock-data";
import type { CreateQuoteInput } from "@/lib/supabase/quotes";
import type { QuoteStatus } from "@/lib/database.types";
import { buildQuoteLineDescription } from "@/lib/quote-description-builder";
import { findMissingHsLines } from "@/lib/quote-validation";
import { applyTemplateToField, templatesForField } from "@/lib/quote-note-templates";
import type { NoteTemplate, NoteTemplateKind } from "@/lib/mock-data";

// ── Types ──────────────────────────────────────────────────────────────────────

interface QuoteRow {
    id: number;
    // Faz 1b (V3-A4): autocomplete'ten seçilen ürünün id'si (gizli). "" = manuel
    // kod (kullanıcı listeden seçmedi) → payload'da null'a çevrilir.
    productId: string;
    code: string;
    lead: string;
    desc: string;
    qty: string;
    price: string;
    hs: string;
    kg: string;
    // Faz 4a (2026-05-23): PMT formunda "Ölçü / Size" kolonu (örn. "3/4''",
    // "DN50", "8\""). Serbest text; auto-build description Faz 4b'de gelir.
    size: string;
    // Faz 1b (V3-B5, V4-A7): birim ağırlık (master'dan) + KG manuel override.
    // unitWeightKg dolu & !kgManualOverride iken KG = qty × unitWeightKg recompute.
    unitWeightKg: string;
    kgManualOverride: boolean;
}

type Currency = "TRY" | "USD" | "EUR";
const SYM: Record<Currency, string> = { TRY: "₺", USD: "$", EUR: "€" };

function fmt(n: number) {
    return n.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function emptyRow(id: number): QuoteRow {
    return { id, productId: "", code: "", lead: "", desc: "", qty: "", price: "", hs: "", kg: "", size: "", unitWeightKg: "", kgManualOverride: false };
}

// Faz 1b: numeric(10,3) hedefi için 3 ondalığa yuvarla (float kalıntısını temizler).
const round3 = (n: number) => String(Math.round(n * 1000) / 1000);

// ── Injected styles (hover states + print) ────────────────────────────────────

const INJECTED_CSS = `
.q-del-btn { opacity: 0; transition: opacity .1s; }
tr:hover .q-del-btn { opacity: 1; }
.q-del-btn:hover { background: var(--danger-bg) !important; color: var(--danger-text) !important; }
.q-card table tbody tr:hover td { background: var(--bg-secondary) !important; }
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
.q-cust-opt:hover { background: var(--bg-secondary) !important; }
.q-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
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
    // Faz 4b (2026-05-25): per-row description manual-edit tracking. Set'te
    // bir rowId varsa handleSelectProduct desc auto-fill'i atlar (kullanıcı
    // override etti, ürün değişimi override'ı silmesin).
    const [descDirtyRowIds, setDescDirtyRowIds] = useState<Set<number>>(new Set());
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

    // Faz 3 (V7): header iskonto — doğrudan girilen değer (override paterni DEĞİL,
    // ↻/revert YOK). KDV matrahından düşülür: matrah = subtotal − discount.
    const [discount, setDiscount] = useState(0);
    const [discDisp, setDiscDisp] = useState("");
    const [discFocused, setDiscFocused] = useState(false);

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
    // Faz 1b (V4-A2): müşteri id (autocomplete'ten) + adres snapshot.
    const [custId, setCustId] = useState("");
    const [custAddress, setCustAddress] = useState("");

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
    // Faz 4a (2026-05-23): PMT brand teklif formunda "Teslimat Şekli" +
    // "Ödeme Şekli". Serbest text (örn. "İSTANBUL PMT DEPO TESLİMİ /
    // EXWORKS PMT İSTANBUL DEPO" / "%50 AVANS, %50 SEVKE HAZIR OLUNCA").
    const [deliveryMethod, setDeliveryMethod] = useState("");
    const [paymentMethod, setPaymentMethod] = useState("");
    const [notes, setNotes] = useState("");
    const [sig1, setSig1] = useState("");
    const [sig2, setSig2] = useState("");
    const [sig3, setSig3] = useState("");
    const [sig1Title, setSig1Title] = useState("");
    const [sig2Title, setSig2Title] = useState("");
    const [sig3Title, setSig3Title] = useState("");

    // Faz 7: not şablonları (picker). Read-only fetch — readOnly/demo'da da yüklenir,
    // picker render'ı readOnly'de gizlenir.
    const [noteTemplates, setNoteTemplates] = useState<NoteTemplate[]>([]);

    // Toast
    const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

    // Router
    const router = useRouter();

    // Faz 1b (V4-A3): satıcı snapshot ayraç'ı. Mevcut quote'ta sellerName dolu
    // ise → snapshot var → company_settings fetch ATLANIR (donmuş gösterim).
    // sellerName her zaman non-empty persist edilir; pre-1b quote'larda "" →
    // live fetch fallback (eski tekliflerde satıcı yine de görünür).
    const hasSellerSnapshot = !!initialData && (initialData.sellerName?.trim() ?? "") !== "";

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
    // Faz 2 (V3-A1): GTİP soft warn — ürün/fiyatı olan ama HS boş satırlar (non-blocking).
    const missingHsLines = findMissingHsLines(rows.map(r => ({
        product_id: r.productId || null,
        unit_price: parseFloat(r.price) || 0,
        quantity: parseFloat(r.qty) || 0,
        hs_code: r.hs,
    })));
    const effSub   = ovSub   !== null ? ovSub   : compSub;
    // Faz 3 (V7): iskonto KDV ÖNCESİ matrahtan düşülür (Türk fatura standardı).
    // 0 ≤ disc ≤ subtotal soft clamp (negatif/aşırı değer otomatik sınırlanır).
    const effDisc  = Math.min(Math.max(discount, 0), effSub);
    const effVat   = ovVat   !== null ? ovVat   : (effSub - effDisc) * vatRate / 100;
    const effGrand = ovGrand !== null ? ovGrand : (effSub - effDisc) + effVat;

    // ── Init ─────────────────────────────────────────────────────────────────
    useEffect(() => {
        if (initialData) {
            // DB'den yüklenen veri ile hydrate et
            setQuoteDate(initialData.quoteDate ?? new Date().toISOString().slice(0, 10));
            setValidUntil(initialData.validUntil ?? "");
            setQuoteNo(initialData.quoteNumber);
            setCurrency(initialData.currency as Currency);
            setVatRate(initialData.vatRate);
            // Faz 3 (V7) KRİTİK: iskonto hydrate — atlanırsa iskontolu mevcut
            // teklif edit+kaydet'te sessizce 0'a düşer ve grand_total değişir.
            setDiscount(initialData.discountAmount ?? 0);
            setCustCompany(initialData.customerName);
            setCustContact(initialData.customerContact);
            setCustPhone(initialData.customerPhone);
            setCustEmail(initialData.customerEmail);
            // Faz 1b (V4-A2): müşteri id + adres hydrate
            setCustId(initialData.customerId ?? "");
            setCustAddress(initialData.customerAddress);
            setSalesRep(initialData.salesRep);
            setSalesPhone(initialData.salesPhone);
            setSalesEmail(initialData.salesEmail);
            setNotes(initialData.notes);
            // Faz 4a: yeni alanları DB'den hydrate et (eski quote'larda boş string)
            setDeliveryMethod(initialData.deliveryMethod);
            setPaymentMethod(initialData.paymentMethod);
            setSig1(initialData.sigPrepared);
            setSig2(initialData.sigApproved);
            setSig3(initialData.sigManager);
            // Faz 1b (V4-A3): satıcı snapshot hydrate. sellerName boşsa "PMT…"
            // default'a düş; snapshot'sız eski quote'ta company effect doldurur.
            setSellerName(initialData.sellerName || "PMT Endüstri A.Ş.");
            setSellerTel(initialData.sellerPhone);
            setSellerEmail(initialData.sellerEmail);
            setSellerAddr(initialData.sellerAddress);
            setSellerTaxId(initialData.sellerTaxId);
            setSellerWeb(initialData.sellerWebsite);
            if (initialData.sellerLogoUrl) setLogoSrc(initialData.sellerLogoUrl);
            if (initialData.lines.length > 0) {
                const mapped = initialData.lines.map((l, i) => ({
                    id: i + 1,
                    // Faz 1b (V3-A4, V3-B5, V4-A7): productId + birim ağırlık + override hydrate
                    productId: l.productId ?? "",
                    code: l.productCode,
                    lead: l.leadTime,
                    desc: l.description,
                    qty: l.quantity > 0 ? String(l.quantity) : "",
                    price: l.unitPrice > 0 ? String(l.unitPrice) : "",
                    hs: l.hsCode,
                    kg: l.weightKg !== null ? String(l.weightKg) : "",
                    size: l.sizeText,
                    unitWeightKg: l.unitWeightKg !== null ? String(l.unitWeightKg) : "",
                    kgManualOverride: l.kgManualOverride,
                }));
                setRows(mapped);
                setNextId(initialData.lines.length + 1);
                // Faz 4b: DB'den yüklenen description'ları user-edited say;
                // ürün değiştirilse bile auto-build override etmesin.
                setDescDirtyRowIds(new Set(mapped.map(r => r.id)));
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
                // Faz 3 (V7) review: iskonto restore — kaydetmeden refresh'te 0'a düşmesin.
                if (typeof saved.discount === "number") setDiscount(saved.discount);
                if (saved.rows?.length) {
                    // Faz 1b: eski localStorage payload'ında yeni alanlar (productId,
                    // unitWeightKg, kgManualOverride) yok → emptyRow default'larıyla
                    // merge et (undefined alan tuzağını önler).
                    const restored: QuoteRow[] = saved.rows.map((r: QuoteRow, i: number) => ({ ...emptyRow(i + 1), ...r, id: i + 1 }));
                    setRows(restored);
                    setNextId(saved.rows.length + 1);
                    // Faz 4b Review P2-B: saved.descDirty index-aligned boolean[]
                    // varsa kullan (gerçek user-edit ayrımı). Yoksa eski payload
                    // — geriye uyumlu fallback: non-empty desc → dirty.
                    const dirtyIds = new Set<number>();
                    if (Array.isArray(saved.descDirty)) {
                        restored.forEach((r, i) => {
                            if (saved.descDirty[i]) dirtyIds.add(r.id);
                        });
                    } else {
                        restored.forEach(r => {
                            if (r.desc.trim().length > 0) dirtyIds.add(r.id);
                        });
                    }
                    setDescDirtyRowIds(dirtyIds);
                } else {
                    setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
                }
            } catch {
                setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Firma ayarlarını çek — yeni teklif / snapshot'sız eski quote'ta company_settings'ten gelir.
    // Faz 1b (V4-A3): snapshot'lı quote'ta ATLA — satıcı bilgisi donmuş gösterilir
    // (company_settings sonradan değişse bile teklif değişmez).
    useEffect(() => {
        if (hasSellerSnapshot) return;
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
    }, [hasSellerSnapshot]);

    // ── Customer autocomplete ─────────────────────────────────────────────────
    const handleCustCompanyChange = (value: string) => {
        setCustCompany(value);
        // Faz 1b (V4-A2): manuel firma yazımı → seçili müşteri id bütünlüğü bozulur,
        // id temizlenir (kullanıcı listeden seçmediyse customer_id null kalır).
        setCustId("");
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
        // Faz 1b (V4-A2): müşteri id + adres yakala
        setCustId(c.id);
        setCustAddress(c.address || "");
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

    // Faz 7: not şablonlarını yükle (fetch-in-effect proje konvansiyonu; cancelled guard).
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const res = await fetch("/api/note-templates");
                if (!res.ok) return;
                const data = (await res.json()) as NoteTemplate[];
                if (!cancelled) setNoteTemplates(data);
            } catch {
                // sessiz: picker olmadan da form çalışır
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Product autocomplete ──────────────────────────────────────────────────
    const handleCodeChange = (rowId: number, value: string) => {
        updateRow(rowId, "code", value);
        // Faz 1b (V3-A4): manuel kod yazımı → artık seçili ürün değil, productId temizle.
        updateRow(rowId, "productId", "");
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
        // Faz 4b: auto-build description PMT şablonuyla (Vana-merkezli, non-Vana
        // ürünlerde graceful degrade). Override edilmiş satırı silmemek için
        // descDirtyRowIds guard'ı. Helper boş dönerse defansif olarak p.name.
        if (!descDirtyRowIds.has(rowId)) {
            updateRow(rowId, "desc", buildQuoteLineDescription(p) || p.name);
        }
        updateRow(rowId, "price", p.currency === currency ? String(p.price) : "");
        // Faz 1b (V3-A4): seçili ürünün gizli id'si
        updateRow(rowId, "productId", p.id);
        // Faz 1b (V4-B3): GTİP + ölçü master'dan auto-fill (boşsa boş dolar — dormant)
        updateRow(rowId, "hs", p.hsCode ?? "");
        updateRow(rowId, "size", p.sizeText ?? "");
        // Faz 1b (V3-B5/V4-A7): birim ağırlık + KG recompute. Yeni ürün seçimi
        // override'ı sıfırlar; KG = qty × birim ağırlık (qty 0 ise temizlenir,
        // ağırlıksız üründe KG temizlenir — eski ürün KG'si taşınmaz).
        const unit = p.weightKg != null ? p.weightKg : null;
        const qtyN = parseFloat(rows.find(r => r.id === rowId)?.qty ?? "") || 0;
        const patch: Partial<QuoteRow> = {
            unitWeightKg: unit != null ? String(unit) : "",
            kgManualOverride: false,
            // kg her durumda set edilir: unit+qty varsa recompute, yoksa temizle.
            // (Önceki "if (unit != null)" koşulu ağırlıksız üründe eski KG'yi
            //  satırda bırakıyordu → yanlış weight_kg persist; P1 fix.)
            kg: unit != null && qtyN > 0 ? round3(qtyN * unit) : "",
        };
        patchRow(rowId, patch);
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
            // Faz 4b Review P2-B: descDirty boolean[] index-aligned persist.
            // Refresh sonrası "auto-generated vs user-edited" ayrımı korunur;
            // yoksa restore'da tüm non-empty desc'ler dirty kabul edilir ve
            // auto-build override edilemez hale gelir (yanlış ürün açıklaması).
            const descDirty = rows.map(r => descDirtyRowIds.has(r.id));
            localStorage.setItem("teklif_v3", JSON.stringify({ currency, rows, descDirty, discount }));
            const fullData: QuoteData = {
                sellerName, sellerTel, sellerEmail, sellerAddr, sellerTaxId, sellerWeb, logoSrc,
                custCompany, custContact, custPhone, custEmail, custAddress,
                quoteNo, quoteDate, validUntil, salesRep, salesPhone, salesEmail,
                currency, vatRate, rows,
                subtotal: ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0),
                // Faz 3 (V7): header iskonto (0 ≤ disc ≤ subtotal clamp); KDV öncesi matrahtan düşülür.
                discountAmount: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    return Math.min(Math.max(discount, 0), sub);
                })(),
                vatTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    const disc = Math.min(Math.max(discount, 0), sub);
                    return ovVat !== null ? ovVat : (sub - disc) * vatRate / 100;
                })(),
                grandTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    const disc = Math.min(Math.max(discount, 0), sub);
                    const vat = ovVat !== null ? ovVat : (sub - disc) * vatRate / 100;
                    return ovGrand !== null ? ovGrand : (sub - disc) + vat;
                })(),
                totalKg: rows.reduce((s, r) => s + (parseFloat(r.kg) || 0), 0),
                notes,
                // Faz 4a Review: preview/PDF kontratına PMT brand alanları
                deliveryMethod,
                paymentMethod,
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
        custCompany, custContact, custPhone, custEmail, custAddress, quoteNo, quoteDate, validUntil,
        salesRep, salesPhone, salesEmail, vatRate, ovSub, ovVat, ovGrand, discount,
        notes, deliveryMethod, paymentMethod, sig1, sig1Title, sig2, sig2Title, sig3, sig3Title,
        descDirtyRowIds]);

    // Saves preview data regardless of readOnly — used by preview button.
    // Does NOT write teklif_v3 (draft key) to avoid polluting the new-quote draft restore.
    const savePreviewData = useCallback(() => {
        try {
            const fullData: QuoteData = {
                sellerName, sellerTel, sellerEmail, sellerAddr, sellerTaxId, sellerWeb, logoSrc,
                custCompany, custContact, custPhone, custEmail, custAddress,
                quoteNo, quoteDate, validUntil, salesRep, salesPhone, salesEmail,
                currency, vatRate, rows,
                subtotal: ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0),
                // Faz 3 (V7): header iskonto (0 ≤ disc ≤ subtotal clamp); KDV öncesi matrahtan düşülür.
                discountAmount: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    return Math.min(Math.max(discount, 0), sub);
                })(),
                vatTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    const disc = Math.min(Math.max(discount, 0), sub);
                    return ovVat !== null ? ovVat : (sub - disc) * vatRate / 100;
                })(),
                grandTotal: (() => {
                    const sub = ovSub !== null ? ovSub : rows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
                    const disc = Math.min(Math.max(discount, 0), sub);
                    const vat = ovVat !== null ? ovVat : (sub - disc) * vatRate / 100;
                    return ovGrand !== null ? ovGrand : (sub - disc) + vat;
                })(),
                totalKg: rows.reduce((s, r) => s + (parseFloat(r.kg) || 0), 0),
                notes,
                // Faz 4a Review: preview/PDF kontratına PMT brand alanları
                deliveryMethod,
                paymentMethod,
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
        custCompany, custContact, custPhone, custEmail, custAddress, quoteNo, quoteDate, validUntil,
        salesRep, salesPhone, salesEmail, vatRate, ovSub, ovVat, ovGrand, discount,
        notes, deliveryMethod, paymentMethod, sig1, sig1Title, sig2, sig2Title, sig3, sig3Title]);

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
    // Faz 1b: çok-alanlı / boolean güncelleme (updateRow string-only kalır).
    function patchRow(id: number, patch: Partial<QuoteRow>) {
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    }
    // Faz 1b (V3-B5): qty değişince KG recompute (override yoksa & birim ağırlık varsa).
    function handleQtyChange(rowId: number, value: string) {
        setRows(prev => prev.map(r => {
            if (r.id !== rowId) return r;
            const next = { ...r, qty: value };
            if (!r.kgManualOverride && r.unitWeightKg) {
                const q = parseFloat(value) || 0;
                const u = parseFloat(r.unitWeightKg) || 0;
                next.kg = q > 0 && u > 0 ? round3(q * u) : "";
            }
            return next;
        }));
    }
    // Faz 1b (V4-A7): KG elle değişince override flag açılır → recompute durur.
    function handleKgChange(rowId: number, value: string) {
        patchRow(rowId, { kg: value, kgManualOverride: true });
    }
    function clearAll() {
        if (!confirm("Tüm satırlar silinecek. Devam edilsin mi?")) return;
        setRows([emptyRow(1), emptyRow(2), emptyRow(3)]);
        setNextId(4);
        // Faz 4b Review P2-A: dirty Set'i de sıfırla — eski rowId'ler (1,2,3)
        // Set'te kalırsa yeni boş satırlara ürün seçildiğinde auto-build
        // atlanır (kullanıcı temizledi → "her şey baştan" beklentisi).
        setDescDirtyRowIds(new Set());
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
            // Faz 1b (V4-A2): müşteri id + adres
            customer_id: custId || null,
            customer_address: custAddress || undefined,
            // Faz 1b (V4-A3): satıcı snapshot (kaydetme anında dondurulur)
            seller_name: sellerName || undefined,
            seller_phone: sellerTel || undefined,
            seller_email: sellerEmail || undefined,
            seller_address: sellerAddr || undefined,
            seller_tax_id: sellerTaxId || undefined,
            seller_website: sellerWeb || undefined,
            seller_logo_url: logoSrc || undefined,
            sales_rep: salesRep || undefined,
            sales_phone: salesPhone || undefined,
            sales_email: salesEmail || undefined,
            currency,
            vat_rate: vatRate,
            subtotal: effSub,
            vat_total: effVat,
            grand_total: effGrand,
            // Faz 3 (V7): subtotal iskonto-öncesi kalır; iskonto ayrı; grand iskonto-dahil.
            discount_amount: effDisc,
            notes: notes || undefined,
            sig_prepared: sig1 || undefined,
            sig_approved: sig2 || undefined,
            sig_manager: sig3 || undefined,
            quote_date: quoteDate || undefined,
            valid_until: validUntil || undefined,
            // Faz 4a (2026-05-23): PMT brand alanları payload'a dahil
            delivery_method: deliveryMethod || undefined,
            payment_method: paymentMethod || undefined,
            lines: rows
                .filter(r => r.code.trim() || r.desc.trim())
                .map((r, i) => ({
                    position: i + 1,
                    // Faz 1b (V3-A4): seçili ürün id (manuel kodda null)
                    product_id: r.productId || null,
                    product_code: r.code,
                    lead_time: r.lead || undefined,
                    description: r.desc,
                    quantity: parseFloat(r.qty) || 0,
                    unit_price: parseFloat(r.price) || 0,
                    line_total: (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0),
                    hs_code: r.hs || undefined,
                    weight_kg: r.kg ? parseFloat(r.kg) : undefined,
                    size_text: r.size || undefined,
                    // Faz 1b (V3-B5/V4-A7): birim ağırlık + KG manuel override
                    unit_weight_kg: r.unitWeightKg ? parseFloat(r.unitWeightKg) : undefined,
                    kg_manual_override: r.kgManualOverride,
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

    // Faz 7: not şablonu picker'ı. readOnly'de veya ilgili kind'da şablon yoksa
    // render edilmez. Seçim → applyTemplateToField (boş→doldur, dolu→append).
    function renderTemplatePicker(
        fieldKind: Exclude<NoteTemplateKind, "general">,
        current: string,
        setter: (v: string) => void,
    ) {
        if (readOnly) return null;
        const opts = templatesForField(noteTemplates, fieldKind);
        if (opts.length === 0) return null;
        return (
            <select
                className="q-no-print"
                aria-label={`${fieldKind} için not şablonu ekle`}
                value=""
                onChange={(e) => {
                    const tpl = opts.find((t) => t.id === e.target.value);
                    if (tpl) setter(applyTemplateToField(current, tpl.body));
                    e.target.value = "";
                }}
                style={{
                    fontSize: "11px", padding: "3px 6px", borderRadius: "4px",
                    border: "0.5px solid var(--border-secondary)", background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)", cursor: "pointer", marginBottom: "6px",
                }}
            >
                <option value="">+ Şablon ekle…</option>
                {opts.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                ))}
            </select>
        );
    }

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

                {/* Faz 2 (V3-A1): GTİP soft uyarı — non-blocking, hiçbir butonu disable etmez */}
                {!readOnly && missingHsLines.length > 0 && (
                    <div
                        role="status"
                        style={{
                            display: "flex", alignItems: "center", gap: "8px",
                            padding: "7px 12px", margin: "0 0 10px",
                            fontSize: "12px", color: "var(--warning-text)",
                            background: "var(--warning-bg)",
                            border: "0.5px solid var(--warning-border)", borderRadius: "6px",
                        }}
                    >
                        <span aria-hidden="true">⚠</span>
                        <span>{missingHsLines.length} satırda GTİP kodu eksik (öneri — gönderimi engellemez).</span>
                    </div>
                )}

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
                            <input ref={logoFileRef} type="file" accept="image/*" aria-label="Logo dosyası seç" style={{ display: "none" }} onChange={handleLogoFile} />
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
                                aria-label="Satıcı firma adı"
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
                                            aria-label={`Satıcı ${key}`}
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
                                        aria-label="Müşteri firma adı"
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

                            {/* Contact, Phone, Email, Address (Faz 1b V4-A2) */}
                            {([
                                ["Contact",  "İrtibat Kişisi",  custContact, setCustContact, "Ad Soyad",           "text"],
                                ["Phone",    "Telefon",         custPhone,   setCustPhone,   "+90 532 …",          "text"],
                                ["Email",    "E-posta",         custEmail,   setCustEmail,   "ornek@firma.com",    "email"],
                                ["Address",  "Adres",           custAddress, setCustAddress, "Müşteri adresi…",    "text"],
                            ] as [string, string, string, React.Dispatch<React.SetStateAction<string>>, string, string][])
                                .map(([en, tr, val, set, ph, type]) => (
                                    <div key={en} style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px", paddingBottom: "7px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                        <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                            {en} <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontStyle: "normal", fontWeight: 400 }}>{tr}</span>
                                        </div>
                                        <input
                                            className="q-field-inp"
                                            aria-label={`${en} (${tr})`}
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
                                    aria-label="Teklif no"
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
                                        <input className="q-field-inp" aria-label={`${en} (${tr})`} style={fieldInput} type={type} placeholder={ph} value={val} onChange={e => set(e.target.value)} />
                                    </div>
                                ))}
                            {/* Currency */}
                            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", alignItems: "center", gap: "8px", paddingBottom: "7px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                <div style={{ fontSize: "10px", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                                    Currency <span style={{ fontSize: "9px", color: "var(--text-tertiary)", display: "block", fontWeight: 400 }}>Para Birimi</span>
                                </div>
                                <select className="q-field-inp" aria-label="Para birimi" style={fieldInput} value={currency} onChange={e => setCurrency(e.target.value as Currency)}>
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
                                        {/* Faz 4a (2026-05-23): PMT brand "Ölçü / Size" kolonu */}
                                        <th className="q-th" style={{ ...th, width: "70px" }}>Size<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Ölçü</span></th>
                                        <th className="q-th" style={th}>Description<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Ürün Açıklaması</span></th>
                                        <th className="q-th" style={{ ...th, width: "70px", textAlign: "center" }}>Qty<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Adet</span></th>
                                        <th className="q-th" style={{ ...th, width: "110px", textAlign: "right" }}>Unit Price<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Birim Fiyat</span></th>
                                        <th className="q-th" style={{ ...th, width: "115px", textAlign: "right" }}>Total Price<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Toplam Fiyat</span></th>
                                        <th className="q-th" style={{ ...th, width: "90px" }}>HS Code<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>GTİP Kodu</span></th>
                                        <th className="q-th" style={{ ...th, width: "70px", textAlign: "right" }}>Kg<span style={{ display: "block", fontSize: "9px", opacity: .55, fontStyle: "italic", textTransform: "none", letterSpacing: 0, fontWeight: 400, marginTop: "1px" }}>Ağırlık</span></th>
                                        <th className="q-th q-no-print" style={{ ...th, width: "28px" }}>
                                            <span className="q-sr-only">İşlemler</span>
                                        </th>
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
                                                        aria-label={`Satır ${idx + 1} ürün kodu`}
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
                                                <td style={tdBase}><input className="q-cell" aria-label={`Satır ${idx + 1} teslim süresi`} style={cellInput} placeholder="30 gün" value={row.lead} onChange={e => updateRow(row.id, "lead", e.target.value)} /></td>
                                                {/* Faz 4a: Size (PMT brand "Ölçü") */}
                                                <td style={tdBase}><input className="q-cell" style={cellInput} placeholder={`3/4'' / DN50`} value={row.size} onChange={e => updateRow(row.id, "size", e.target.value)} aria-label={`Satır ${idx + 1} ölçü`} /></td>
                                                {/* Desc */}
                                                <td style={tdBase}><input className="q-cell" aria-label={`Satır ${idx + 1} açıklama`} style={cellInput} placeholder="Ürün açıklaması / Description" value={row.desc} onChange={e => {
                                                    updateRow(row.id, "desc", e.target.value);
                                                    // Faz 4b: ilk manuel düzenleme dirty Set'e ekler;
                                                    // sonraki product select desc'i override etmez.
                                                    setDescDirtyRowIds(prev => prev.has(row.id) ? prev : new Set(prev).add(row.id));
                                                }} /></td>
                                                {/* Qty */}
                                                <td style={tdBase}><input className="q-cell" aria-label={`Satır ${idx + 1} adet`} style={{ ...cellInput, textAlign: "center" }} type="number" min="1" step="1" placeholder="0" value={row.qty} onChange={e => handleQtyChange(row.id, e.target.value)} /></td>
                                                {/* Unit Price */}
                                                <td style={tdBase}><input className="q-cell" aria-label={`Satır ${idx + 1} birim fiyat`} style={{ ...cellInput, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px" }} type="number" min="0" step="any" placeholder="0.00" value={row.price} onChange={e => updateRow(row.id, "price", e.target.value)} /></td>
                                                {/* Line Total */}
                                                <td className="q-computed" style={{ ...tdBase, fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px", color: "var(--text-primary)", textAlign: "right", paddingRight: "8px", whiteSpace: "nowrap" }}>
                                                    {lt > 0 ? `${sym} ${fmt(lt)}` : "—"}
                                                </td>
                                                {/* HS Code */}
                                                <td style={tdBase}><input className="q-cell" aria-label={`Satır ${idx + 1} GTİP kodu`} style={cellInput} placeholder="8481.80" value={row.hs} onChange={e => updateRow(row.id, "hs", e.target.value)} /></td>
                                                {/* Kg */}
                                                <td style={tdBase}><input className="q-cell" aria-label={`Satır ${idx + 1} ağırlık (kg)`} style={{ ...cellInput, textAlign: "right", fontFamily: "'JetBrains Mono', monospace", fontSize: "11.5px" }} type="number" min="0" step="any" placeholder="0.00" value={row.kg} onChange={e => handleKgChange(row.id, e.target.value)} /></td>
                                                {/* Delete */}
                                                {!readOnly && (
                                                <td style={{ ...tdBase, width: "28px", textAlign: "center", padding: "0 4px" }} className="q-no-print">
                                                    <button type="button" aria-label={`Satır ${idx + 1} sil`} className="q-del-btn" style={{ width: "22px", height: "22px", borderRadius: "3px", display: "grid", placeItems: "center", color: "var(--text-tertiary)", background: "none", border: "none", cursor: "pointer" }} onClick={() => deleteRow(row.id)} title="Sil">
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
                                            aria-label="Ara toplam"
                                            style={totalInput}
                                            placeholder="—"
                                            value={subFocused ? subDisp : (effSub > 0 ? `${sym} ${fmt(effSub)}` : "")}
                                            onFocus={() => { setSubFocused(true); setSubDisp(effSub > 0 ? String(Math.round(effSub * 100) / 100) : ""); }}
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
                                        {ovSub !== null && <button type="button" aria-label="Ara toplamı otomatik hesaplamaya döndür" style={{ width: "20px", height: "20px", borderRadius: "3px", display: "inline-grid", placeItems: "center", fontSize: "13px", color: "var(--warning-text)", background: "var(--warning-bg)", border: "none", cursor: "pointer" }} onClick={() => setOvSub(null)} title="Otomatik hesaplamaya dön">↻</button>}
                                    </td>
                                </tr>
                                {/* Faz 3 (V7): İskonto — doğrudan giriş, ↻ revert YOK */}
                                <tr style={totalRowBg}>
                                    <td colSpan={6} className="q-total-label" style={totalLabel}>Discount / İskonto</td>
                                    <td style={tdBase}>
                                        <input
                                            className="q-total-inp"
                                            aria-label="İskonto"
                                            style={totalInput}
                                            placeholder="—"
                                            value={discFocused ? discDisp : (effDisc > 0 ? `${sym} ${fmt(effDisc)}` : "")}
                                            onFocus={() => { setDiscFocused(true); setDiscDisp(effDisc > 0 ? String(Math.round(effDisc * 100) / 100) : ""); }}
                                            onChange={e => {
                                                setDiscDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setDiscount(isNaN(v) ? 0 : v);
                                            }}
                                            onBlur={() => setDiscFocused(false)}
                                        />
                                    </td>
                                    <td colSpan={2}>&nbsp;</td>
                                    <td className="q-no-print" style={{ width: "28px", padding: "0 4px" }}>&nbsp;</td>
                                </tr>
                                {/* VAT */}
                                <tr style={totalRowBg}>
                                    <td colSpan={6} className="q-total-label" style={totalLabel}>
                                        VAT / KDV{" "}
                                        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>
                                            (<select className="q-vat-sel" aria-label="KDV oranı" value={vatRate} onChange={e => setVatRate(Number(e.target.value))} style={{ background: "transparent", border: "none", fontSize: "10px", color: "var(--text-tertiary)", cursor: "pointer", padding: 0 }}>
                                                <option value={0}>%0</option>
                                                <option value={10}>%10</option>
                                                <option value={20}>%20</option>
                                            </select>)
                                        </span>
                                    </td>
                                    <td style={tdBase}>
                                        <input
                                            className="q-total-inp"
                                            aria-label="KDV tutarı"
                                            style={totalInput}
                                            placeholder="—"
                                            value={vatFocused ? vatDisp : (effVat > 0 ? `${sym} ${fmt(effVat)}` : "")}
                                            onFocus={() => { setVatFocused(true); setVatDisp(effVat > 0 ? String(Math.round(effVat * 100) / 100) : ""); }}
                                            onChange={e => {
                                                setVatDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvVat(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setVatFocused(false)}
                                        />
                                    </td>
                                    <td colSpan={2}>&nbsp;</td>
                                    <td className="q-no-print" style={{ width: "28px", padding: "0 4px", textAlign: "center" }}>
                                        {ovVat !== null && <button type="button" aria-label="KDV'yi otomatik hesaplamaya döndür" style={{ width: "20px", height: "20px", borderRadius: "3px", display: "inline-grid", placeItems: "center", fontSize: "13px", color: "var(--warning-text)", background: "var(--warning-bg)", border: "none", cursor: "pointer" }} onClick={() => setOvVat(null)} title="Otomatik hesaplamaya dön">↻</button>}
                                    </td>
                                </tr>
                                {/* Grand Total */}
                                <tr style={totalRowBg}>
                                    <td colSpan={6} style={{ ...totalLabel, fontWeight: 700, color: "var(--text-primary)" }}>GRAND TOTAL / Genel Toplam</td>
                                    <td style={tdBase}>
                                        <input
                                            className="q-total-inp q-grand-total-inp"
                                            aria-label="Genel toplam"
                                            style={{ ...totalInput, fontSize: "13px", fontWeight: 600, color: "var(--accent-text)" }}
                                            placeholder="—"
                                            value={grandFocused ? grandDisp : (effGrand > 0 ? `${sym} ${fmt(effGrand)}` : "")}
                                            onFocus={() => { setGrandFocused(true); setGrandDisp(effGrand > 0 ? String(Math.round(effGrand * 100) / 100) : ""); }}
                                            onChange={e => {
                                                setGrandDisp(e.target.value);
                                                const v = parseFloat(e.target.value.replace(/[^0-9.,\-]/g, "").replace(",", "."));
                                                setOvGrand(isNaN(v) ? null : v);
                                            }}
                                            onBlur={() => setGrandFocused(false)}
                                        />
                                    </td>
                                    <td colSpan={2}>&nbsp;</td>
                                    <td className="q-no-print" style={{ width: "28px", padding: "0 4px", textAlign: "center" }}>
                                        {ovGrand !== null && <button type="button" aria-label="Genel toplamı otomatik hesaplamaya döndür" style={{ width: "20px", height: "20px", borderRadius: "3px", display: "inline-grid", placeItems: "center", fontSize: "13px", color: "var(--warning-text)", background: "var(--warning-bg)", border: "none", cursor: "pointer" }} onClick={() => setOvGrand(null)} title="Otomatik hesaplamaya dön">↻</button>}
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* ── Faz 4a (2026-05-23): PMT brand Teslimat / Ödeme ── */}
                    <div className="q-terms-block" style={{ padding: "16px 24px", borderTop: "1px solid var(--border-secondary)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                        <div>
                            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                                Delivery Method <span style={{ fontStyle: "italic", fontWeight: 400, opacity: 0.6 }}>/ Teslimat Şekli</span>
                            </div>
                            {renderTemplatePicker("delivery", deliveryMethod, setDeliveryMethod)}
                            <textarea
                                className="q-notes"
                                aria-label="Teslimat şekli"
                                style={{ width: "100%", background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", padding: "8px 10px", fontSize: "12px", color: "var(--text-primary)", resize: "vertical", minHeight: "60px", lineHeight: 1.5 }}
                                placeholder={"İSTANBUL PMT DEPO TESLİMİ\nEXWORKS PMT İSTANBUL DEPO"}
                                value={deliveryMethod}
                                onChange={e => setDeliveryMethod(e.target.value)}
                            />
                        </div>
                        <div>
                            <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                                Payment Method <span style={{ fontStyle: "italic", fontWeight: 400, opacity: 0.6 }}>/ Ödeme Şekli</span>
                            </div>
                            {renderTemplatePicker("payment", paymentMethod, setPaymentMethod)}
                            <textarea
                                className="q-notes"
                                aria-label="Ödeme şekli"
                                style={{ width: "100%", background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", padding: "8px 10px", fontSize: "12px", color: "var(--text-primary)", resize: "vertical", minHeight: "60px", lineHeight: 1.5 }}
                                placeholder={"%50 AVANS, %50 SEVKE HAZIR OLUNCA\n%100 PEŞİN"}
                                value={paymentMethod}
                                onChange={e => setPaymentMethod(e.target.value)}
                            />
                        </div>
                    </div>

                    {/* ── Notes ── */}
                    <div className="q-notes-block" style={{ padding: "16px 24px", borderTop: "1px solid var(--border-secondary)" }}>
                        <div style={{ fontSize: "10px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "8px" }}>
                            Notes &amp; Terms <span style={{ fontStyle: "italic", fontWeight: 400, opacity: 0.6 }}>/ Notlar</span>
                        </div>
                        {renderTemplatePicker("notes", notes, setNotes)}
                        <textarea
                            className="q-notes"
                            aria-label="Notlar ve şartlar"
                            style={{ width: "100%", background: "var(--bg-secondary)", border: "0.5px solid var(--border-secondary)", borderRadius: "4px", padding: "8px 10px", fontSize: "12px", color: "var(--text-primary)", resize: "vertical", minHeight: "80px", lineHeight: 1.6 }}
                            placeholder={"Diğer notlar, özel koşullar vb.\nOther notes, special conditions, etc."}
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
                                        aria-label={`${role} ad soyad`}
                                        style={{ background: "transparent", border: "none", borderBottom: "0.5px solid var(--border-tertiary)", fontSize: "11.5px", fontWeight: 500, color: "var(--text-primary)", padding: "4px 0", marginTop: "6px", width: "100%" }}
                                        placeholder="Ad Soyad / Name"
                                        value={val}
                                        onChange={e => set(e.target.value)}
                                    />
                                    <input
                                        className="q-sig-title"
                                        aria-label={`${role} unvan`}
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
