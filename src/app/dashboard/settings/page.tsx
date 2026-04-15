"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import DemoBanner from "@/components/ui/DemoBanner";
import { isDemoMode } from "@/lib/demo-utils";
import { seedDelete, seedPost, alertScan } from "./actions";

type Tab = "firma" | "kullanici" | "bildirimler" | "api" | "yapay-zeka" | "demo";

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "7px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    color: "var(--text-secondary)",
    marginBottom: "4px",
    display: "block",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
};

const sectionTitle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    marginBottom: "12px",
};

function SaveButton({ onClick, loading, dirty }: { onClick: () => void; loading?: boolean; dirty?: boolean }) {
    return (
        <div style={{ marginTop: "20px", display: "flex", alignItems: "center", gap: "10px" }}>
            <Button variant="primary" size="md" onClick={onClick} loading={loading} disabled={loading}>
                Kaydet
            </Button>
            {dirty && !loading && (
                <span style={{ fontSize: "12px", color: "var(--warning-text)" }}>
                    ⚠ Kaydedilmemiş değişiklikler
                </span>
            )}
        </div>
    );
}

// ─── Firma Profili ─────────────────────────────────────────────────────────────
const initialFirmaForm = {
    name: "",
    taxOffice: "",
    taxNo: "",
    address: "",
    phone: "",
    website: "",
    currency: "USD",
};

function FirmaTab({ onDirtyChange }: { onDirtyChange?: (d: boolean) => void }) {
    const { toast } = useToast();
    const [form, setForm] = useState({ ...initialFirmaForm });
    const savedRef = useRef({ ...initialFirmaForm });
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [logoDragging, setLogoDragging] = useState(false);

    const set = (key: keyof typeof initialFirmaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const next = { ...form, [key]: e.target.value };
        setForm(next);
        const dirty = JSON.stringify(next) !== JSON.stringify(savedRef.current);
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    };

    const handleSave = async () => {
        setIsSaving(true);
        await new Promise(r => setTimeout(r, 800));
        savedRef.current = { ...form };
        setIsDirty(false);
        onDirtyChange?.(false);
        setIsSaving(false);
        toast({ type: "success", message: "Firma bilgileri kaydedildi" });
    };

    if (isDemoMode()) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Firma bilgileri yalnızca yetkili kullanıcılara gösterilir.
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Logo */}
            <div>
                <div style={sectionTitle}>Firma Logosu</div>
                <div
                    onDragOver={e => { e.preventDefault(); setLogoDragging(true); }}
                    onDragLeave={() => setLogoDragging(false)}
                    onDrop={e => { e.preventDefault(); setLogoDragging(false); }}
                    style={{
                        border: `1px dashed ${logoDragging ? "var(--accent)" : "var(--border-secondary)"}`,
                        borderRadius: "8px",
                        padding: "24px",
                        textAlign: "center",
                        background: logoDragging ? "var(--accent-bg)" : "var(--bg-tertiary)",
                        cursor: "pointer",
                        transition: "all 0.15s",
                    }}
                >
                    <div style={{ fontSize: "28px", marginBottom: "6px" }}>🏭</div>
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        Logo yüklemek için sürükleyin veya tıklayın
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        PNG, SVG · Maks 2MB
                    </div>
                </div>
            </div>

            {/* Fields grid */}
            <div>
                <div style={sectionTitle}>Firma Bilgileri</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={labelStyle}>Firma Adı</label>
                        <input style={inputStyle} value={form.name} onChange={set("name")} />
                    </div>
                    <div>
                        <label style={labelStyle}>Vergi Dairesi</label>
                        <input style={inputStyle} value={form.taxOffice} onChange={set("taxOffice")} />
                    </div>
                    <div>
                        <label style={labelStyle}>Vergi No</label>
                        <input style={inputStyle} value={form.taxNo} onChange={set("taxNo")} />
                    </div>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={labelStyle}>Adres</label>
                        <input style={inputStyle} value={form.address} onChange={set("address")} />
                    </div>
                    <div>
                        <label style={labelStyle}>Telefon</label>
                        <input style={inputStyle} value={form.phone} onChange={set("phone")} />
                    </div>
                    <div>
                        <label style={labelStyle}>Web Sitesi</label>
                        <input style={inputStyle} value={form.website} onChange={set("website")} />
                    </div>
                    <div>
                        <label style={labelStyle}>Varsayılan Para Birimi</label>
                        <select style={{ ...inputStyle }} value={form.currency} onChange={set("currency")}>
                            <option value="USD">USD — Amerikan Doları</option>
                            <option value="EUR">EUR — Euro</option>
                            <option value="TRY">TRY — Türk Lirası</option>
                        </select>
                    </div>
                </div>
            </div>

            <SaveButton onClick={handleSave} loading={isSaving} dirty={isDirty} />
        </div>
    );
}

// ─── Kullanıcı / Profil ────────────────────────────────────────────────────────
const initialProfileForm = { fullName: "", email: "" };

function KullaniciTab({ onDirtyChange }: { onDirtyChange?: (d: boolean) => void }) {
    const { toast } = useToast();
    const [form, setForm] = useState({ ...initialProfileForm });
    const savedRef = useRef({ ...initialProfileForm });
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
    const [pwError, setPwError] = useState("");

    const handleProfileFieldChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const next = { ...form, fullName: e.target.value };
        setForm(next);
        const dirty = JSON.stringify(next) !== JSON.stringify(savedRef.current);
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    };

    const handleProfileSave = async () => {
        setIsSaving(true);
        await new Promise(r => setTimeout(r, 800));
        savedRef.current = { ...form };
        setIsDirty(false);
        onDirtyChange?.(false);
        setIsSaving(false);
        toast({ type: "success", message: "Profil bilgileri güncellendi" });
    };

    const handlePwSave = () => {
        if (pwForm.next !== pwForm.confirm) {
            setPwError("Yeni şifreler eşleşmiyor.");
            toast({ type: "error", message: "Yeni şifreler eşleşmiyor" });
            return;
        }
        if (pwForm.next.length < 8) {
            setPwError("Şifre en az 8 karakter olmalı.");
            toast({ type: "error", message: "Şifre en az 8 karakter olmalı" });
            return;
        }
        setPwError("");
        setPwForm({ current: "", next: "", confirm: "" });
        toast({ type: "success", message: "Şifre başarıyla değiştirildi" });
    };

    if (isDemoMode()) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Kullanıcı bilgileri yalnızca yetkili kullanıcılara gösterilir.
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <div
                    style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "var(--accent-bg)",
                        border: "0.5px solid var(--accent-border)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "20px",
                        fontWeight: 600,
                        color: "var(--accent-text)",
                        flexShrink: 0,
                    }}
                >
                    {form.fullName.charAt(0)}
                </div>
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>{form.fullName}</div>
                    <button
                        onClick={() => toast({ type: "info", message: "Fotoğraf yükleme yakında açılacak" })}
                        style={{
                            fontSize: "11px",
                            marginTop: "3px",
                            padding: "3px 8px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "4px",
                            background: "transparent",
                            color: "var(--text-tertiary)",
                            cursor: "pointer",
                        }}
                    >
                        Fotoğraf Değiştir
                    </button>
                </div>
            </div>

            {/* Profile fields */}
            <div>
                <div style={sectionTitle}>Profil Bilgileri</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div>
                        <label style={labelStyle}>Ad Soyad</label>
                        <input
                            style={inputStyle}
                            value={form.fullName}
                            onChange={handleProfileFieldChange}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>E-posta</label>
                        <input
                            style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }}
                            value={form.email}
                            readOnly
                        />
                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                            E-posta değiştirmek için destek ile iletişime geçin
                        </div>
                    </div>
                </div>
                <SaveButton onClick={handleProfileSave} loading={isSaving} dirty={isDirty} />
            </div>

            {/* Password */}
            <div>
                <div style={sectionTitle}>Şifre Değiştir</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "400px" }}>
                    {(["current", "next", "confirm"] as const).map((key, i) => (
                        <div key={key}>
                            <label style={labelStyle}>
                                {["Mevcut Şifre", "Yeni Şifre", "Yeni Şifre (Tekrar)"][i]}
                            </label>
                            <input
                                type="password"
                                style={inputStyle}
                                value={pwForm[key]}
                                onChange={e => setPwForm(f => ({ ...f, [key]: e.target.value }))}
                                placeholder="••••••••"
                            />
                        </div>
                    ))}
                    {pwError && (
                        <div style={{ fontSize: "12px", color: "var(--danger-text)" }}>{pwError}</div>
                    )}
                </div>
                <SaveButton onClick={handlePwSave} />
            </div>
        </div>
    );
}

// ─── Bildirimler ───────────────────────────────────────────────────────────────
const initialPrefs = [
    { id: "stock-critical", label: "Kritik stok uyarıları", email: true, browser: false },
    { id: "order-pending", label: "Sipariş onay bekliyor", email: true, browser: true },
    { id: "order-new", label: "Yeni sipariş oluşturuldu", email: false, browser: true },
    { id: "sync-error", label: "Paraşüt sync hataları", email: true, browser: false },
    { id: "order-shipped", label: "Sipariş sevk edildi", email: false, browser: true },
];

function BildirimlerTab({ onDirtyChange }: { onDirtyChange?: (d: boolean) => void }) {
    const { toast } = useToast();
    const [prefs, setPrefs] = useState(initialPrefs.map(p => ({ ...p })));
    const savedRef = useRef(initialPrefs.map(p => ({ ...p })));
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const toggle = (id: string, channel: "email" | "browser") => {
        const next = prefs.map(p => p.id === id ? { ...p, [channel]: !p[channel] } : p);
        setPrefs(next);
        const dirty = JSON.stringify(next) !== JSON.stringify(savedRef.current);
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    };

    const handleSave = async () => {
        setIsSaving(true);
        await new Promise(r => setTimeout(r, 800));
        savedRef.current = prefs.map(p => ({ ...p }));
        setIsDirty(false);
        onDirtyChange?.(false);
        setIsSaving(false);
        toast({ type: "success", message: "Bildirim tercihleri kaydedildi" });
    };

    return (
        <div>
            <div style={sectionTitle}>Bildirim Kanalları</div>
            <div
                style={{
                    background: "var(--bg-secondary)",
                    border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px",
                    overflow: "hidden",
                }}
            >
                {/* Header */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 80px 80px",
                        padding: "8px 16px",
                        borderBottom: "0.5px solid var(--border-tertiary)",
                        fontSize: "10px",
                        color: "var(--text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                    }}
                >
                    <span>Olay</span>
                    <span style={{ textAlign: "center" }}>E-posta</span>
                    <span style={{ textAlign: "center" }}>Tarayıcı</span>
                </div>

                {prefs.map((p, i) => (
                    <div
                        key={p.id}
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 80px 80px",
                            padding: "12px 16px",
                            borderBottom: i < prefs.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                            alignItems: "center",
                        }}
                    >
                        <span style={{ fontSize: "13px", color: "var(--text-primary)" }}>{p.label}</span>
                        {(["email", "browser"] as const).map(channel => (
                            <div key={channel} style={{ display: "flex", justifyContent: "center" }}>
                                <button
                                    onClick={() => toggle(p.id, channel)}
                                    style={{
                                        width: "36px",
                                        height: "20px",
                                        borderRadius: "10px",
                                        border: "none",
                                        background: p[channel] ? "var(--accent)" : "var(--bg-tertiary)",
                                        cursor: "pointer",
                                        position: "relative",
                                        transition: "background 0.2s",
                                        flexShrink: 0,
                                    }}
                                >
                                    <span
                                        style={{
                                            position: "absolute",
                                            top: "2px",
                                            left: p[channel] ? "18px" : "2px",
                                            width: "16px",
                                            height: "16px",
                                            borderRadius: "50%",
                                            background: "white",
                                            transition: "left 0.2s",
                                        }}
                                    />
                                </button>
                            </div>
                        ))}
                    </div>
                ))}
            </div>
            <SaveButton onClick={handleSave} loading={isSaving} dirty={isDirty} />
        </div>
    );
}

// ─── API Anahtarları ───────────────────────────────────────────────────────────
interface KeyStatus {
    parasut: boolean;
    claude: boolean;
    vercel: boolean;
}

function ApiTab() {
    const [status, setStatus] = useState<KeyStatus | null>(null);

    useEffect(() => {
        fetch("/api/settings/api-keys-status")
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setStatus(data); })
            .catch(() => {});
    }, []);

    const entries: { id: keyof KeyStatus; label: string }[] = [
        { id: "parasut", label: "Paraşüt API" },
        { id: "claude", label: "Claude AI (Anthropic)" },
        { id: "vercel", label: "Vercel" },
    ];

    return (
        <div>
            <div style={sectionTitle}>Entegrasyon Anahtarları</div>
            <div
                style={{
                    background: "var(--bg-secondary)",
                    border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px",
                    overflow: "hidden",
                }}
            >
                {entries.map((entry, i) => {
                    const configured = status ? status[entry.id] : null;
                    return (
                        <div
                            key={entry.id}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "12px 16px",
                                borderBottom: i < entries.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                            }}
                        >
                            <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>
                                {entry.label}
                            </div>
                            <span
                                style={{
                                    fontSize: "11px",
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    background: configured === null
                                        ? "var(--bg-tertiary)"
                                        : configured
                                            ? "var(--success-bg)"
                                            : "var(--warning-bg)",
                                    color: configured === null
                                        ? "var(--text-tertiary)"
                                        : configured
                                            ? "var(--success-text)"
                                            : "var(--warning-text)",
                                }}
                            >
                                {configured === null ? "—" : configured ? "Yapılandırıldı ✓" : "Eksik"}
                            </span>
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: "10px", fontSize: "11px", color: "var(--text-tertiary)" }}>
                Anahtarlar <code>.env.local</code> üzerinden yönetilir.
            </div>
        </div>
    );
}

// ─── Yapay Zeka Metrikleri ─────────────────────────────────────────────────────

interface ObservabilityData {
    runs: {
        last7d: number;
        byFeature: Record<string, number>;
        fallbackCount: number;
    };
    recommendations: {
        byStatus: Record<string, number>;
        activeCount: number;
        decidedCount: number;
    };
    feedback: {
        last7d: Record<string, number>;
    };
    generatedAt: string;
}

const featureLabels: Record<string, string> = {
    purchase_enrich: "Satın alma",
    stock_risk: "Stok risk",
    order_score: "Sipariş skoru",
    ops_summary: "Ops özeti",
    import_parse: "Import parse",
};

function MetricRow({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
    return (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "5px 0", borderBottom: "0.5px solid var(--border-tertiary)" }}>
            <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>{label}</span>
            <span style={{ fontSize: "13px", fontWeight: 500, color: highlight ? "var(--warning-text)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{value}</span>
        </div>
    );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "6px", marginTop: "20px" }}>
            {children}
        </div>
    );
}

// ─── Demo Hazırlık Tab ─────────────────────────────────────────────────────────
function DemoTab() {
    const { toast } = useToast();
    const [step, setStep] = useState<"idle" | "deleting" | "seeding" | "scanning" | "done">("idle");

    async function runFullSetup() {
        setStep("deleting");
        try {
            await seedDelete();

            setStep("seeding");
            await seedPost();

            setStep("scanning");
            await alertScan();

            setStep("done");
            toast({ type: "success", message: "PMT demo verisi yüklendi, alertlar oluşturuldu!" });
        } catch (err) {
            setStep("idle");
            toast({ type: "error", message: err instanceof Error ? err.message : "Hata oluştu." });
        }
    }

    const stepLabel = {
        idle: null,
        deleting: "Eski veriler temizleniyor…",
        seeding: "PMT ürünleri ve müşterileri yükleniyor…",
        scanning: "Alert taraması çalıştırılıyor…",
        done: null,
    }[step];

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div>
                <div style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>
                    Demo Hazırlık
                </div>
                <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    Mevcut tüm verileri siler ve PMT Endüstriyel demo verisini yükler.
                    25 ürün, 7 müşteri ve demo alert senaryoları hazır gelir.
                </div>
            </div>

            <div style={{
                border: "0.5px solid var(--warning-border)",
                borderRadius: "8px",
                background: "var(--warning-bg)",
                padding: "12px 16px",
                fontSize: "12px",
                color: "var(--warning-text)",
            }}>
                Dikkat: Mevcut tüm sipariş, ürün ve müşteri verileri silinir. Geri alınamaz.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                <Button
                    variant="primary"
                    size="md"
                    onClick={runFullSetup}
                    loading={step !== "idle" && step !== "done"}
                    disabled={step !== "idle" && step !== "done"}
                >
                    {step === "done" ? "Tamamlandı — Tekrar Çalıştır" : "PMT Demo Verisini Yükle"}
                </Button>

                {stepLabel && (
                    <div style={{ fontSize: "12px", color: "var(--text-secondary)", paddingLeft: "2px" }}>
                        {stepLabel}
                    </div>
                )}

                {step === "done" && (
                    <div style={{ fontSize: "12px", color: "var(--success-text)", paddingLeft: "2px" }}>
                        Hazır. Dashboard'a git ve alertları gör.
                    </div>
                )}
            </div>
        </div>
    );
}

const AI_FETCH_TIMEOUT_MS = 8000;

function AiTab() {
    const [data, setData] = useState<ObservabilityData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = useCallback(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), AI_FETCH_TIMEOUT_MS);

        fetch("/api/ai/observability", { signal: controller.signal })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then((d: ObservabilityData) => setData(d))
            .catch(err => {
                setError(err.name === "AbortError"
                    ? "Zaman aşımı — sunucu yanıt vermedi."
                    : "Veriler yüklenemedi.");
            })
            .finally(() => {
                clearTimeout(timer);
                setLoading(false);
            });

        return () => { controller.abort(); clearTimeout(timer); };
    }, []);

    useEffect(() => load(), [load]);

    if (loading) {
        return <div style={{ fontSize: "13px", color: "var(--text-tertiary)", padding: "20px 0" }}>Yükleniyor…</div>;
    }
    if (error || !data) {
        return (
            <div style={{ padding: "20px 0", display: "flex", flexDirection: "column", gap: "10px" }}>
                <div style={{ fontSize: "13px", color: "var(--danger-text)" }}>
                    {error ?? "Bilinmeyen hata"}
                </div>
                <button
                    onClick={() => { setLoading(true); setError(null); load(); }}
                    style={{
                        alignSelf: "flex-start",
                        fontSize: "12px",
                        padding: "6px 14px",
                        border: "0.5px solid var(--border-secondary)",
                        borderRadius: "6px",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                    }}
                >
                    Yeniden Dene
                </button>
            </div>
        );
    }

    const { runs, recommendations, feedback } = data;
    const fallbackPct = runs.last7d > 0 ? Math.round((runs.fallbackCount / runs.last7d) * 100) : 0;
    const decidePct = (recommendations.decidedCount + recommendations.byStatus.suggested) > 0
        ? Math.round((recommendations.decidedCount / (recommendations.decidedCount + recommendations.byStatus.suggested)) * 100)
        : 0;

    return (
        <div style={{ paddingBottom: "32px" }}>
            <SectionHeader>AI Çalıştırmaları — Son 7 Gün</SectionHeader>
            <MetricRow label="Toplam çalıştırma" value={runs.last7d} />
            <MetricRow label="Fallback (model yok)" value={`${runs.fallbackCount} (%${fallbackPct})`} highlight={fallbackPct > 30} />
            {Object.entries(runs.byFeature).map(([feature, count]) => (
                <MetricRow key={feature} label={featureLabels[feature] ?? feature} value={count} />
            ))}

            <SectionHeader>Öneri Yaşam Döngüsü</SectionHeader>
            <MetricRow label="Aktif (suggested)" value={recommendations.byStatus.suggested ?? 0} />
            <MetricRow label="Kabul edildi" value={recommendations.byStatus.accepted ?? 0} />
            <MetricRow label="Düzenlendi" value={recommendations.byStatus.edited ?? 0} />
            <MetricRow label="Reddedildi" value={recommendations.byStatus.rejected ?? 0} />
            <MetricRow label="Süresi doldu" value={recommendations.byStatus.expired ?? 0} />
            <MetricRow label="Karar oranı" value={`%${decidePct}`} />

            <SectionHeader>Kullanıcı Kararları — Son 7 Gün</SectionHeader>
            <MetricRow label="Kabul" value={feedback.last7d.accepted ?? 0} />
            <MetricRow label="Düzenle" value={feedback.last7d.edited ?? 0} />
            <MetricRow label="Reddet" value={feedback.last7d.rejected ?? 0} />

            <div style={{ marginTop: "16px", fontSize: "11px", color: "var(--text-tertiary)" }}>
                Güncellendi: {new Date(data.generatedAt).toLocaleTimeString("tr-TR")}
            </div>
        </div>
    );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function SettingsPage() {
    const [activeTab, setActiveTab] = useState<Tab>("firma");
    const [dirtyTabs, setDirtyTabs] = useState<Set<Tab>>(new Set());

    const tabs: { key: Tab; label: string }[] = [
        { key: "firma", label: "Firma Profili" },
        { key: "kullanici", label: "Kullanıcı" },
        { key: "bildirimler", label: "Bildirimler" },
        { key: "api", label: "API Anahtarları" },
        { key: "yapay-zeka", label: "Yapay Zeka" },
        { key: "demo", label: "Demo Hazırlık" },
    ];

    const handleDirtyChange = (tab: Tab, isDirty: boolean) => {
        setDirtyTabs(prev => {
            const next = new Set(prev);
            if (isDirty) { next.add(tab); } else { next.delete(tab); }
            return next;
        });
    };

    const handleTabSwitch = (key: Tab) => {
        if (dirtyTabs.has(activeTab) && key !== activeTab) {
            if (!window.confirm("Kaydedilmemiş değişiklikler var. Yine de devam edilsin mi?")) return;
            setDirtyTabs(prev => { const next = new Set(prev); next.delete(activeTab); return next; });
        }
        setActiveTab(key);
    };

    return (
        <div style={{ padding: "0" }}>
            <DemoBanner storageKey="settings-demo">
                Ayarlar demo modunda çalışmaktadır. Değişiklikler sadece bu oturum için geçerlidir.
            </DemoBanner>
            {/* Header */}
            <div style={{ padding: "20px 24px 16px", borderBottom: "0.5px solid var(--border-tertiary)" }}>
                <h1 style={{ fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0 }}>
                    Ayarlar
                </h1>
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                    Sistem ve hesap tercihlerinizi yönetin
                </div>
            </div>

            {/* 2-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", minHeight: "calc(100vh - 120px)" }}>
                {/* Left tab menu */}
                <div
                    style={{
                        borderRight: "0.5px solid var(--border-tertiary)",
                        padding: "16px 0",
                        display: "flex",
                        flexDirection: "column",
                        gap: "2px",
                    }}
                >
                    {tabs.map(({ key, label }) => (
                        <button
                            key={key}
                            onClick={() => handleTabSwitch(key)}
                            style={{
                                textAlign: "left",
                                fontSize: "13px",
                                padding: "8px 16px",
                                border: "none",
                                background: activeTab === key ? "var(--accent-bg)" : "transparent",
                                color: activeTab === key ? "var(--accent-text)" : "var(--text-secondary)",
                                cursor: "pointer",
                                fontWeight: activeTab === key ? 500 : 400,
                                borderLeft: `2px solid ${activeTab === key ? "var(--accent)" : "transparent"}`,
                                transition: "all 0.1s",
                                display: "flex",
                                alignItems: "center",
                            }}
                        >
                            {label}
                            {dirtyTabs.has(key) && (
                                <span style={{
                                    display: "inline-block",
                                    width: "6px",
                                    height: "6px",
                                    borderRadius: "50%",
                                    background: "var(--warning)",
                                    marginLeft: "6px",
                                    flexShrink: 0,
                                }} />
                            )}
                        </button>
                    ))}
                </div>

                {/* Right content */}
                <div style={{ padding: "24px 28px", maxWidth: "640px" }}>
                    {activeTab === "firma" && <FirmaTab onDirtyChange={(d) => handleDirtyChange("firma", d)} />}
                    {activeTab === "kullanici" && <KullaniciTab onDirtyChange={(d) => handleDirtyChange("kullanici", d)} />}
                    {activeTab === "bildirimler" && <BildirimlerTab onDirtyChange={(d) => handleDirtyChange("bildirimler", d)} />}
                    {activeTab === "api" && <ApiTab />}
                    {activeTab === "yapay-zeka" && <AiTab />}
                    {activeTab === "demo" && <DemoTab />}
                </div>
            </div>
        </div>
    );
}
