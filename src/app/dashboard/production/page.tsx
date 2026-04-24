"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useData } from "@/lib/data-context";
import { formatNumber } from "@/lib/utils";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { useVoiceRecorder, type VoiceRecorderResult } from "@/hooks/useVoiceRecorder";
import type { VoiceProductionEntry } from "@/lib/services/voice-service";

interface FormLine {
    id: string;
    productId: string;
    adet: string;
    notlar: string;
    _lowConfidence?: boolean; // sesli girişten gelen, güven skoru düşük satır
}

function newLine(): FormLine {
    return { id: crypto.randomUUID(), productId: "", adet: "", notlar: "" };
}

const today = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

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

export default function ProductionPage() {
    const { products, uretimKayitlari, addUretimKaydi, deleteUretimKaydi, loadError } = useData();
    const { toast } = useToast();
    const isDemo = useIsDemo();
    const [tarih, setTarih] = useState(today());
    const [lines, setLines] = useState<FormLine[]>([newLine()]);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const todayStr = today();
    const todayLogs = uretimKayitlari.filter(k => k.tarih === todayStr);
    const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
    const transcriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleVoiceResult = useCallback(async ({ blob, filename }: VoiceRecorderResult) => {
        const formData = new FormData();
        formData.append("audio", blob, filename);
        const res = await fetch("/api/production/transcribe", { method: "POST", body: formData });
        if (!res.ok) {
            const body = await res.json().catch(() => null) as { error?: string } | null;
            throw new Error(body?.error ?? "Ses işlenemedi.");
        }
        const data = await res.json() as { text: string; entry: VoiceProductionEntry };
        setVoiceTranscript(data.text);
        const entry = data.entry;
        const newLineItem: FormLine = {
            id: crypto.randomUUID(),
            productId: entry.productId ?? "",
            adet: entry.quantity > 0 ? String(entry.quantity) : "",
            notlar: entry.notes ?? "",
            _lowConfidence: entry.confidence < 0.7,
        };
        setLines(prev => {
            // Boş tek satır varsa değiştir, yoksa ekle
            const hasEmptyOnly = prev.length === 1 && !prev[0].productId && !prev[0].adet;
            return hasEmptyOnly ? [newLineItem] : [...prev, newLineItem];
        });
        if (entry.confidence < 0.7) {
            toast({ type: "warning", message: "Sesli giriş düşük güvenle tamamlandı. Bilgileri kontrol edin." });
        } else {
            toast({ type: "success", message: "Sesli giriş tamamlandı. Bilgileri gözden geçirin." });
        }
        // Transkript 6 saniye sonra gizlenir (önceki timer varsa iptal et)
        if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
        transcriptTimerRef.current = setTimeout(() => setVoiceTranscript(null), 6000);
    }, [toast]);

    const { isRecording, isProcessing, duration, error: voiceError, startRecording, stopRecording, cancelRecording } = useVoiceRecorder(handleVoiceResult);

    const setLineField = (id: string, field: keyof FormLine, val: string) => {
        setLines(prev => prev.map(l =>
            l.id === id ? { ...l, [field]: val, _lowConfidence: false } : l
        ));
    };

    const removeLine = (id: string) => {
        if (lines.length === 1) {
            setLines([newLine()]);
        } else {
            setLines(prev => prev.filter(l => l.id !== id));
        }
    };

    const handleSave = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const valid = lines.filter(l => l.productId && parseInt(l.adet) > 0);
        if (valid.length === 0) {
            toast({ type: "error", message: "Lütfen en az bir ürün seçin ve adet girin" });
            return;
        }
        setIsSaving(true);
        let succeeded = 0;
        let failed = 0;
        let refetchWarning = false;
        let firstError: string | null = null;
        const failedLineIds: string[] = [];

        for (const line of valid) {
            const product = products.find(p => p.id === line.productId);
            if (!product) { failed++; failedLineIds.push(line.id); continue; }
            try {
                const result = await addUretimKaydi({
                    productId: product.id,
                    productName: product.name,
                    productSku: product.sku,
                    adet: parseInt(line.adet),
                    tarih,
                    girenKullanici: "Usta",
                    notlar: line.notlar,
                });
                succeeded++;
                if (result?.refetchFailed) refetchWarning = true;
            } catch (err) {
                failed++;
                failedLineIds.push(line.id);
                if (!firstError) firstError = err instanceof Error ? err.message : "Üretim kaydedilemedi.";
            }
        }

        if (succeeded > 0 && failed === 0) {
            const totalAdet = valid.reduce((s, l) => s + parseInt(l.adet), 0);
            const msg = `${succeeded} kalem, ${totalAdet} adet üretim kaydedildi — stok güncellendi`;
            toast({ type: "success", message: refetchWarning ? msg + " (veri gecikmeli yüklenebilir)" : msg });
            setLines([newLine()]);
        } else if (succeeded > 0 && failed > 0) {
            toast({ type: "warning", message: `${succeeded} kayıt başarılı, ${failed} kayıt başarısız. Başarısız satırları kontrol edin.` });
            setLines(prev => prev.filter(l => failedLineIds.includes(l.id)));
        } else {
            toast({ type: "error", message: firstError ?? "Hiçbir kayıt oluşturulamadı. Lütfen tekrar deneyin." });
        }

        setIsSaving(false);
    };

    const canSave = lines.some(l => l.productId && parseInt(l.adet) > 0);

    // Ses kaydı hatası — toast olarak göster (sadece yeni hata gelince)
    const prevVoiceErrorRef = useRef<string | null>(null);
    useEffect(() => {
        if (voiceError && voiceError !== prevVoiceErrorRef.current) {
            prevVoiceErrorRef.current = voiceError;
            toast({ type: "error", message: voiceError });
        }
    }, [voiceError, toast]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Load error banner */}
            {loadError && (
                <div style={{
                    padding: "10px 14px",
                    background: "var(--danger-bg)",
                    border: "0.5px solid var(--danger-border)",
                    borderRadius: "6px",
                    fontSize: "12px",
                    color: "var(--danger-text)",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                }}>
                    ⚠ {loadError}
                </div>
            )}
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
                        {/* Kayıt aktif: süre + durdur + iptal */}
                        {isRecording && (
                            <>
                                <span style={{ fontSize: "12px", color: "var(--danger-text)", display: "flex", alignItems: "center", gap: "5px" }}>
                                    <span style={{
                                        display: "inline-block", width: "8px", height: "8px",
                                        borderRadius: "50%", background: "var(--danger)",
                                        animation: "pulse 1s infinite",
                                    }} />
                                    {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
                                </span>
                                <button
                                    onClick={stopRecording}
                                    style={{
                                        fontSize: "13px", padding: "5px 12px",
                                        border: "0.5px solid var(--danger-border)",
                                        borderRadius: "6px", background: "var(--danger-bg)",
                                        color: "var(--danger-text)", cursor: "pointer",
                                        display: "flex", alignItems: "center", gap: "5px",
                                    }}
                                >
                                    ■ Durdur
                                </button>
                                <button
                                    onClick={cancelRecording}
                                    style={{
                                        fontSize: "12px", padding: "5px 8px",
                                        border: "0.5px solid var(--border-secondary)",
                                        borderRadius: "6px", background: "transparent",
                                        color: "var(--text-tertiary)", cursor: "pointer",
                                    }}
                                    title="İptal et"
                                >
                                    İptal
                                </button>
                            </>
                        )}
                        {/* İşleniyor */}
                        {isProcessing && !isRecording && (
                            <span style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "5px" }}>
                                <span style={{ display: "inline-block", width: "10px", height: "10px", border: "1.5px solid var(--border-secondary)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                                Ses işleniyor...
                            </span>
                        )}
                        {/* Hazır: sesli giriş butonu */}
                        {!isRecording && !isProcessing && (
                            <button
                                onClick={isDemo ? () => toast({ type: "info", message: DEMO_BLOCK_TOAST }) : startRecording}
                                disabled={isDemo}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : "Sesli üretim girişi (90sn max)"}
                                style={{
                                    fontSize: "13px", padding: "5px 12px",
                                    border: "0.5px solid var(--border-secondary)",
                                    borderRadius: "6px", background: "transparent",
                                    color: isDemo ? "var(--text-tertiary)" : "var(--text-secondary)",
                                    cursor: isDemo ? "not-allowed" : "pointer",
                                    display: "flex", alignItems: "center", gap: "5px",
                                    opacity: isDemo ? 0.5 : 1,
                                }}
                            >
                                🎤 Sesli Giriş
                            </button>
                        )}
                    </div>
                </div>

                {/* Transkript gösterimi — sesli giriş sonrası 6sn görünür */}
                {voiceTranscript && (
                    <div style={{
                        padding: "8px 16px",
                        borderBottom: "0.5px solid var(--border-tertiary)",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        background: "var(--bg-secondary)",
                        display: "flex", alignItems: "center", gap: "6px",
                    }}>
                        <span style={{ opacity: 0.6 }}>🎤</span>
                        <span>&ldquo;{voiceTranscript}&rdquo;</span>
                    </div>
                )}

                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", minWidth: "520px", borderCollapse: "collapse" }}>
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
                                <tr key={line.id} style={{ borderBottom: "0.5px solid var(--border-tertiary)", background: line._lowConfidence ? "var(--warning-bg)" : undefined }}>
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
                                                Mevcut stok: {formatNumber(selectedProduct.available_now)} {selectedProduct.unit}
                                            </div>
                                        )}
                                        {line._lowConfidence && (
                                            <div style={{ fontSize: "11px", color: "var(--warning-text)", marginTop: "3px" }}>
                                                ⚠ Sesli giriş düşük güvenle eşleşti — kontrol edin
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
                                            style={{
                                                fontSize: "16px",
                                                color: "var(--danger-text)",
                                                background: "transparent",
                                                border: "none",
                                                cursor: "pointer",
                                                opacity: 0.6,
                                                lineHeight: 1,
                                            }}
                                            onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                                            onMouseLeave={e => (e.currentTarget.style.opacity = "0.6")}
                                        >×</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                </div>

                <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "space-between", alignItems: "center" }}>
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

                    <Button variant="primary" size="md" onClick={handleSave} disabled={isDemo || !canSave || isSaving} loading={isSaving} title={isDemo ? DEMO_DISABLED_TOOLTIP : undefined}>
                        {isSaving ? "Kaydediliyor..." : "Kaydet & Stoğu Güncelle"}
                    </Button>
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
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "480px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={thStyle}>SKU</th>
                                <th style={thStyle}>Ürün</th>
                                <th style={{ ...thStyle, textAlign: "right" as const }}>Üretilen Adet</th>
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
                                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px" }}>{kaydi.notlar || "—"}</td>
                                    <td style={{ ...tdStyle, textAlign: "center" as const }}>
                                        <button
                                            onClick={async () => {
                                                if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
                                                if (deletingId === kaydi.id) return;
                                                setDeletingId(kaydi.id);
                                                try {
                                                    await deleteUretimKaydi(kaydi.id);
                                                    toast({ type: "success", message: "Üretim kaydı silindi" });
                                                } catch (err) {
                                                    const msg = err instanceof Error ? err.message : "Kayıt silinemedi.";
                                                    toast({ type: "error", message: msg });
                                                } finally {
                                                    setDeletingId(null);
                                                }
                                            }}
                                            disabled={isDemo || deletingId === kaydi.id}
                                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Kaydı sil (stok geri alınır)"}
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
                    </div>
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
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "460px" }}>
                        <thead>
                            <tr style={{ background: "var(--bg-secondary)" }}>
                                <th style={thStyle}>Tarih</th>
                                <th style={thStyle}>SKU</th>
                                <th style={thStyle}>Ürün</th>
                                <th style={{ ...thStyle, textAlign: "right" as const }}>Adet</th>
                            </tr>
                        </thead>
                        <tbody>
                            {uretimKayitlari.filter(k => k.tarih !== todayStr).map(kaydi => (
                                <tr key={kaydi.id} style={{ borderBottom: "0.5px solid var(--border-tertiary)" }}>
                                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px" }}>{kaydi.tarih}</td>
                                    <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{kaydi.productSku}</td>
                                    <td style={tdStyle}>{kaydi.productName}</td>
                                    <td style={{ ...tdStyle, textAlign: "right" as const, color: "var(--success-text)", fontWeight: 500 }}>+{formatNumber(kaydi.adet)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}
        </div>
    );
}
