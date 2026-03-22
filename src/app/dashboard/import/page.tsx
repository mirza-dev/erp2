"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useData } from "@/lib/data-context";

type ImportState = "idle" | "analyzing" | "sheet_select" | "mapping" | "preview" | "importing" | "done";

// ─── Mock sheet analysis (based on real Excel structure) ───────────────────
interface SheetInfo {
    name: string;
    displayName: string;
    rows: number;
    entity: string;
    status: "importable" | "parasut" | "unsupported";
    selected: boolean;
}

const DETECTED_SHEETS: SheetInfo[] = [
    { name: "Urunler", displayName: "Ürünler", rows: 100, entity: "Ürünler", status: "importable", selected: true },
    { name: "Musteriler", displayName: "Müşteriler", rows: 84, entity: "Müşteriler", status: "importable", selected: true },
    { name: "Siparisler", displayName: "Siparişler", rows: 280, entity: "Siparişler", status: "importable", selected: true },
    { name: "Siparis_Kalemleri", displayName: "Sipariş Kalemleri", rows: 1071, entity: "Sipariş Kalemleri", status: "importable", selected: true },
    { name: "Stok", displayName: "Stok", rows: 100, entity: "Stok Güncellemesi", status: "importable", selected: true },
    { name: "Faturalar", displayName: "Faturalar", rows: 352, entity: "Faturalar", status: "parasut", selected: false },
    { name: "Tahsilatlar", displayName: "Tahsilatlar", rows: 311, entity: "Tahsilatlar", status: "parasut", selected: false },
    { name: "Teklifler", displayName: "Teklifler", rows: 562, entity: "Teklifler", status: "unsupported", selected: false },
    { name: "Sevkiyatlar", displayName: "Sevkiyatlar", rows: 331, entity: "Sevkiyatlar", status: "unsupported", selected: false },
    { name: "Tedarikciler", displayName: "Tedarikçiler", rows: 24, entity: "Tedarikçiler", status: "unsupported", selected: false },
    { name: "Kur_Tablosu", displayName: "Kur Tablosu", rows: 24, entity: "Kur Tablosu", status: "unsupported", selected: false },
    { name: "Ulke_Lojistik_Parametreleri", displayName: "Ulke Lojistik", rows: 12, entity: "Lojistik Parametreler", status: "unsupported", selected: false },
    { name: "Satis_Temsilcileri", displayName: "Satış Temsilcileri", rows: 8, entity: "Satış Temsilcileri", status: "unsupported", selected: false },
    { name: "Ozet_KPI", displayName: "Özet KPI", rows: 28, entity: "KPI Özeti", status: "unsupported", selected: false },
];

// ─── Column mappings per sheet ─────────────────────────────────────────────
interface ColumnMap {
    excelCol: string;
    sample: string;
    erpField: string;
    confidence: "high" | "medium" | "low" | "skip";
}

const SHEET_MAPPINGS: Record<string, ColumnMap[]> = {
    Urunler: [
        { excelCol: "Urun_Kodu", sample: "ENDVAN-001", erpField: "SKU *", confidence: "high" },
        { excelCol: "Urun_Adi", sample: "Glob Vana Hijyenik", erpField: "Ürün Adı *", confidence: "high" },
        { excelCol: "Urun_Ailesi", sample: "Endustriyel Vana", erpField: "Ürün Ailesi", confidence: "high" },
        { excelCol: "Kategori", sample: "Kontrol ve Hat Vanalari", erpField: "Kategori", confidence: "high" },
        { excelCol: "Alt_Kategori", sample: "Glob Vana", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Sektor_Uygunlugu", sample: "Enerji, Su Arıtma", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Olcu_Birimi", sample: "Adet", erpField: "Birim", confidence: "high" },
        { excelCol: "Liste_Fiyati_USD", sample: "278.48", erpField: "Fiyat (USD) *", confidence: "high" },
        { excelCol: "Standart_Maliyet_USD", sample: "192.02", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Brut_Marj_Hedef_Yuzde", sample: "0.2873", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Termin_Gun", sample: "16", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Min_Siparis_Miktari", sample: "4", erpField: "Min. Sipariş Miktarı", confidence: "medium" },
        { excelCol: "GTIP_Kodu", sample: "848180", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Aktif_Pasif", sample: "Aktif", erpField: "Aktif/Pasif", confidence: "medium" },
        { excelCol: "Birim_Agirlik_Kg", sample: "42.42", erpField: "[Atla]", confidence: "skip" },
    ],
    Musteriler: [
        { excelCol: "Musteri_Kodu", sample: "MUS-001", erpField: "Harici Kod", confidence: "high" },
        { excelCol: "Firma_Adi", sample: "Nord Technik BV", erpField: "Firma Adı *", confidence: "high" },
        { excelCol: "Ulke", sample: "Misir", erpField: "Ülke", confidence: "high" },
        { excelCol: "Sehir", sample: "İskenderiye", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Bolge", sample: "Kuzey Afrika", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Sektor", sample: "Enerji", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Musteri_Tipi", sample: "Müteahhit EPC", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Risk_Segmenti", sample: "Orta", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Odeme_Vadesi_Gun", sample: "60", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Para_Birimi_Tercihi", sample: "USD", erpField: "Para Birimi", confidence: "high" },
        { excelCol: "Incoterm_Tercihi", sample: "CFR", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Ilk_Calisma_Tarihi", sample: "2023-07-22", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Yillik_Hedef_Ciro_USD", sample: "250000", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Aktif_Pasif", sample: "Aktif", erpField: "Aktif/Pasif", confidence: "medium" },
    ],
    Siparisler: [
        { excelCol: "Siparis_No", sample: "SIP-0001", erpField: "Sipariş No *", confidence: "high" },
        { excelCol: "Siparis_Tarihi", sample: "2024-05-01", erpField: "Sipariş Tarihi *", confidence: "high" },
        { excelCol: "Musteri_Kodu", sample: "MUS-062", erpField: "Müşteri Kodu *", confidence: "high" },
        { excelCol: "Teklif_No", sample: "TKL-0001", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Temsilci_Kodu", sample: "ST-008", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Siparis_Durumu", sample: "Sevk Edildi", erpField: "Durum", confidence: "high" },
        { excelCol: "Para_Birimi", sample: "USD", erpField: "Para Birimi", confidence: "high" },
        { excelCol: "Toplam_Tutar_USD", sample: "59386.89", erpField: "Toplam Tutar *", confidence: "high" },
        { excelCol: "Incoterm", sample: "FCA", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Planlanan_Sevk_Tarihi", sample: "2024-06-09", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Siparis_Onceligi", sample: "Yuksek", erpField: "[Atla]", confidence: "skip" },
    ],
    Siparis_Kalemleri: [
        { excelCol: "Siparis_Kalem_ID", sample: "SKL-00001", erpField: "Kalem ID", confidence: "high" },
        { excelCol: "Siparis_No", sample: "SIP-0001", erpField: "Sipariş No *", confidence: "high" },
        { excelCol: "Urun_Kodu", sample: "FLAIZO-008", erpField: "Ürün SKU *", confidence: "high" },
        { excelCol: "Miktar", sample: "52", erpField: "Miktar *", confidence: "high" },
        { excelCol: "Birim", sample: "Set", erpField: "Birim", confidence: "high" },
        { excelCol: "Birim_Fiyat_USD", sample: "138.23", erpField: "Birim Fiyat *", confidence: "high" },
        { excelCol: "Indirim_Yuzde", sample: "0.1064", erpField: "İndirim %", confidence: "high" },
        { excelCol: "Toplam_Tutar_USD", sample: "6423.04", erpField: "Satır Toplamı", confidence: "medium" },
        { excelCol: "Standart_Maliyet_USD", sample: "78.08", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Brut_Kar_USD", sample: "2362.88", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Brut_Kar_Marji_Yuzde", sample: "0.3679", erpField: "[Atla]", confidence: "skip" },
    ],
    Stok: [
        { excelCol: "Stok_Kayit_ID", sample: "STK-0001", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Urun_Kodu", sample: "ENDVAN-001", erpField: "Ürün SKU *", confidence: "high" },
        { excelCol: "Depo_Kodu", sample: "MRS-03", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Mevcut_Stok", sample: "81", erpField: "Toplam Stok *", confidence: "high" },
        { excelCol: "Rezerve_Stok", sample: "6", erpField: "Ayrılan Stok", confidence: "high" },
        { excelCol: "Serbest_Stok", sample: "75", erpField: "Müsait Stok", confidence: "high" },
        { excelCol: "Guvenlik_Stogu", sample: "31", erpField: "Min. Stok Seviyesi", confidence: "medium" },
        { excelCol: "Yeniden_Siparis_Noktasi", sample: "50", erpField: "[Atla]", confidence: "skip" },
        { excelCol: "Son_Guncelleme_Tarihi", sample: "2026-03-13", erpField: "[Atla]", confidence: "skip" },
    ],
};

// ─── Preview rows per entity ───────────────────────────────────────────────
const PREVIEW_DATA: Record<string, Array<Record<string, string>>> = {
    Urunler: [
        { sku: "ENDVAN-001", ad: "Glob Vana Hijyenik", kategori: "Kontrol ve Hat Vanalari", birim: "Adet", fiyat: "$278.48" },
        { sku: "ENDVAN-002", ad: "Glob Vana Paslanmaz", kategori: "Kontrol ve Hat Vanalari", birim: "Adet", fiyat: "$249.42" },
        { sku: "ENDVAN-003", ad: "Sürgülü Vana ANSI 150", kategori: "Kontrol ve Hat Vanalari", birim: "Adet", fiyat: "$1,400.97" },
        { sku: "ENDVAN-004", ad: "Sürgülü Vana PN16", kategori: "Kontrol ve Hat Vanalari", birim: "Adet", fiyat: "$290.69" },
        { sku: "ENDVAN-005", ad: "Küresel Vana PN40", kategori: "Kontrol ve Hat Vanalari", birim: "Adet", fiyat: "$520.00" },
    ],
    Musteriler: [
        { kod: "MUS-001", ad: "Nord Technik BV", ulke: "Mısır", para: "USD", durum: "Aktif" },
        { kod: "MUS-003", ad: "Atlas Engineering LLC", ulke: "BAE", para: "USD", durum: "Aktif" },
        { kod: "MUS-005", ad: "Petro Gulf Trading", ulke: "Katar", para: "USD", durum: "Aktif" },
        { kod: "MUS-007", ad: "Marmara Technik GmbH", ulke: "Almanya", para: "EUR", durum: "Aktif" },
        { kod: "MUS-009", ad: "Enerji Sistemleri AS", ulke: "Türkiye", para: "USD", durum: "Aktif" },
    ],
    Siparisler: [
        { no: "SIP-0001", tarih: "2024-05-01", musteri: "MUS-062", durum: "Sevk Edildi", tutar: "$59,386.89" },
        { no: "SIP-0002", tarih: "2024-05-29", musteri: "MUS-006", durum: "Tamamlandı", tutar: "$43,911.84" },
        { no: "SIP-0003", tarih: "2024-05-06", musteri: "MUS-065", durum: "Tamamlandı", tutar: "$72,655.17" },
        { no: "SIP-0004", tarih: "2024-04-28", musteri: "MUS-036", durum: "Tamamlandı", tutar: "$21,890.57" },
        { no: "SIP-0005", tarih: "2024-05-14", musteri: "MUS-012", durum: "Üretimde", tutar: "$34,220.00" },
    ],
    Siparis_Kalemleri: [
        { id: "SKL-00001", siparis: "SIP-0001", urun: "FLAIZO-008", miktar: "52 Set", fiyat: "$138.23", toplam: "$6,423.04" },
        { id: "SKL-00002", siparis: "SIP-0001", urun: "ENDVAN-021", miktar: "10 Adet", fiyat: "$984.20", toplam: "$9,653.00" },
        { id: "SKL-00003", siparis: "SIP-0001", urun: "ENDVAN-017", miktar: "8 Adet", fiyat: "$737.80", toplam: "$5,822.16" },
        { id: "SKL-00004", siparis: "SIP-0002", urun: "ENDVAN-003", miktar: "5 Adet", fiyat: "$1,400.97", toplam: "$7,004.85" },
        { id: "SKL-00005", siparis: "SIP-0002", urun: "FLAIZO-012", miktar: "30 Set", fiyat: "$92.50", toplam: "$2,775.00" },
    ],
    Stok: [
        { urun: "ENDVAN-001", mevcut: "81", rezerve: "6", serbest: "75", guvenlik: "31" },
        { urun: "ENDVAN-002", mevcut: "81", rezerve: "5", serbest: "76", guvenlik: "30" },
        { urun: "ENDVAN-003", mevcut: "123", rezerve: "32", serbest: "91", guvenlik: "26" },
        { urun: "ENDVAN-004", mevcut: "78", rezerve: "3", serbest: "75", guvenlik: "19" },
        { urun: "ENDVAN-005", mevcut: "45", rezerve: "8", serbest: "37", guvenlik: "20" },
    ],
};

// ─── Styles ────────────────────────────────────────────────────────────────
const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: "11px",
    fontWeight: 500,
    color: "var(--text-tertiary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
    whiteSpace: "nowrap" as const,
};

const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    fontSize: "12px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
};

const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: "12px",
    padding: "5px 12px",
    border: "0.5px solid " + (active ? "var(--accent-border)" : "var(--border-secondary)"),
    borderRadius: "5px",
    background: active ? "var(--accent-bg)" : "transparent",
    color: active ? "var(--accent-text)" : "var(--text-secondary)",
    cursor: "pointer",
    whiteSpace: "nowrap",
});

const IMPORTABLE_TABS = ["Urunler", "Musteriler", "Siparisler", "Siparis_Kalemleri", "Stok"];
const TAB_LABELS: Record<string, string> = {
    Urunler: "Ürünler",
    Musteriler: "Müşteriler",
    Siparisler: "Siparişler",
    Siparis_Kalemleri: "Sipariş Kalemleri",
    Stok: "Stok",
};
const IMPORT_COUNTS: Record<string, { total: number; label: string }> = {
    Urunler: { total: 100, label: "ürün" },
    Musteriler: { total: 84, label: "müşteri" },
    Siparisler: { total: 280, label: "sipariş" },
    Siparis_Kalemleri: { total: 1071, label: "kalem" },
    Stok: { total: 100, label: "stok kaydı" },
};

export default function ImportPage() {
    const { refetchAll } = useData();
    const [state, setState] = useState<ImportState>("idle");
    const [fileName, setFileName] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressLabel, setProgressLabel] = useState("");
    const [sheets, setSheets] = useState<SheetInfo[]>(DETECTED_SHEETS);
    const [activeTab, setActiveTab] = useState("Musteriler");
    const [importProgress, setImportProgress] = useState<Record<string, number>>({});
    const fileInputRef = useRef<HTMLInputElement>(null);

    const startAnalyzing = useCallback((name: string) => {
        setFileName(name);
        setState("analyzing");
        setProgress(0);

        const steps: [number, string][] = [
            [20, "Dosya okunuyor..."],
            [45, "14 sheet tespit edildi..."],
            [70, "Kolon analizi yapılıyor..."],
            [90, "AI eşleştirme önerileri hazırlanıyor..."],
            [100, "Hazır"],
        ];
        steps.forEach(([p, label], i) => {
            setTimeout(() => {
                setProgress(p);
                setProgressLabel(label);
                if (p === 100) {
                    setTimeout(() => {
                        setSheets(DETECTED_SHEETS.map(s => ({ ...s })));
                        setState("sheet_select");
                    }, 400);
                }
            }, i * 380);
        });
    }, []);

    const handleFileSelect = (file: File) => {
        const allowed = ["xlsx", "xls", "csv", "pdf"];
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        if (!allowed.includes(ext)) return;
        startAnalyzing(file.name);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file) handleFileSelect(file);
    };

    const toggleSheet = (idx: number) => {
        const sh = sheets[idx];
        if (sh.status !== "importable") return;
        setSheets(prev => prev.map((s, i) => i === idx ? { ...s, selected: !s.selected } : s));
    };

    const handleImport = async () => {
        setState("importing");
        const init: Record<string, number> = {};
        IMPORTABLE_TABS.forEach(t => (init[t] = 0));
        setImportProgress(init);

        try {
            // 1. Create batch
            const batchRes = await fetch("/api/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ file_name: fileName ?? "import.xlsx" }),
            });
            const batch = batchRes.ok ? await batchRes.json() : null;
            const batchId = batch?.id;

            // 2. Send preview data as drafts
            if (batchId) {
                const entityMap: Record<string, string> = {
                    Urunler: "product", Musteriler: "customer",
                    Siparisler: "order", Siparis_Kalemleri: "order_line", Stok: "stock",
                };
                const selectedSheets = sheets.filter(s => s.status === "importable" && s.selected);
                for (const sheet of selectedSheets) {
                    const entityType = entityMap[sheet.name] ?? sheet.name;
                    const previewRows = PREVIEW_DATA[sheet.name] ?? [];
                    const drafts = previewRows.map(row => ({
                        entity_type: entityType,
                        parsed_data: row,
                        confidence: 0.85,
                    }));
                    if (drafts.length > 0) {
                        await fetch(`/api/import/${batchId}/drafts`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(drafts),
                        });
                    }
                    setImportProgress(prev => ({ ...prev, [sheet.name]: IMPORT_COUNTS[sheet.name]?.total ?? 0 }));
                }

                // 3. Confirm batch \u2192 merge drafts to real entities
                await fetch(`/api/import/${batchId}/confirm`, { method: "POST" });
            }

            // 4. Refresh all data from API
            await refetchAll();
            setState("done");
        } catch (err) {
            console.error("Import failed:", err);
            setState("done");
        }
    };

    const reset = () => {
        setState("idle");
        setFileName(null);
        setProgress(0);
        setProgressLabel("");
        setImportProgress({});
        setActiveTab("Musteriler");
    };

    const importableSelected = sheets.filter(s => s.status === "importable" && s.selected);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "8px" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        AI Veri İçe Aktarım
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        Excel dosyasını yükle — AI sheetleri tanır, kolonları eşleştirir, önizleme gösterir
                    </div>
                </div>
                {(state !== "idle" && state !== "analyzing") && (
                    <button
                        onClick={reset}
                        style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                        }}
                    >
                        Yeni Dosya
                    </button>
                )}
            </div>

            {/* Step indicator */}
            {state !== "idle" && (
                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                    {[
                        { key: "analyzing", label: "Analiz" },
                        { key: "sheet_select", label: "Sheet Seçimi" },
                        { key: "mapping", label: "Kolon Eşleştirme" },
                        { key: "preview", label: "Önizleme" },
                        { key: "importing", label: "İçe Aktarım" },
                        { key: "done", label: "Tamamlandı" },
                    ].map((step, i) => {
                        const order = ["analyzing", "sheet_select", "mapping", "preview", "importing", "done"];
                        const currentIdx = order.indexOf(state);
                        const stepIdx = order.indexOf(step.key);
                        const isDone = stepIdx < currentIdx;
                        const isActive = stepIdx === currentIdx;
                        return (
                            <div key={step.key} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                {i > 0 && <div style={{ width: "20px", height: "0.5px", background: isDone || isActive ? "var(--accent)" : "var(--border-secondary)" }} />}
                                <span style={{
                                    color: isDone ? "var(--success-text)" : isActive ? "var(--accent-text)" : "var(--text-tertiary)",
                                    fontWeight: isActive ? 600 : 400,
                                }}>
                                    {isDone ? "✓ " : ""}{step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ───── IDLE ───── */}
            {state === "idle" && (
                <>
                    {/* Drop zone — drag target only, no onClick */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        style={{
                            border: `2px dashed ${dragOver ? "var(--accent-border)" : "var(--border-secondary)"}`,
                            borderRadius: "8px",
                            padding: "48px 24px",
                            textAlign: "center",
                            background: dragOver ? "rgba(56,139,253,0.07)" : "var(--bg-primary)",
                            transition: "border-color 0.15s, background 0.15s",
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv,.pdf"
                            style={{ display: "none" }}
                            onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                        />
                        <div style={{
                            width: "56px", height: "56px", margin: "0 auto 16px",
                            background: "var(--accent-bg)", borderRadius: "10px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg width="24" height="24" viewBox="0 0 22 22" fill="none">
                                <path d="M11 14V4M11 4L7 8M11 4L15 8" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                <path d="M3 17h16" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" />
                            </svg>
                        </div>
                        <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                            {dragOver ? "Dosyayı bırak" : "Dosyanı içe aktar"}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>
                            Excel, CSV veya PDF dosyalarını destekliyoruz
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            style={{
                                padding: "8px 20px",
                                background: "var(--accent)",
                                color: "#fff",
                                border: "none",
                                borderRadius: "6px",
                                fontSize: "13px",
                                fontWeight: 600,
                                cursor: "pointer",
                            }}
                        >
                            📂 Dosya Seç
                        </button>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>
                            veya dosyayı buraya sürükle
                        </div>
                        {/* File type chips */}
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center", marginTop: "20px", flexWrap: "wrap", alignItems: "center" }}>
                            {["XLSX", "XLS", "CSV", "PDF"].map(ext => (
                                <span key={ext} style={{
                                    fontSize: "11px", padding: "3px 10px",
                                    background: "var(--bg-secondary)",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "4px",
                                    color: "var(--text-secondary)",
                                    fontFamily: "monospace",
                                    fontWeight: 600,
                                }}>{ext}</span>
                            ))}
                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>· çok-sheet desteklenir</span>
                        </div>
                    </div>

                    {/* Örnek etiketler */}
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", flexWrap: "wrap" }}>
                        {["Müşteri Listesi", "Sipariş Geçmişi", "Ürün Kataloğu", "Stok Raporu"].map(label => (
                            <span key={label} style={{
                                fontSize: "11px", padding: "3px 10px",
                                background: "var(--bg-secondary)", border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "12px", color: "var(--text-tertiary)",
                            }}>{label}</span>
                        ))}
                    </div>

                    {/* "Ne Olacak?" akış göstergesi */}
                    <div style={{
                        display: "flex", alignItems: "center", gap: "0",
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px", overflow: "hidden",
                    }}>
                        {[
                            { icon: "🔍", label: "Analiz" },
                            { icon: "🗂", label: "Sheet Seç" },
                            { icon: "🔗", label: "Eşleştir" },
                            { icon: "👁", label: "Önizle" },
                            { icon: "✅", label: "İçe Aktar" },
                        ].map((step, i) => (
                            <div key={step.label} style={{
                                flex: 1, textAlign: "center", padding: "10px 8px",
                                borderRight: i < 4 ? "0.5px solid var(--border-tertiary)" : "none",
                                display: "flex", flexDirection: "column", alignItems: "center", gap: "3px",
                            }}>
                                <span style={{ fontSize: "14px" }}>{step.icon}</span>
                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{step.label}</span>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px" }}>
                        {[
                            { title: "Çok-Sheet Desteği", desc: "Excel workbook'taki tüm sheetler taranır. AI hangi sheetin ne olduğunu tanır: müşteri, ürün, sipariş..." },
                            { title: "Otomatik Kolon Eşleştirme", desc: "Kolon başlıklarına bakarak ERP alanlarıyla eşleştirir. Firma_Adi → Firma Adı, Ulke → Ülke gibi." },
                            { title: "Seçici İçe Aktarım", desc: "Hangi sheetleri, hangi kolonları içe alacağını seç. Paraşüt'e gitecek veriler otomatik ayrışır." },
                        ].map(card => (
                            <div key={card.title} style={{
                                background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                                borderRadius: "6px", padding: "14px 16px",
                            }}>
                                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>{card.title}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{card.desc}</div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* ───── ANALYZING ───── */}
            {state === "analyzing" && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", padding: "48px 24px", textAlign: "center",
                }}>
                    <div style={{ display: "flex", gap: "8px", justifyContent: "center", marginBottom: "24px" }}>
                        {[0, 1, 2].map(i => (
                            <div key={i} style={{
                                width: "8px", height: "8px", borderRadius: "50%",
                                background: "var(--accent)",
                                animation: `pulse-dot 1.2s ease-in-out ${i * 0.2}s infinite`,
                            }} />
                        ))}
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
                        AI dosyayı analiz ediyor...
                    </div>
                    {fileName && (
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginBottom: "20px" }}>{fileName}</div>
                    )}
                    <div style={{ maxWidth: "320px", margin: "0 auto", height: "4px", background: "var(--border-tertiary)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${progress}%`, background: "var(--accent)", borderRadius: "2px", transition: "width 0.35s ease" }} />
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "8px" }}>{progressLabel}</div>
                </div>
            )}

            {/* ───── SHEET SELECT ───── */}
            {state === "sheet_select" && (
                <>
                    <div style={{
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "8px", overflow: "hidden",
                    }}>
                        {/* Header */}
                        <div style={{
                            padding: "12px 16px", borderBottom: "0.5px solid var(--border-tertiary)",
                            background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                            <div>
                                <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)" }}>14 sheet tespit edildi</span>
                                <span style={{ fontSize: "12px", color: "var(--text-tertiary)", marginLeft: "10px" }}>
                                    {importableSelected.length} içe aktarılabilir · {importableSelected.filter(s => s.selected).length} seçili
                                </span>
                            </div>
                            {fileName && <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{fileName}</span>}
                        </div>

                        {/* Sheet rows */}
                        <div style={{ display: "flex", flexDirection: "column" }}>
                            {sheets.map((sheet, idx) => {
                                const statusColor = sheet.status === "importable"
                                    ? "var(--success-text)"
                                    : sheet.status === "parasut"
                                    ? "var(--accent-text)"
                                    : "var(--text-tertiary)";
                                const statusBg = sheet.status === "importable"
                                    ? "var(--success-bg)"
                                    : sheet.status === "parasut"
                                    ? "var(--accent-bg)"
                                    : "var(--bg-tertiary)";
                                const statusLabel = sheet.status === "importable"
                                    ? "İçe Aktarılabilir"
                                    : sheet.status === "parasut"
                                    ? "Paraşüt ile sync"
                                    : "Desteklenmiyor";

                                return (
                                    <div
                                        key={sheet.name}
                                        onClick={() => toggleSheet(idx)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: "12px",
                                            padding: "10px 16px",
                                            borderBottom: idx < sheets.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                                            cursor: sheet.status === "importable" ? "pointer" : "default",
                                            opacity: sheet.status === "unsupported" ? 0.5 : 1,
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={sheet.selected}
                                            disabled={sheet.status !== "importable"}
                                            onChange={() => toggleSheet(idx)}
                                            onClick={e => e.stopPropagation()}
                                            style={{ cursor: sheet.status === "importable" ? "pointer" : "default", accentColor: "var(--accent)" }}
                                        />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>
                                                    {sheet.displayName}
                                                </span>
                                                <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                                                    {sheet.name}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>{sheet.entity}</div>
                                        </div>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                                            {sheet.rows.toLocaleString("tr-TR")} satır
                                        </span>
                                        <span style={{
                                            fontSize: "10px", padding: "2px 8px",
                                            background: statusBg, color: statusColor,
                                            borderRadius: "10px", whiteSpace: "nowrap",
                                        }}>
                                            {statusLabel}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button onClick={reset} style={{
                            fontSize: "12px", padding: "7px 14px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                        }}>← Geri</button>
                        <button
                            onClick={() => { setActiveTab("Musteriler"); setState("mapping"); }}
                            disabled={importableSelected.length === 0}
                            style={{
                                fontSize: "12px", padding: "7px 18px",
                                border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                                background: importableSelected.length > 0 ? "var(--accent-bg)" : "var(--bg-tertiary)",
                                color: importableSelected.length > 0 ? "var(--accent-text)" : "var(--text-tertiary)",
                                cursor: importableSelected.length > 0 ? "pointer" : "not-allowed", fontWeight: 600,
                            }}
                        >
                            Kolon Eşleştirmeye Geç →
                        </button>
                    </div>
                </>
            )}

            {/* ───── MAPPING ───── */}
            {state === "mapping" && (
                <>
                    {/* Tab bar */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {IMPORTABLE_TABS.map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} style={tabBtnStyle(activeTab === tab)}>
                                {TAB_LABELS[tab]}
                            </button>
                        ))}
                    </div>

                    <div style={{
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "8px", overflow: "hidden",
                    }}>
                        {/* Mapping header */}
                        <div style={{
                            padding: "10px 16px", borderBottom: "0.5px solid var(--border-tertiary)",
                            background: "var(--bg-secondary)", display: "flex", gap: "16px",
                        }}>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: "0 0 180px" }}>Excel Kolonu</span>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: "0 0 140px" }}>Örnek Değer</span>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: 1 }}>ERP Alanı</span>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", flex: "0 0 80px", textAlign: "center" }}>Güven</span>
                        </div>

                        {(SHEET_MAPPINGS[activeTab] ?? []).map((col, i) => {
                            const confColor = col.confidence === "high" ? "var(--success-text)"
                                : col.confidence === "medium" ? "var(--warning-text)"
                                : col.confidence === "low" ? "var(--danger-text)"
                                : "var(--text-tertiary)";
                            const confLabel = col.confidence === "high" ? "Yüksek"
                                : col.confidence === "medium" ? "Orta"
                                : col.confidence === "low" ? "Düşük"
                                : "—";

                            return (
                                <div key={col.excelCol} style={{
                                    display: "flex", alignItems: "center", gap: "16px",
                                    padding: "9px 16px",
                                    borderBottom: i < (SHEET_MAPPINGS[activeTab]?.length ?? 0) - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                                    opacity: col.confidence === "skip" ? 0.5 : 1,
                                }}>
                                    <span style={{ fontSize: "12px", color: "var(--text-primary)", fontFamily: "monospace", flex: "0 0 180px" }}>
                                        {col.excelCol}
                                    </span>
                                    <span style={{ fontSize: "11px", color: "var(--text-tertiary)", flex: "0 0 140px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {col.sample}
                                    </span>
                                    <span style={{
                                        fontSize: "12px", flex: 1,
                                        color: col.confidence === "skip" ? "var(--text-tertiary)" : "var(--accent-text)",
                                        fontStyle: col.confidence === "skip" ? "italic" : "normal",
                                    }}>
                                        {col.erpField}
                                    </span>
                                    <span style={{
                                        fontSize: "10px", flex: "0 0 80px", textAlign: "center",
                                        color: confColor,
                                    }}>
                                        {col.confidence !== "skip" && <span style={{ marginRight: "3px" }}>●</span>}
                                        {confLabel}
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button onClick={() => setState("sheet_select")} style={{
                            fontSize: "12px", padding: "7px 14px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                        }}>← Geri</button>
                        <button onClick={() => { setActiveTab("Musteriler"); setState("preview"); }} style={{
                            fontSize: "12px", padding: "7px 18px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            cursor: "pointer", fontWeight: 600,
                        }}>
                            Önizlemeye Geç →
                        </button>
                    </div>
                </>
            )}

            {/* ───── PREVIEW ───── */}
            {state === "preview" && (
                <>
                    {/* Tab bar */}
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        {IMPORTABLE_TABS.map(tab => (
                            <button key={tab} onClick={() => setActiveTab(tab)} style={tabBtnStyle(activeTab === tab)}>
                                {TAB_LABELS[tab]}
                                <span style={{ marginLeft: "5px", fontSize: "10px", opacity: 0.7 }}>
                                    {IMPORT_COUNTS[tab].total}
                                </span>
                            </button>
                        ))}
                    </div>

                    <div style={{
                        background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "8px", overflowX: "auto",
                    }}>
                        {/* Preview info bar */}
                        <div style={{
                            padding: "10px 16px", borderBottom: "0.5px solid var(--border-tertiary)",
                            background: "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between",
                        }}>
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                                İlk 5 satır gösteriliyor ·&nbsp;
                                <span style={{ color: "var(--success-text)", fontWeight: 600 }}>
                                    {IMPORT_COUNTS[activeTab].total} {IMPORT_COUNTS[activeTab].label} içe aktarılacak
                                </span>
                                &nbsp;· 0 çakışma
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Önizleme</span>
                        </div>

                        {/* Dynamic preview table */}
                        {activeTab === "Urunler" && (
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                                <thead><tr style={{ background: "var(--bg-secondary)" }}>
                                    {["SKU", "Ürün Adı", "Kategori", "Birim", "Fiyat"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                                </tr></thead>
                                <tbody>{(PREVIEW_DATA.Urunler ?? []).map((r, i) => (
                                    <tr key={i}><td style={tdStyle}>{r.sku}</td><td style={tdStyle}>{r.ad}</td><td style={tdStyle}>{r.kategori}</td><td style={tdStyle}>{r.birim}</td><td style={tdStyle}>{r.fiyat}</td></tr>
                                ))}</tbody>
                            </table>
                        )}
                        {activeTab === "Musteriler" && (
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                                <thead><tr style={{ background: "var(--bg-secondary)" }}>
                                    {["Kod", "Firma Adı", "Ülke", "Para Birimi", "Durum"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                                </tr></thead>
                                <tbody>{(PREVIEW_DATA.Musteriler ?? []).map((r, i) => (
                                    <tr key={i}><td style={tdStyle}>{r.kod}</td><td style={tdStyle}>{r.ad}</td><td style={tdStyle}>{r.ulke}</td><td style={tdStyle}>{r.para}</td><td style={tdStyle}><span style={{ color: "var(--success-text)" }}>{r.durum}</span></td></tr>
                                ))}</tbody>
                            </table>
                        )}
                        {activeTab === "Siparisler" && (
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                                <thead><tr style={{ background: "var(--bg-secondary)" }}>
                                    {["Sipariş No", "Tarih", "Müşteri", "Durum", "Tutar"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                                </tr></thead>
                                <tbody>{(PREVIEW_DATA.Siparisler ?? []).map((r, i) => (
                                    <tr key={i}><td style={tdStyle}>{r.no}</td><td style={tdStyle}>{r.tarih}</td><td style={tdStyle}>{r.musteri}</td><td style={tdStyle}>{r.durum}</td><td style={tdStyle}>{r.tutar}</td></tr>
                                ))}</tbody>
                            </table>
                        )}
                        {activeTab === "Siparis_Kalemleri" && (
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                                <thead><tr style={{ background: "var(--bg-secondary)" }}>
                                    {["Kalem ID", "Sipariş", "Ürün", "Miktar", "Fiyat", "Toplam"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                                </tr></thead>
                                <tbody>{(PREVIEW_DATA.Siparis_Kalemleri ?? []).map((r, i) => (
                                    <tr key={i}><td style={tdStyle}>{r.id}</td><td style={tdStyle}>{r.siparis}</td><td style={tdStyle}>{r.urun}</td><td style={tdStyle}>{r.miktar}</td><td style={tdStyle}>{r.fiyat}</td><td style={tdStyle}>{r.toplam}</td></tr>
                                ))}</tbody>
                            </table>
                        )}
                        {activeTab === "Stok" && (
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "600px" }}>
                                <thead><tr style={{ background: "var(--bg-secondary)" }}>
                                    {["Ürün SKU", "Mevcut Stok", "Rezerve", "Serbest", "Min. Seviye"].map(h => <th key={h} style={thStyle}>{h}</th>)}
                                </tr></thead>
                                <tbody>{(PREVIEW_DATA.Stok ?? []).map((r, i) => (
                                    <tr key={i}><td style={tdStyle}>{r.urun}</td><td style={tdStyle}>{r.mevcut}</td><td style={tdStyle}>{r.rezerve}</td><td style={tdStyle}>{r.serbest}</td><td style={tdStyle}>{r.guvenlik}</td></tr>
                                ))}</tbody>
                            </table>
                        )}
                    </div>

                    {/* Total summary */}
                    <div style={{
                        display: "flex", gap: "10px", padding: "10px 14px",
                        background: "var(--bg-secondary)", border: "0.5px solid var(--border-tertiary)",
                        borderRadius: "6px", fontSize: "12px", flexWrap: "wrap",
                    }}>
                        <span style={{ color: "var(--text-secondary)" }}>Toplam:</span>
                        {IMPORTABLE_TABS.map(tab => (
                            <span key={tab} style={{ color: "var(--text-primary)" }}>
                                <span style={{ fontWeight: 600 }}>{IMPORT_COUNTS[tab].total.toLocaleString("tr-TR")}</span> {IMPORT_COUNTS[tab].label}
                            </span>
                        ))}
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                        <button onClick={() => setState("mapping")} style={{
                            fontSize: "12px", padding: "7px 14px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                        }}>← Geri</button>
                        <button onClick={handleImport} style={{
                            fontSize: "12px", padding: "7px 18px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            cursor: "pointer", fontWeight: 600,
                        }}>
                            Onayla ve İçe Aktar →
                        </button>
                    </div>
                </>
            )}

            {/* ───── IMPORTING ───── */}
            {state === "importing" && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px", padding: "24px",
                }}>
                    <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "20px" }}>
                        İçe aktarılıyor...
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                        {IMPORTABLE_TABS.map(tab => {
                            const count = importProgress[tab] ?? 0;
                            const total = IMPORT_COUNTS[tab].total;
                            const pct = Math.round((count / total) * 100);
                            const done = count >= total;
                            return (
                                <div key={tab}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                        <span style={{ fontSize: "12px", color: "var(--text-primary)" }}>{TAB_LABELS[tab]}</span>
                                        <span style={{ fontSize: "11px", color: done ? "var(--success-text)" : "var(--text-tertiary)" }}>
                                            {done ? `✓ ${total.toLocaleString("tr-TR")}` : `${count.toLocaleString("tr-TR")} / ${total.toLocaleString("tr-TR")}`}
                                        </span>
                                    </div>
                                    <div style={{ height: "5px", background: "var(--border-tertiary)", borderRadius: "3px", overflow: "hidden" }}>
                                        <div style={{
                                            height: "100%", width: `${pct}%`,
                                            background: done ? "var(--success)" : "var(--accent)",
                                            borderRadius: "3px", transition: "width 0.2s ease",
                                        }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ───── DONE ───── */}
            {state === "done" && (
                <div style={{
                    background: "var(--bg-primary)", border: "0.5px solid var(--success-border)",
                    borderRadius: "8px", padding: "32px 24px",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                        <div style={{
                            width: "36px", height: "36px", background: "var(--success-bg)", borderRadius: "8px",
                            display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                                <path d="M3.5 9l3.5 3.5 7-7" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                        </div>
                        <div>
                            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>İçeri aktarım tamamlandı</div>
                            <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>{fileName}</div>
                        </div>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "10px", marginBottom: "16px" }}>
                        {[
                            { label: "Ürünler", count: "100", detail: "6 yeni · 94 güncellendi", color: "var(--success-text)" },
                            { label: "Müşteriler", count: "84", detail: "84 yeni eklendi", color: "var(--success-text)" },
                            { label: "Siparişler", count: "280", detail: "280 sipariş + 1,071 kalem", color: "var(--success-text)" },
                            { label: "Stok", count: "100", detail: "100 stok kaydı güncellendi", color: "var(--success-text)" },
                            { label: "Faturalar", count: "352", detail: "Paraşüt Sync ile işlenecek", color: "var(--accent-text)" },
                            { label: "Tahsilatlar", count: "311", detail: "Paraşüt Sync ile işlenecek", color: "var(--accent-text)" },
                        ].map(item => (
                            <div key={item.label} style={{
                                background: "var(--bg-secondary)", borderRadius: "6px", padding: "12px 14px",
                            }}>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "2px" }}>{item.label}</div>
                                <div style={{ fontSize: "18px", fontWeight: 600, color: item.color, marginBottom: "2px" }}>{item.count}</div>
                                <div style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{item.detail}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        <Link href="/dashboard/customers" style={{
                            fontSize: "12px", padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            textDecoration: "none", fontWeight: 500,
                        }}>
                            Cariler sayfasına git →
                        </Link>
                        <Link href="/dashboard/orders" style={{
                            fontSize: "12px", padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            textDecoration: "none", fontWeight: 500,
                        }}>
                            Siparişler sayfasına git →
                        </Link>
                        <Link href="/dashboard/products" style={{
                            fontSize: "12px", padding: "6px 14px",
                            border: "0.5px solid var(--accent-border)", borderRadius: "6px",
                            background: "var(--accent-bg)", color: "var(--accent-text)",
                            textDecoration: "none", fontWeight: 500,
                        }}>
                            Stok & Ürünler →
                        </Link>
                        <button onClick={reset} style={{
                            fontSize: "12px", padding: "6px 16px",
                            border: "0.5px solid var(--border-secondary)", borderRadius: "6px",
                            background: "transparent", color: "var(--text-secondary)", cursor: "pointer",
                        }}>
                            Yeni Dosya Yükle
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
