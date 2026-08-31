"use client";

import { Fragment, Suspense, useState, useCallback, useEffect, useRef } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { fieldStyle } from "@/components/ui/Input";
import { useSearchParams } from "next/navigation";
import { useProducts, useProduction, buildLoadError } from "@/lib/data-context";
import { formatNumber, safeRandomUUID } from "@/lib/utils";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useIsDemo, DEMO_DISABLED_TOOLTIP, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import { useVoiceRecorder, type VoiceRecorderResult } from "@/hooks/useVoiceRecorder";
import type { VoiceProductionEntry } from "@/lib/services/voice-service";
import { mergeFireIntoNote } from "@/lib/voice-note-helpers";
import { CalendarDays, Mic, RotateCcw, Square, Trash2, X } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

interface FormLine {
    id: string;
    productId: string;
    adet: string;
    // KOBİ-sim Y3 — hurda/fire. Hasan 20 üretip 1'ini hurdaya ayırdı, stok TAM
    // 20 arttı; fireyi serbest nota yazmak zorunda kaldı ("ben yazmasam hiçbir
    // yerde görünmeyecekti"). Arka uç (0 ≤ scrap ≤ produced) baştan hazırdı.
    hurda: string;
    hurdaNeden: string;
    notlar: string;
    _lowConfidence?: boolean; // sesli girişten gelen, güven skoru düşük satır
    _voiceHint?: string;      // belirsiz sesli girişte Claude'un anladığı ham metin
}

function newLine(): FormLine {
    return { id: safeRandomUUID(), productId: "", adet: "", hurda: "", hurdaNeden: "", notlar: "" };
}

/**
 * Pure helper — parses ?productId=...&qty=... into a prefill FormLine.
 * Returns null if productId is missing or not in the active product set.
 * qty is accepted only if it is a positive number; non-numeric values fall back to "".
 * Faz 10 §9.4.4 — order_shortage drawer "Üretim emri başlat (yeni sekmede)" link.
 */
export function prefillLineFromQuery(
    rawProductId: string | null,
    rawQty: string | null,
    activeProductIds: Set<string>,
): FormLine | null {
    if (!rawProductId) return null;
    if (!activeProductIds.has(rawProductId)) return null;
    let qtyStr = "";
    if (rawQty && /^\d+(\.\d+)?$/.test(rawQty) && Number(rawQty) > 0) {
        qtyStr = rawQty;
    }
    return { id: safeRandomUUID(), productId: rawProductId, adet: qtyStr, hurda: "", hurdaNeden: "", notlar: "" };
}

const today = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const productionDateFormatter = new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
});

export function formatProductionDateLabel(value: string): string {
    const parts = value.split("-").map(Number);
    if (parts.length !== 3 || parts.some(part => !Number.isInteger(part))) return value;
    const [year, month, day] = parts;
    const date = new Date(year, month - 1, day);
    if (
        Number.isNaN(date.getTime())
        || date.getFullYear() !== year
        || date.getMonth() !== month - 1
        || date.getDate() !== day
    ) {
        return value;
    }
    return productionDateFormatter.format(date);
}

/**
 * KOBİ-sim O1 — kayıt saati.
 *
 * Aynı ürün için aynı gün iki kayıt olduğunda silme düğmelerinin erişilebilir
 * adı BİREBİR AYNIYDI (`${productName} üretim kaydını sil`). Ekran okuyucu,
 * klavye ve otomasyon için ayırt edilemez; Hasan yanlış kaydı silmemek için
 * vazgeçti. Saat bu ayrımı yapan tek alan.
 */
export function formatProductionTime(createdAt?: string): string {
    if (!createdAt) return "";
    const d = new Date(createdAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * KOBİ-sim O8 — hafta/ay üretim toplamları.
 *
 * Ekran yalnız GÜN ekseninde çalışıyordu: seçili gün + "diğer günler" düz
 * listesi. Vardiya sorumlusu dört ayrı denemede haftalık toplamı çıkaramadı
 * ("haftalık toplamı veremedim"). Veri zaten 120 günlük pencerede geliyor
 * (`productionFetchUrl`) — eksik olan yalnız toplayan görünümdü.
 *
 * Hafta PAZARTESİ başlar (TR iş haftası).
 */
export function donemBaslangici(bugun: string, donem: "hafta" | "ay"): string {
    const [y, m, d] = bugun.split("-").map(Number);
    const t = new Date(y, m - 1, d);
    if (donem === "ay") return `${y}-${String(m).padStart(2, "0")}-01`;
    const gun = (t.getDay() + 6) % 7;           // Pazartesi = 0
    t.setDate(t.getDate() - gun);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export function donemOzeti(
    kayitlar: { tarih: string; adet: number; scrap: number }[],
    baslangic: string,
    bitis: string,
): { adet: number; hurda: number; kalem: number } {
    let adet = 0, hurda = 0, kalem = 0;
    for (const k of kayitlar) {
        if (k.tarih < baslangic || k.tarih > bitis) continue;
        adet += k.adet;
        hurda += k.scrap;
        kalem += 1;
    }
    return { adet, hurda, kalem };
}

const inputStyle: React.CSSProperties = fieldStyle("md");

const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "9px 14px",
    fontSize: "11px",
    fontWeight: "var(--font-table-heading-weight)",
    color: "var(--text-secondary)",
    borderBottom: "var(--line-width) solid var(--surface-border)",
    textTransform: "uppercase" as const,
    letterSpacing: "0.04em",
};

const tdStyle: React.CSSProperties = {
    padding: "9px 14px",
    fontSize: "13px",
    fontWeight: "var(--font-table-cell-weight)",
    borderBottom: "var(--line-width) solid var(--border-tertiary)",
    color: "var(--text-primary)",
};

function ProductionPageInner() {
    const { products, productsError } = useProducts();
    const { uretimKayitlari, addUretimKaydi, deleteUretimKaydi, productionError } = useProduction();
    const loadError = buildLoadError([productsError, productionError], undefined);
    const { toast } = useToast();
    // Sahada telefondan kullanılan TEK ekran (2026-08-24): üç tablo da sabit
    // genişlikteydi (600/480/460px) → operatör yatay kaydırmak zorundaydı.
    const isMobile = useIsMobile();
    const isDemo = useIsDemo();
    const searchParams = useSearchParams();
    const [tarih, setTarih] = useState(() => today());
    const [lines, setLines] = useState<FormLine[]>([newLine()]);
    const [isSaving, setIsSaving] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    // KOBİ-sim Y2 — mükerrer kayıt uyarısı. Hasan 6 girip doğrusunun 8 olduğunu
    // fark edince tekrar kaydetti; sistem üzerine YAZMADI, ikinci satır EKLEDİ
    // (6+8=14, gerçek 8). Kerem aynı saatlerde olaydan habersiz stoğun 3→9→17
    // arttığını bildirdi. Ekleme davranışı doğru (üretim bir olaydır) ama
    // kullanıcı uyarılmıyordu.
    const [duplicateWarn, setDuplicateWarn] = useState<{ productName: string; mevcut: number; kalem: number } | null>(null);

    const todayStr = today();
    const selectedDateLogs = uretimKayitlari.filter(k => k.tarih === tarih);
    const otherDateLogs = uretimKayitlari.filter(k => k.tarih !== tarih);
    const isTodaySelected = tarih === todayStr;
    const isPastDateSelected = tarih < todayStr;
    const selectedDateLabel = formatProductionDateLabel(tarih);
    // O8: hafta/ay toplamları — seçili tarihe göre, bugüne kadar.
    const haftaOzet = donemOzeti(uretimKayitlari, donemBaslangici(tarih, "hafta"), tarih);
    // O8: diğer günler artık gün başlıklarıyla GRUPLU — düz liste hangi günün
    // ne ürettiğini okunur biçimde vermiyordu.
    const digerGunGruplari = Array.from(
        otherDateLogs.reduce((acc, k) => {
            const grup = acc.get(k.tarih) ?? [];
            grup.push(k);
            acc.set(k.tarih, grup);
            return acc;
        }, new Map<string, typeof otherDateLogs>()),
    ).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    const ayOzet    = donemOzeti(uretimKayitlari, donemBaslangici(tarih, "ay"), tarih);
    const [voiceTranscript, setVoiceTranscript] = useState<string | null>(null);
    const transcriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Faz 10 §9.4.4 — ?productId=...&qty=... prefill (order_shortage drawer "Üretim emri başlat")
    // Tek seferlik: ürün aktif listede yoksa veya prefill zaten uygulandıysa skip.
    const prefilledRef = useRef(false);
    useEffect(() => {
        if (prefilledRef.current) return;
        if (products.length === 0) return; // products henüz yüklenmedi
        const activeIds = new Set(products.map(p => p.id));
        const newLineEntry = prefillLineFromQuery(
            searchParams.get("productId"),
            searchParams.get("qty"),
            activeIds,
        );
        if (!newLineEntry) return;
        prefilledRef.current = true;
        setLines(prev => {
            const firstEmpty = prev.length === 1 && !prev[0].productId && !prev[0].adet;
            return firstEmpty ? [newLineEntry] : [newLineEntry, ...prev];
        });
        toast({
            type: "info",
            message: newLineEntry.adet
                ? `Eksik stok için ${newLineEntry.adet} adet üretim önerildi — kaydetmek için "Kaydet"e basın.`
                : "Eksik stok için üretim önerildi — adet girip kaydedin.",
        });
    }, [searchParams, products, toast]);

    const handleVoiceResult = useCallback(async ({ blob, filename }: VoiceRecorderResult) => {
        const formData = new FormData();
        formData.append("audio", blob, filename);
        const res = await fetch("/api/production/transcribe", { method: "POST", body: formData });
        if (!res.ok) {
            const body = await res.json().catch(() => null) as { error?: string } | null;
            throw new Error(body?.error ?? "Ses işlenemedi.");
        }
        const data = await res.json() as { text: string; entries: VoiceProductionEntry[]; sessionNote: string };
        setVoiceTranscript(data.text);

        const newLines: FormLine[] = data.entries.map(entry => ({
            id: safeRandomUUID(),
            productId: entry.productId ?? "",
            adet: entry.quantity > 0 ? String(entry.quantity) : "",
            // Sesli girişte fire ayrı alana AYRIŞTIRILMIYOR (V3 kararı: fireNotes
            // nota akıyor); operatör hurdayı formdaki kutudan girer.
            hurda: "",
            hurdaNeden: "",
            // V3: fireNotes ("fire: N adet") notlar'a doğal Türkçe akışla concat (kullanıcı kararı 2026-05-28 — UI sütunu yok)
            notlar: mergeFireIntoNote(entry.note || data.sessionNote || "", entry.fireNotes),
            _lowConfidence: entry.confidence < 0.7,
            _voiceHint: entry.productId ? undefined : (entry.productName || undefined),
        }));

        setLines(prev => {
            const hasEmptyOnly = prev.length === 1 && !prev[0].productId && !prev[0].adet;
            return hasEmptyOnly ? newLines : [...prev, ...newLines];
        });

        const count = data.entries.length;
        const anyLow = data.entries.some(e => e.confidence < 0.7);
        toast({
            type: anyLow ? "warning" : "success",
            message: count > 1
                ? `${count} ürün algılandı. Bilgileri gözden geçirin.`
                : "Sesli giriş tamamlandı. Bilgileri gözden geçirin.",
        });

        // Transkript 6 saniye sonra gizlenir (önceki timer varsa iptal et)
        if (transcriptTimerRef.current) clearTimeout(transcriptTimerRef.current);
        transcriptTimerRef.current = setTimeout(() => setVoiceTranscript(null), 6000);
    }, [toast]);

    const { isRecording, isProcessing, duration, volume, error: voiceError, startRecording, stopRecording, cancelRecording } = useVoiceRecorder(handleVoiceResult);

    // V3: Ctrl+M klavye kısayolu — mikrofon başlat/durdur
    // Cmd+M handle edilmez (macOS pencere minimize çakışması)
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (!e.ctrlKey || (e.key !== "m" && e.key !== "M")) return;
            if (e.repeat) return;                              // held-down spam guard
            if (isProcessing) return;                          // ses işleniyor → start engel (race)
            const tag = document.activeElement?.tagName;
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
            if (isDemo) return;
            e.preventDefault();
            if (isRecording) {
                stopRecording();
            } else {
                startRecording();
            }
        };
        document.addEventListener("keydown", handleKey);
        return () => document.removeEventListener("keydown", handleKey);
    }, [isRecording, isProcessing, startRecording, stopRecording, isDemo]);

    const setLineField = (id: string, field: keyof FormLine, val: string) => {
        setLines(prev => prev.map(l =>
            l.id === id
                ? { ...l, [field]: val,
                    _lowConfidence: field === "productId" ? false : l._lowConfidence,
                    _voiceHint: field === "productId" ? undefined : l._voiceHint }
                : l
        ));
    };

    const removeLine = (id: string) => {
        if (lines.length === 1) {
            setLines([newLine()]);
        } else {
            setLines(prev => prev.filter(l => l.id !== id));
        }
    };

    /**
     * KOBİ-sim Y2 — kaydetmeden önce mükerrer kontrolü.
     *
     * Seçili tarihte aynı ürün için zaten kayıt varsa kullanıcı onaylamadan
     * ikinci satır eklenmez. Düzeltme niyetiyle tekrar kaydeden operatör
     * eskiden sessizce stoğu iki katına çıkarıyordu.
     */
    const handleSave = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        const valid = lines.filter(l => l.productId && parseInt(l.adet) > 0);
        if (valid.length === 0) {
            toast({ type: "error", message: "Lütfen en az bir ürün seçin ve adet girin" });
            return;
        }
        const dupLine = valid.find(l => selectedDateLogs.some(k => k.productId === l.productId));
        if (dupLine) {
            const mevcut = selectedDateLogs
                .filter(k => k.productId === dupLine.productId)
                .reduce((sum, k) => sum + k.adet, 0);
            const product = products.find(p => p.id === dupLine.productId);
            setDuplicateWarn({
                productName: product?.name ?? "Bu ürün",
                mevcut,
                kalem: selectedDateLogs.filter(k => k.productId === dupLine.productId).length,
            });
            return;
        }
        await performSave();
    };

    const performSave = async () => {
        const valid = lines.filter(l => l.productId && parseInt(l.adet) > 0);
        const unresolved = lines.filter(l => !l.productId && parseInt(l.adet) > 0);
        if (valid.length === 0) return;
        setDuplicateWarn(null);
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
                    scrap: parseInt(line.hurda) || 0,
                    wasteReason: line.hurdaNeden.trim() || undefined,
                    tarih,
                    // KOBİ-sim O6: sabit "Usta" KALDIRILDI. Sunucu `entered_by`'ı
                    // zaten oturumdan yazıyor (`POST /api/production`); buradaki
                    // sahte değer yalnız optimistic satırda görünüp yanıltıyordu.
                    girenKullanici: "",
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
            if (unresolved.length > 0) {
                // Eşleşmeyen satırları formda tut — kullanıcı ürün seçip tekrar kaydedebilsin
                setLines(unresolved);
                toast({ type: "warning",
                    message: `${succeeded} kalem kaydedildi. ${unresolved.length} ürün eşleşmedi — ürünleri seçip tekrar kaydedin.` });
            } else {
                const msg = `${succeeded} kalem, ${totalAdet} adet üretim kaydedildi — stok güncellendi`;
                toast({ type: "success", message: refetchWarning ? msg + " (veri gecikmeli yüklenebilir)" : msg });
                setLines([newLine()]);
            }
        } else if (succeeded > 0 && failed > 0) {
            // firstError (örn. BOM eksik-bileşen detayı) kısmi dalda da gösterilir —
            // aksi halde çok-satırlı partide zengin hata mesajı sessizce kaybolurdu.
            const detail = firstError ? ` ${firstError}` : "";
            toast({ type: "warning", message: `${succeeded} kayıt başarılı, ${failed} kayıt başarısız.${detail} Başarısız satırları kontrol edin.` });
            setLines(prev => prev.filter(l => failedLineIds.includes(l.id)));
        } else {
            toast({ type: "error", message: firstError ?? "Hiçbir kayıt oluşturulamadı. Lütfen tekrar deneyin." });
        }

        setIsSaving(false);
    };

    const canSave = lines.some(l => l.productId && parseInt(l.adet) > 0);

    // Üretim kaydı silme = stok ters hareketi (bitmiş ürün düşer + BOM bileşenleri
    // geri yüklenir). Tek tıkla sessiz mutasyon riskine karşı onay modalından geçer.
    const performDelete = async (id: string) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (deletingId) return;
        setDeletingId(id);
        try {
            await deleteUretimKaydi(id);
            toast({ type: "success", message: "Üretim kaydı silindi" });
            setConfirmDeleteId(null);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Kayıt silinemedi.";
            toast({ type: "error", message: msg });
        } finally {
            setDeletingId(null);
        }
    };

    // Ses kaydı hatası — toast olarak göster (sadece yeni hata gelince)
    const prevVoiceErrorRef = useRef<string | null>(null);
    useEffect(() => {
        if (voiceError && voiceError !== prevVoiceErrorRef.current) {
            prevVoiceErrorRef.current = voiceError;
            toast({ type: "error", message: voiceError });
        }
    }, [voiceError, toast]);

    // Unmount'ta transcript timer'ı temizle
    useEffect(() => {
        const ref = transcriptTimerRef;
        return () => { if (ref.current) clearTimeout(ref.current); };
    }, []);

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
            {/* Header — `align="start"`: sağdaki blok çok satırlı (tarih seçici +
                düğme + durum satırı), `center` başlığı aşağı kaydırırdı. */}
            <PageHeader
                title="Üretim Girişi"
                subtitle="Günlük üretim miktarlarını girerek stoğu güncelle"
                align="start"
                actions={<div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "7px", maxWidth: "100%" }}>
                    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "flex-end", flexWrap: "wrap", gap: "8px" }}>
                        <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <span style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                fontSize: "10.5px",
                                fontWeight: 650,
                                color: "var(--text-secondary)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                            }}>
                                <CalendarDays size={12} aria-hidden="true" />
                                Kayıt Tarihi
                            </span>
                            <input
                                type="date"
                                value={tarih}
                                max={todayStr}
                                onChange={e => setTarih(!e.target.value || e.target.value > todayStr ? todayStr : e.target.value)}
                                aria-label="Kayıt tarihi"
                                style={{ ...inputStyle, width: "150px", minHeight: "36px" }}
                            />
                        </label>
                        {!isTodaySelected && (
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<RotateCcw size={13} />}
                                onClick={() => setTarih(todayStr)}
                            >
                                Bugüne Dön
                            </Button>
                        )}
                    </div>
                    {isPastDateSelected && (
                        <output
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "5px 8px",
                                border: "var(--line-width) solid var(--warning-border)",
                                borderRadius: "6px",
                                background: "var(--warning-bg)",
                                color: "var(--warning-text)",
                                fontSize: "11px",
                                lineHeight: 1.35,
                            }}
                        >
                            <CalendarDays size={12} aria-hidden="true" style={{ flexShrink: 0 }} />
                            Geçmiş tarih seçili. Kaydedilen üretim stoğu şimdi günceller.
                        </output>
                    )}
                </div>}
            />

            {/* Form */}
            <div style={{
                background: "var(--surface-raised)",
                border: "var(--line-width) solid var(--surface-border)",
                borderRadius: "6px",
                overflow: "hidden",
                boxShadow: "var(--surface-shadow-sm)",
            }}>
                <div style={{
                    padding: "12px 16px",
                    borderBottom: "var(--line-width) solid var(--surface-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                        Üretim Kalemleri
                    </div>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                        {/* Kayıt aktif: seviye göstergesi + süre + kontrollü aksiyonlar */}
                        {isRecording && (
                            <div
                                aria-live="polite"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    padding: "4px 5px 4px 10px",
                                    border: "var(--line-width) solid var(--danger-border)",
                                    borderRadius: "8px",
                                    background: "var(--danger-bg)",
                                }}
                            >
                                <span aria-hidden="true" style={{ display: "flex", gap: "2px", alignItems: "flex-end", height: "17px" }}>
                                    {[0.5, 0.75, 1, 0.75, 0.5].map((scale, i) => {
                                        const h = Math.max(3, Math.round((volume / 220) * 18 * scale));
                                        return (
                                            <span key={i} style={{
                                                display: "inline-block", width: "3px", height: `${h}px`,
                                                background: "var(--danger)", borderRadius: "2px",
                                            }} />
                                        );
                                    })}
                                </span>
                                <span className="mono" style={{ minWidth: "34px", fontSize: "11.5px", fontWeight: 650, color: "var(--danger-text)" }}>
                                    {String(Math.floor(duration / 60)).padStart(2, "0")}:{String(duration % 60).padStart(2, "0")}
                                </span>
                                <Button
                                    variant="dangerSoft"
                                    size="xs"
                                    leftIcon={<Square size={11} fill="currentColor" />}
                                    onClick={stopRecording}
                                >
                                    Kaydı Bitir
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="xs"
                                    iconOnly
                                    leftIcon={<X size={13} />}
                                    onClick={cancelRecording}
                                    aria-label="Ses kaydını iptal et"
                                    title="İptal et"
                                />
                            </div>
                        )}
                        {/* İşleniyor */}
                        {isProcessing && !isRecording && (
                            <Button variant="secondary" size="sm" loading disabled>
                                Ses İşleniyor
                            </Button>
                        )}
                        {/* Hazır: sesli giriş butonu */}
                        {!isRecording && !isProcessing && (
                            <Button
                                variant="secondary"
                                size="sm"
                                leftIcon={<Mic size={14} />}
                                onClick={isDemo ? () => toast({ type: "info", message: DEMO_BLOCK_TOAST }) : startRecording}
                                disabled={isDemo}
                                title={isDemo ? DEMO_DISABLED_TOOLTIP : "Sesli üretim girişi (90sn max) — Klavyeden Ctrl+M ile de başlatabilirsiniz"}
                            >
                                Sesli Giriş
                            </Button>
                        )}
                    </div>
                </div>

                {/* Transkript gösterimi — sesli giriş sonrası 6sn görünür */}
                {voiceTranscript && (
                    <div style={{
                        padding: "8px 16px",
                        borderBottom: "var(--line-width) solid var(--border-tertiary)",
                        fontSize: "12px",
                        color: "var(--text-secondary)",
                        background: "var(--surface-subtle)",
                        display: "flex", alignItems: "center", gap: "6px",
                    }}>
                        <Mic size={13} strokeWidth={1.8} aria-hidden="true" style={{ flexShrink: 0, color: "var(--accent-text)" }} />
                        <span>&ldquo;{voiceTranscript}&rdquo;</span>
                    </div>
                )}

                {/* Dar ekran: tablo yerine kart listesi (2026-08-24).
                    Operatörün sahada telefondan doldurduğu asıl alan burası;
                    5 kolonu 390px'e sıkıştırmak yerine alanlar alt alta iner.
                    Tüm handler'lar, aria-label'lar ve sesli-giriş ipuçları aynı. */}
                {isMobile ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "12px 14px" }}>
                        {lines.map((line, idx) => {
                            const selectedProduct = products.find(p => p.id === line.productId);
                            return (
                                <div
                                    key={line.id}
                                    style={{
                                        border: "var(--line-width) solid var(--border-tertiary)",
                                        borderRadius: "8px", padding: "10px 12px",
                                        background: line._lowConfidence ? "var(--warning-bg)" : "var(--bg-primary)",
                                        display: "flex", flexDirection: "column", gap: "8px",
                                    }}
                                >
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontWeight: 600 }}>
                                            {idx + 1}. kalem
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => removeLine(line.id)}
                                            aria-label={`${idx + 1}. satırı kaldır`}
                                            style={{
                                                fontSize: "18px", color: "var(--danger-text)", background: "transparent",
                                                border: "none", cursor: "pointer", lineHeight: 1, padding: "2px 6px",
                                            }}
                                        >×</button>
                                    </div>

                                    <select
                                        value={line.productId}
                                        onChange={e => setLineField(line.id, "productId", e.target.value)}
                                        aria-label={`${idx + 1}. satır ürün`}
                                        style={inputStyle}
                                    >
                                        <option value="" disabled>Ürün seç...</option>
                                        {products.filter(p => p.isActive).map(p => (
                                            <option key={p.id} value={p.id}>{p.sku} — {p.name}</option>
                                        ))}
                                    </select>
                                    {selectedProduct && (
                                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "-4px" }}>
                                            Satılabilir: {formatNumber(selectedProduct.available_now)} {selectedProduct.unit}{selectedProduct.on_hand !== selectedProduct.available_now && ` · stokta ${formatNumber(selectedProduct.on_hand)}`}
                                        </div>
                                    )}
                                    {line._voiceHint && !line.productId && (
                                        <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "-4px" }}>
                                            Sesli: &ldquo;{line._voiceHint}&rdquo; — listeden ürün seçin
                                        </div>
                                    )}
                                    {line._lowConfidence && (
                                        <div style={{ fontSize: "11px", color: "var(--warning-text)", marginTop: "-4px" }}>
                                            ⚠ Sesli giriş düşük güvenle eşleşti — kontrol edin
                                        </div>
                                    )}

                                    <div style={{ display: "flex", gap: "8px" }}>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min={1}
                                            value={line.adet}
                                            onChange={e => setLineField(line.id, "adet", e.target.value)}
                                            placeholder="Adet"
                                            aria-label={`${idx + 1}. satır adet`}
                                            style={{ ...inputStyle, width: "96px", textAlign: "right" }}
                                        />
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={parseInt(line.adet) || undefined}
                                            value={line.hurda}
                                            onChange={e => setLineField(line.id, "hurda", e.target.value)}
                                            placeholder="Hurda"
                                            aria-label={`${idx + 1}. satır hurda adedi`}
                                            style={{ ...inputStyle, width: "84px", textAlign: "right" }}
                                        />
                                        <input
                                            type="text"
                                            value={line.notlar}
                                            onChange={e => setLineField(line.id, "notlar", e.target.value)}
                                            placeholder="Not (opsiyonel)"
                                            aria-label={`${idx + 1}. satır not`}
                                            style={{ ...inputStyle, flex: 1 }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (

                <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", ...(isMobile ? {} : { minWidth: "600px" }) }}>
                    <thead>
                        <tr style={{ background: "var(--table-header-bg)" }}>
                            <th style={{ ...thStyle, width: "34px" }}>#</th>
                            <th style={thStyle}>Ürün</th>
                            <th style={{ ...thStyle, width: "90px", textAlign: "right" as const }}>Adet</th>
                            {/* KOBİ-sim Y3 — hurda/fire. Stok üretilen'den hurda
                                düşülerek artar; eskiden fire hiçbir yerde yoktu. */}
                            <th style={{ ...thStyle, width: "84px", textAlign: "right" as const }}>Hurda</th>
                            <th style={thStyle}>Not</th>
                            <th style={{ ...thStyle, width: "34px" }} aria-label="Satır işlemleri"></th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line, idx) => {
                            const selectedProduct = products.find(p => p.id === line.productId);
                            return (
                                <tr key={line.id} style={{ borderBottom: "var(--line-width) solid var(--border-tertiary)", background: line._lowConfidence ? "var(--warning-bg)" : undefined }}>
                                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px", textAlign: "center" }}>
                                        {idx + 1}
                                    </td>
                                    <td style={{ ...tdStyle, minWidth: "260px" }}>
                                        <select
                                            value={line.productId}
                                            onChange={e => setLineField(line.id, "productId", e.target.value)}
                                            aria-label={`${idx + 1}. satır ürün`}
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
                                                Satılabilir: {formatNumber(selectedProduct.available_now)} {selectedProduct.unit}{selectedProduct.on_hand !== selectedProduct.available_now && ` · stokta ${formatNumber(selectedProduct.on_hand)}`}
                                            </div>
                                        )}
                                        {line._voiceHint && !line.productId && (
                                            <div style={{ fontSize: "11px", color: "var(--text-secondary)", marginTop: "3px" }}>
                                                Sesli: &ldquo;{line._voiceHint}&rdquo; — listeden ürün seçin
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
                                            inputMode="numeric"
                                            min={1}
                                            value={line.adet}
                                            onChange={e => setLineField(line.id, "adet", e.target.value)}
                                            placeholder="0"
                                            aria-label={`${idx + 1}. satır adet`}
                                            style={{ ...inputStyle, textAlign: "right", width: "80px" }}
                                        />
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right" as const }}>
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min={0}
                                            max={parseInt(line.adet) || undefined}
                                            value={line.hurda}
                                            onChange={e => setLineField(line.id, "hurda", e.target.value)}
                                            placeholder="0"
                                            aria-label={`${idx + 1}. satır hurda adedi`}
                                            style={{ ...inputStyle, textAlign: "right", width: "74px" }}
                                        />
                                    </td>
                                    <td style={tdStyle}>
                                        <input
                                            type="text"
                                            value={line.notlar}
                                            onChange={e => setLineField(line.id, "notlar", e.target.value)}
                                            placeholder="Not (opsiyonel)"
                                            aria-label={`${idx + 1}. satır not`}
                                            style={inputStyle}
                                        />
                                        {(parseInt(line.hurda) || 0) > 0 && (
                                            <input
                                                type="text"
                                                value={line.hurdaNeden}
                                                onChange={e => setLineField(line.id, "hurdaNeden", e.target.value)}
                                                placeholder="Fire nedeni"
                                                aria-label={`${idx + 1}. satır fire nedeni`}
                                                style={{ ...inputStyle, marginTop: "4px", fontSize: "12px" }}
                                            />
                                        )}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "center" as const }}>
                                        <button
                                            type="button"
                                            onClick={() => removeLine(line.id)}
                                            aria-label={`${idx + 1}. satırı kaldır`}
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
                )}

                <div style={{ padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "space-between", alignItems: "center" }}>
                    <button
                        type="button"
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

            {/* KOBİ-sim O8 — dönem özeti.
                Ekran yalnız gün ekseninde çalışıyordu; vardiya sorumlusu dört
                ayrı denemede haftalık/aylık toplamı çıkaramadı. Veri zaten 120
                günlük pencerede geliyordu, eksik olan toplayan görünümdü. */}
            <div style={{
                display: "grid",
                gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, minmax(0, 1fr))",
                gap: "8px",
            }}>
                {([
                    ["Bu hafta", haftaOzet],
                    ["Bu ay", ayOzet],
                ] as const).flatMap(([etiket, ozet]) => [
                    <div key={`${etiket}-adet`} style={{
                        background: "var(--surface-raised)",
                        border: "var(--line-width) solid var(--surface-border)",
                        borderRadius: "6px", padding: "10px 12px",
                        boxShadow: "var(--surface-shadow-sm)",
                    }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{etiket} üretim</div>
                        <div style={{ fontSize: "17px", fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                            {formatNumber(ozet.adet)}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{ozet.kalem} kalem</div>
                    </div>,
                    <div key={`${etiket}-hurda`} style={{
                        background: "var(--surface-raised)",
                        border: "var(--line-width) solid var(--surface-border)",
                        borderRadius: "6px", padding: "10px 12px",
                        boxShadow: "var(--surface-shadow-sm)",
                    }}>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>{etiket} hurda</div>
                        <div style={{
                            fontSize: "17px", fontWeight: 600, fontVariantNumeric: "tabular-nums",
                            color: ozet.hurda > 0 ? "var(--danger-text)" : "var(--text-secondary)",
                        }}>
                            {formatNumber(ozet.hurda)}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            {ozet.adet > 0 ? `%${((ozet.hurda / ozet.adet) * 100).toFixed(1)} fire` : "—"}
                        </div>
                    </div>,
                ])}
            </div>

            {/* Selected date log */}
            <div style={{
                background: "var(--surface-raised)",
                border: "var(--line-width) solid var(--surface-border)",
                borderRadius: "6px",
                overflow: "hidden",
                boxShadow: "var(--surface-shadow-sm)",
            }}>
                <div style={{
                    padding: "12px 16px",
                    borderBottom: "var(--line-width) solid var(--surface-border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "8px",
                    flexWrap: "wrap",
                }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                        {isTodaySelected ? "Bugünkü Üretim Kayıtları" : `${selectedDateLabel} Üretim Kayıtları`}
                    </div>
                    {selectedDateLogs.length > 0 && (
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            Toplam: {selectedDateLogs.reduce((s, k) => s + k.adet, 0).toLocaleString("tr-TR")} adet · {selectedDateLogs.length} kalem
                        </div>
                    )}
                </div>

                {selectedDateLogs.length === 0 ? (
                    <div style={{ padding: "24px 16px", textAlign: "center", fontSize: "13px", color: "var(--text-tertiary)" }}>
                        {isTodaySelected ? "Bugün henüz üretim kaydı girilmedi" : "Seçili tarihte üretim kaydı bulunmuyor"}
                    </div>
                ) : (
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", ...(isMobile ? {} : { minWidth: "480px" }) }}>
                        <thead>
                            <tr style={{ background: "var(--table-header-bg)" }}>
                                {/* Dar ekranda SKU ve Not gizlenir: ürün adı zaten var,
                                    telefonda yer daralınca öncelik adet ve silme. */}
                                {!isMobile && <th style={thStyle}>SKU</th>}
                                <th style={thStyle}>Ürün</th>
                                <th style={{ ...thStyle, textAlign: "right" as const }}>Üretilen Adet</th>
                                {/* KOBİ-sim Y3 — fire artık görünür (yoksa stok
                                    sistematik olarak fazla görünüyordu). */}
                                {!isMobile && <th style={{ ...thStyle, textAlign: "right" as const }}>Hurda</th>}
                                {/* KOBİ-sim O6 — kaydı kimin girdiği sunucuda zaten
                                    yazılıyordu (entered_by), ekranda hiç yoktu. */}
                                {!isMobile && <th style={thStyle}>Giren</th>}
                                {!isMobile && <th style={thStyle}>Saat</th>}
                                {!isMobile && <th style={thStyle}>Not</th>}
                                <th style={{ ...thStyle, width: "34px" }} aria-label="Kayıt işlemleri"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {selectedDateLogs.map(kaydi => (
                                <tr key={kaydi.id} style={{ borderBottom: "var(--line-width) solid var(--border-tertiary)" }}>
                                    {!isMobile && <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{kaydi.productSku}</td>}
                                    <td style={{ ...tdStyle, fontWeight: 500 }}>
                                        {kaydi.productName}
                                        {/* Gizlenen kolonların bilgisi kaybolmasın: dar ekranda
                                            SKU ve not ürün adının altına iner. */}
                                        {isMobile && (
                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                {[
                                                    kaydi.productSku,
                                                    formatProductionTime(kaydi.createdAt),
                                                    kaydi.scrap > 0 ? `hurda ${formatNumber(kaydi.scrap)}` : "",
                                                    kaydi.notlar,
                                                ].filter(Boolean).join(" · ")}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right" as const, fontWeight: 600, color: "var(--success-text)" }}>
                                        +{formatNumber(kaydi.adet)}
                                    </td>
                                    {!isMobile && (
                                        <td style={{
                                            ...tdStyle, textAlign: "right" as const,
                                            color: kaydi.scrap > 0 ? "var(--danger-text)" : "var(--text-tertiary)",
                                            fontWeight: kaydi.scrap > 0 ? 600 : 400,
                                        }}>
                                            {kaydi.scrap > 0 ? formatNumber(kaydi.scrap) : "—"}
                                        </td>
                                    )}
                                    {!isMobile && (
                                        <td style={{ ...tdStyle, color: "var(--text-secondary)", fontSize: "12px" }}>
                                            {kaydi.girenKullanici || "—"}
                                        </td>
                                    )}
                                    {!isMobile && (
                                        <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px" }}>
                                            {formatProductionTime(kaydi.createdAt) || "—"}
                                        </td>
                                    )}
                                    {!isMobile && <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px" }}>
                                        {kaydi.notlar || "—"}
                                        {kaydi.scrap > 0 && kaydi.wasteReason && (
                                            <div style={{ fontSize: "11px", color: "var(--danger-text)", marginTop: "2px" }}>
                                                Fire: {kaydi.wasteReason}
                                            </div>
                                        )}
                                    </td>}
                                    <td style={{ ...tdStyle, textAlign: "center" as const }}>
                                        <Button
                                            variant="dangerSoft"
                                            size="xs"
                                            iconOnly
                                            leftIcon={<Trash2 size={13} />}
                                            onClick={() => {
                                                if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
                                                if (deletingId) return;
                                                setConfirmDeleteId(kaydi.id);
                                            }}
                                            disabled={isDemo || deletingId === kaydi.id}
                                            aria-label={[
                                                kaydi.productName,
                                                `${kaydi.adet} adet`,
                                                formatProductionTime(kaydi.createdAt),
                                            ].filter(Boolean).join(" · ") + " üretim kaydını sil"}
                                            title={isDemo ? DEMO_DISABLED_TOOLTIP : "Kaydı sil (stok geri alınır)"}
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
            </div>

            {/* Other date logs */}
            {otherDateLogs.length > 0 && (
                <div style={{
                    background: "var(--surface-raised)",
                    border: "var(--line-width) solid var(--surface-border)",
                    borderRadius: "6px",
                    overflow: "hidden",
                    boxShadow: "var(--surface-shadow-sm)",
                }}>
                    <div style={{ padding: "12px 16px", borderBottom: "var(--line-width) solid var(--surface-border)" }}>
                        <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                            Diğer Günlerin Kayıtları
                        </div>
                        <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                            Bir kaydı düzeltmek için satıra tıklayın — o güne geçilir.
                        </div>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", ...(isMobile ? {} : { minWidth: "460px" }) }}>
                        <thead>
                            <tr style={{ background: "var(--table-header-bg)" }}>
                                <th style={thStyle}>Tarih</th>
                                {!isMobile && <th style={thStyle}>SKU</th>}
                                <th style={thStyle}>Ürün</th>
                                <th style={{ ...thStyle, textAlign: "right" as const }}>Adet</th>
                            </tr>
                        </thead>
                        <tbody>
                            {digerGunGruplari.map(([gun, kayitlar]) => (
                            <Fragment key={gun}>
                                <tr style={{ background: "var(--table-header-bg)" }}>
                                    <td colSpan={isMobile ? 3 : 4} style={{
                                        ...tdStyle, fontSize: "11.5px", fontWeight: 600,
                                        color: "var(--text-secondary)",
                                    }}>
                                        {formatProductionDateLabel(gun)}
                                        <span style={{ fontWeight: 400, color: "var(--text-tertiary)" }}>
                                            {" · "}{formatNumber(kayitlar.reduce((t, k) => t + k.adet, 0))} adet
                                            {" · "}{kayitlar.length} kalem
                                        </span>
                                    </td>
                                </tr>
                                {kayitlar.map(kaydi => (
                                /* A2: geri alma (reverse_production) YALNIZ seçili günün
                                   listesinde vardı — kullanıcı hatalı kaydı burada görüyor
                                   ama üzerinde hiçbir şey yapamıyordu. Silme butonunu buraya
                                   da koymak BOZUK olurdu: onay modalı hedefi `selectedDateLogs`
                                   içinde arıyor. Bunun yerine satır o güne geçirir → mevcut
                                   tek onaylı silme akışı devralır (tek yıkıcı yüzey korunur). */
                                <tr
                                    key={kaydi.id}
                                    onClick={() => setTarih(kaydi.tarih)}
                                    tabIndex={0}
                                    aria-label={`${kaydi.tarih} tarihine geç — ${kaydi.productName}`}
                                    onKeyDown={e => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            setTarih(kaydi.tarih);
                                        }
                                    }}
                                    style={{ borderBottom: "var(--line-width) solid var(--border-tertiary)", cursor: "pointer" }}>
                                    <td style={{ ...tdStyle, color: "var(--text-tertiary)", fontSize: "12px" }}>{kaydi.tarih}</td>
                                    {!isMobile && <td style={{ ...tdStyle, color: "var(--text-secondary)" }}>{kaydi.productSku}</td>}
                                    <td style={tdStyle}>
                                        {kaydi.productName}
                                        {isMobile && (
                                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                                {kaydi.productSku}
                                            </div>
                                        )}
                                    </td>
                                    <td style={{ ...tdStyle, textAlign: "right" as const, color: "var(--success-text)", fontWeight: 500 }}>+{formatNumber(kaydi.adet)}</td>
                                </tr>
                                ))}
                            </Fragment>
                            ))}
                        </tbody>
                    </table>
                    </div>
                </div>
            )}

            {/* KOBİ-sim Y2 — mükerrer üretim kaydı uyarısı.
                Hasan 6 girdi, doğrusu 8'di, tekrar kaydetti → sistem ÜZERİNE
                YAZMADI, ikinci satır EKLEDİ (6+8=14, gerçek 8). Ekleme davranışı
                doğru (üretim bir olaydır, revizyon değil) ama sessizdi; tek
                düzeltme yolu silmekti ve silme de ayırt edilemiyordu (O1). */}
            {duplicateWarn && (
                <Modal
                    onClose={() => setDuplicateWarn(null)}
                    labelledBy="duplicate-production-title"
                    width="min(440px, calc(100vw - 32px))"
                    surfaceStyle={{ borderRadius: "8px", gap: "12px" }}
                >
                        <div id="duplicate-production-title" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                            Bu ürün için bugün zaten kayıt var
                        </div>
                        <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.55 }}>
                            <strong>{duplicateWarn.productName}</strong> için {selectedDateLabel} tarihinde
                            {" "}{duplicateWarn.kalem} kayıt var, toplam <strong>{formatNumber(duplicateWarn.mevcut)} adet</strong>.
                            <br /><br />
                            Kaydetmeye devam ederseniz <strong>yeni bir kayıt EKLENİR</strong> — mevcut kayıt
                            güncellenmez, adetler toplanır. Hatalı bir kaydı düzeltmek istiyorsanız
                            önce onu silin (aşağıdaki listeden), sonra doğrusunu girin.
                        </div>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                            <Button variant="secondary" onClick={() => setDuplicateWarn(null)}>
                                Vazgeç
                            </Button>
                            <Button onClick={() => void performSave()}>
                                Yeni kayıt olarak ekle
                            </Button>
                        </div>
                </Modal>
            )}

            {/* Silme onay modalı — stok ters hareketi geri-dönüşü zor olduğundan
                tek tıkla silmeyi engeller (role=dialog + aria-modal, PO precedent) */}
            {confirmDeleteId && (() => {
                const target = selectedDateLogs.find(k => k.id === confirmDeleteId);
                if (!target) return null;
                const busy = deletingId === confirmDeleteId;
                return (
                    <Modal
                        onClose={() => setConfirmDeleteId(null)}
                        labelledBy="delete-production-title"
                        width="min(400px, calc(100vw - 32px))"
                        dismissible={!busy}
                        surfaceStyle={{ borderRadius: "8px", gap: "12px" }}
                    >
                            <div id="delete-production-title" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                                Üretim kaydını sil
                            </div>
                            <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
                                <strong>{target.productName}</strong> · +{formatNumber(target.adet)} {target.productSku}
                                {/* O1: aynı gün aynı üründen birden fazla kayıt olabilir —
                                    onay penceresi HANGİSİ olduğunu söylemeliydi. */}
                                {formatProductionTime(target.createdAt) && (
                                    <> · saat {formatProductionTime(target.createdAt)}</>
                                )}
                                {target.scrap > 0 && <> · hurda {formatNumber(target.scrap)}</>}
                                <br />
                                Bu kaydı silmek bitmiş ürün stoğunu düşürür ve BOM bileşenlerini geri yükler. Bu işlem geri alınamaz.
                            </div>
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" }}>
                                <Button
                                    variant="secondary"
                                    onClick={() => setConfirmDeleteId(null)}
                                    disabled={busy}
                                >
                                    Vazgeç
                                </Button>
                                <Button
                                    variant="danger"
                                    leftIcon={<Trash2 size={14} />}
                                    onClick={() => void performDelete(confirmDeleteId)}
                                    disabled={busy}
                                >
                                    {busy ? "Siliniyor..." : "Evet, sil (stok geri alınır)"}
                                </Button>
                            </div>
                    </Modal>
                );
            })()}
        </div>
    );
}

export default function ProductionPage() {
    return (
        <Suspense fallback={<div style={{ padding: 20, color: "var(--text-secondary)" }}>Yükleniyor…</div>}>
            <ProductionPageInner />
        </Suspense>
    );
}
