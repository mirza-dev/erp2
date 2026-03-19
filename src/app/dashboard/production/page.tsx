"use client";

import { useState, useRef, useEffect } from "react";
import { useData } from "@/lib/data-context";
import type { Product } from "@/lib/mock-data";
import { formatNumber } from "@/lib/utils";

interface FormLine {
    id: string;
    productId: string;
    adet: string;
    notlar: string;
}

function newLine(): FormLine {
    return { id: crypto.randomUUID(), productId: "", adet: "", notlar: "" };
}

const today = () => new Date().toISOString().slice(0, 10);

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "6px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
};

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "9px 14px",
    fontSize: "11px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    borderBottom: "0.5px solid var(--border-tertiary)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
    padding: "9px 14px",
    fontSize: "13px",
    borderBottom: "0.5px solid var(--border-tertiary)",
    color: "var(--text-primary)",
};

// ── Voice parser: extract product hint + quantity from Turkish speech ────────
function parseVoice(text: string, products: Product[]): { productId: string; adet: number } | null {
    const lower = text.toLowerCase();

    // Find quantity: look for Turkish number words or digits
    const digitMatch = lower.match(/(\d+)\s*(adet|tane|parça)?/);
    let adet = 0;
    if (digitMatch) adet = parseInt(digitMatch[1]);

    // Map Turkish word numbers
    const wordMap: Record<string, number> = {
        "bir": 1, "iki": 2, "üç": 3, "dört": 4, "beş": 5,
        "altı": 6, "yedi": 7, "sekiz": 8, "dokuz": 9, "on": 10,
        "yirmi": 20, "otuz": 30, "kırk": 40, "elli": 50,
        "altmış": 60, "yetmiş": 70, "seksen": 80, "doksan": 90,
        "yüz": 100, "iki yüz": 200, "üç yüz": 300, "dört yüz": 400, "beş yüz": 500,
        "bin": 1000,
    };
    if (adet === 0) {
        for (const [word, val] of Object.entries(wordMap)) {
            if (lower.includes(word)) { adet = val; break; }
        }
    }

    if (adet === 0) return null;

    // Find best matching product by name or SKU tokens
    let best: Product | null = null;
    let bestScore = 0;
    for (const p of products) {
        const tokens = [...p.name.toLowerCase().split(/\s+/), p.sku.toLowerCase()];
        let score = 0;
        for (const t of tokens) {
            if (t.length > 2 && lower.includes(t)) score++;
        }
        if (score > bestScore) { bestScore = score; best = p; }
    }

    if (!best || bestScore === 0) return null;
    return { productId: best.id, adet };
}

export default function ProductionPage() {
    const { products, uretimKayitlari, addUretimKaydi, deleteUretimKaydi } = useData();
    const [tarih, setTarih] = useState(today());
    const [lines, setLines] = useState<FormLine[]>([newLine()]);
    const [saved, setSaved] = useState(false);
    const [listening, setListening] = useState(false);
    const [voiceText, setVoiceText] = useState("");
    const [voiceError, setVoiceError] = useState("");
    const recognitionRef = useRef<SpeechRecognition | null>(null);

    const todayStr = today();
    const todayLogs = uretimKayitlari.filter(k => k.tarih === todayStr);

    const setLineField = (id: string, field: keyof FormLine, val: string) => {
        setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: val } : l));
    };

    const removeLine = (id: string) => {
        if (lines.length > 1) setLines(prev => prev.filter(l => l.id !== id));
    };

    const handleSave = () => {
        const valid = lines.filter(l => l.productId && parseInt(l.adet) > 0);
        if (valid.length === 0) return;
        for (const line of valid) {
            const product = products.find(p => p.id === line.productId);
            if (!product) continue;
            addUretimKaydi({
                productId: product.id,
                productName: product.name,
                productSku: product.sku,
                adet: parseInt(line.adet),
                tarih,
                girenKullanici: "Usta",
                notlar: line.notlar,
            });
        }
        setSaved(true);
        setLines([newLine()]);
        setTimeout(() => setSaved(false), 2500);
    };

    // ── Voice input ─────────────────────────────────────────────────────────
    const startListening = () => {
        const SpeechRec = (window as Window & { SpeechRecognition?: typeof SpeechRecognition; webkitSpeechRecognition?: typeof SpeechRecognition }).SpeechRecognition
            || (window as Window & { webkitSpeechRecognition?: typeof SpeechRecognition }).webkitSpeechRecognition;

        if (!SpeechRec) {
            setVoiceError("Bu tarayıcı sesli girişi desteklemiyor (Chrome kullanın)");
            return;
        }
        const rec = new SpeechRec();
        rec.lang = "tr-TR";
        rec.continuous = false;
        rec.interimResults = false;
        recognitionRef.current = rec;

        rec.onstart = () => { setListening(true); setVoiceError(""); setVoiceText(""); };
        rec.onend = () => setListening(false);
        rec.onerror = () => { setListening(false); setVoiceError("Ses tanınamadı, tekrar deneyin"); };
        rec.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            setVoiceText(transcript);
            const parsed = parseVoice(transcript, products);
            if (parsed) {
                // Fill the first empty line or add a new one
                const emptyIdx = lines.findIndex(l => !l.productId);
                if (emptyIdx >= 0) {
                    setLines(prev => prev.map((l, i) =>
                        i === emptyIdx ? { ...l, productId: parsed.productId, adet: String(parsed.adet) } : l
                    ));
                } else {
                    setLines(prev => [...prev, { id: crypto.randomUUID(), productId: parsed.productId, adet: String(parsed.adet), notlar: "" }]);
                }
            } else {
                setVoiceError(`"${transcript}" — ürün/adet eşleştirilemedi, lütfen manuel girin`);
            }
        };
        rec.start();
    };

    const stopListening = () => {
        recognitionRef.current?.stop();
        setListening(false);
    };

    const canSave = lines.some(l => l.productId && parseInt(l.adet) > 0);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Üretim Girişi
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                        Günlük üretim miktarlarını girerek stoğu güncelle
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <input
                        type="date"
                        value={tarih}
                        onChange={e => setTarih(e.target.value)}
                        style={{ ...inputStyle, width: "140px" }}
                    />
                </div>
            </div>

            {/* Form */}
            <div style={{
                background: "var(--bg-primary)",
                border: "0.5px solid var(--border-tertiary)",
                borderRadius: "6px",
                overflow: "hidden",
            }}>
                <div style={{
                    padding: "12px 16px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Üretim Kalemleri
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {voiceText && !listening && (
                            <span style={{ fontSize: "11px", color: "var(--text-tertiary)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                "{voiceText}"
                            </span>
                        )}
                        {voiceError && (
                            <span style={{ fontSize: "11px", color: "var(--warning-text)" }}>{voiceError}</span>
                        )}
                        <button
                            onClick={listening ? stopListening : startListening}
                            title="Sesli giriş"
                            style={{
                                fontSize: "13px",
                                padding: "5px 12px",
                                border: `0.5px solid ${listening ? "var(--danger-border)" : "var(--border-secondary)"}`,
                                borderRadius: "6px",
                                background: listening ? "var(--danger-bg)" : "transparent",
                                color: listening ? "var(--danger-text)" : "var(--text-secondary)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                            }}
                        >
                            {listening ? "⏹ Durdur" : "🎤 Sesli Giriş"}
                        </button>
                    </div>
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr style={{ background: "var(--bg-secondary)" }}>
                            <th style={{ ...thStyle, width: "34px" }}>#</th>
                            <th style={thStyle}>Ürün</th>
                            <th style={{ ...thStyle, width: "120px", textAlign: "right" as const }}>Adet</th>
                            <th style={thStyle}>Not</th>
                            <th style={{ ...thStyle, width: "34px" }}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line, idx) => {
                            const selectedProduct = products.find(p => p.id === line.productId);
                            return (
                                <tr key={line.id} style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px", textAlign: "center" }}>
                                        {idx + 1}
                                    </td>
                                    <td style={{ ...tdStyle, minWidth: "260px" }}>
                                        <select
                                            value={line.productId}
                                            onChange={e => setLineField(line.id, "productId", e.target.value)}
                                            style={{ ...inputStyle }}
                                        >
                                            <option value="" disabled>Ürün seç...</option>
                                            {products.filter(p => p.isActive).map(p => (
                                                <option key={p.id} value={p.id}>
                                                    {p.sku} — {p.name}
                                                </option>
                                            ))}
                                        </select>
                                        {selectedProduct && (
                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                                                Mevcut stok: {formatNumber(selectedProduct.availableStock)} {selectedProduct.unit}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right" as const }}>
                                        <input
                                            type="number"
                                            min={1}
                                            value={line.adet}
                                            onChange={e => setLineField(line.id, "adet", e.target.value)}
                                            placeholder="0"
                                            style={{ ...inputStyle, textAlign: "right", width: "90px" }}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <input
                                            type="text"
                                            value={line.notlar}
                                            onChange={e => setLineField(line.id, "notlar", e.target.value)}
                                            placeholder="Opsiyonel not..."
                                            style={inputStyle}
                                        />
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" as const }}>
                                        <button
                                            onClick={() => removeLine(line.id)}
                                            disabled={lines.length === 1}
                                            style={{
                                                fontSize: "16px",
                                                color: lines.length === 1 ? "var(--text-tertiary)" : "var(--danger-text)",
                                                background: "transparent",
                                                border: "none",
                                                cursor: lines.length === 1 ? "not-allowed" : "pointer",
                                                opacity: lines.length === 1 ? 0.3 : 1,
                                                lineHeight: 1,
                                            }}
                                        >×</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>

                <div style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                        onClick={() => setLines(prev => [...prev, newLine()])}
                        style={{
                            fontSize: "12px",
                            padding: "5px 12px",
                            border: "0.5px dashed var(--border-secondary)",
                            borderRadius: "5px",
                            background: "transparent",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = "var(--accent-text)"; e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--text-secondary)"; e.currentTarget.style.borderColor = "var(--border-secondary)"; }}
                    >
                        + Kalem Ekle
                    </button>

                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                        {saved && (
                            <span style={{ fontSize: "12px", color: "var(--success-text)" }}>
                                ✓ Üretim kaydedildi — stok güncellendi
                            </span>
                        )}
                        <button
                            onClick={handleSave}
                            disabled={!canSave}
                            style={{
                                fontSize: "13px",
                                padding: "7px 20px",
                                border: "0.5px solid",
                                borderColor: canSave ? "var(--accent-border)" : "var(--border-secondary)",
                                borderRadius: "6px",
                                background: canSave ? "var(--accent-bg)" : "transparent",
                                color: canSave ? "var(--accent-text)" : "var(--text-tertiary)",
                                cursor: canSave ? "pointer" : "not-allowed",
                                fontWeight: 600,
                            }}
                        >
                            Kaydet & Stoğu Güncelle
                        </button>
                    </div>
                </div>
            </div>

            {/* Today's log */}
            <div style={{
                background: "var(--bg-primary)",
                border: "0.5px solid var(--border-tertiary)",
                borderRadius: "6px",
                overflow: "hidden",
            }}>
                <div style={{
                    padding: "12px 16px",
                    borderBottom: "0.5px solid var(--border-tertiary)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Bugünkü Üretim Kayıtları
                    </div>
                    {todayLogs.length > 0 && (
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            Toplam: {todayLogs.reduce((s, k) => s + k.adet, 0).toLocaleString("tr-TR")} adet · {todayLogs.length} kalem
                        </div>
                    )}
                </div>

                {todayLogs.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        Bugün henüz üretim kaydı girilmedi
                    </div>
                ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={thStyle}>SKU</th>
                                <th style={thStyle}>Ürün</th>
                                <th style={{ ...thStyle, textAlign: "right" as const }}>Üretilen Adet</th>
                                <th style={thStyle}>Giren</th>
                                <th style={thStyle}>Not</th>
                                <th style={{ ...thStyle, width: "34px" }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {todayLogs.map(kaydi => (
                                <tr key={kaydi.id} style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{kaydi.productSku}</td>
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>{kaydi.productName}</td>
                                    <td style={{ ...tdStyle, textAlign: "right" as const, fontWeight: 600, color: "var(--success-text)" }}>
                                        +{formatNumber(kaydi.adet)}
                                    </td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)", fontSize: "12px" }}>{kaydi.girenKullanici}</td>
                                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px" }}>{kaydi.notlar || "—"}</td>
                                    <td style={{ ...tdStyle, textAlign: "center" as const }}>
                                        <button
                                            onClick={() => deleteUretimKaydi(kaydi.id)}
                                            title="Kaydı sil (stok geri alınır)"
                                            style={{
                                                fontSize: "14px",
                                                color: "var(--danger-text)",
                                                background: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                opacity: 0.6,
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                                        >×</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Historical log (all days) */}
            {uretimKayitlari.filter(k => k.tarih !== todayStr).length > 0 && (
                <div style={{
                    background: "var(--bg-primary)",
                    border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "6px",
                    overflow: "hidden",
                }}>
                    <div style={{ padding: "12px 16px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                            Geçmiş Kayıtlar
                        </div>
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={thStyle}>Tarih</th>
                                <th style={thStyle}>SKU</th>
                                <th style={thStyle}>Ürün</th>
                                <th style={{ ...thStyle, textAlign: "right" as const }}>Adet</th>
                                <th style={thStyle}>Giren</th>
                            </tr>
                        </thead>
                        <tbody>
                            {uretimKayitlari.filter(k => k.tarih !== todayStr).map(kaydi => (
                                <tr key={kaydi.id} style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px" }}>{kaydi.tarih}</td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{kaydi.productSku}</td>
                                    <td style={tdStyle}>{kaydi.productName}</td>
                                    <td style={{ ...tdStyle, textAlign: "right" as const, color: "var(--success-text)", fontWeight: 500 }}>+{formatNumber(kaydi.adet)}</td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)", fontSize: "12px" }}>{kaydi.girenKullanici}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
