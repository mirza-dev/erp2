"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import DemoBanner from "@/components/ui/DemoBanner";
import { isDemoMode, DEMO_BLOCK_TOAST } from "@/lib/demo-utils";
import ResetDemoSection from "@/components/settings/ResetDemoSection";
import { isValidEmail, isValidTaxNumber, isValidUrl } from "@/lib/validation";
import { NOTIFICATION_TYPES, type NotificationTypeKey } from "@/lib/notification-types";
import type { UserProfile } from "@/lib/supabase/user-profile";
import type { NotificationPref } from "@/lib/supabase/user-preferences";

type Tab = "firma" | "kullanici" | "bildirimler" | "api" | "yapay-zeka";

const inputStyle: React.CSSProperties = {
    fontSize: "13px",
    padding: "7px 10px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
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

function FieldError({ msg }: { msg: string }) {
    return (
        <div style={{ fontSize: "11px", color: "var(--danger-text)", marginTop: "4px" }}>
            {msg}
        </div>
    );
}

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
    email: "",
    website: "",
    currency: "USD",
};

function FirmaTab({ onDirtyChange }: { onDirtyChange?: (d: boolean) => void }) {
    const { toast } = useToast();
    const [form, setForm] = useState({ ...initialFirmaForm });
    const savedRef = useRef({ ...initialFirmaForm });
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [logoUrl, setLogoUrl] = useState<string | null>(null);
    const [logoDragging, setLogoDragging] = useState(false);
    const [logoUploading, setLogoUploading] = useState(false);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof typeof initialFirmaForm, string>>>({});
    const logoFileRef = useRef<HTMLInputElement>(null);

    // Yükle: DB'den mevcut ayarları çek
    useEffect(() => {
        fetch("/api/settings/company")
            .then(r => r.ok ? r.json() : null)
            .then(s => {
                if (!s) return;
                const loaded = {
                    name: s.name ?? "",
                    taxOffice: s.tax_office ?? "",
                    taxNo: s.tax_no ?? "",
                    address: s.address ?? "",
                    phone: s.phone ?? "",
                    email: s.email ?? "",
                    website: s.website ?? "",
                    currency: s.currency ?? "USD",
                };
                setForm(loaded);
                savedRef.current = loaded;
                if (s.logo_url) setLogoUrl(s.logo_url);
            })
            .catch(() => {/* ağ hatası — varsayılanlarla devam et */})
            .finally(() => setIsLoading(false));
    }, []);

    const set = (key: keyof typeof initialFirmaForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const next = { ...form, [key]: e.target.value };
        setForm(next);
        const dirty = JSON.stringify(next) !== JSON.stringify(savedRef.current);
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
        // Tek alanda yazarken sadece o alanın hatasını temizle (diğer hatalar görünür kalır)
        if (fieldErrors[key]) setFieldErrors(p => ({ ...p, [key]: undefined }));
    };

    const validate = (): boolean => {
        const errors: Partial<Record<keyof typeof initialFirmaForm, string>> = {};
        if (!form.name.trim()) errors.name = "Firma adı zorunludur.";
        if (form.email && !isValidEmail(form.email)) errors.email = "Geçerli bir e-posta girin.";
        if (form.taxNo && !isValidTaxNumber(form.taxNo)) errors.taxNo = "Vergi numarası 10 veya 11 hane olmalı.";
        if (form.website && !isValidUrl(form.website)) errors.website = "Geçerli bir web adresi girin.";
        setFieldErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) {
            toast({ type: "error", message: "Lütfen hatalı alanları düzeltin." });
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch("/api/settings/company", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    tax_office: form.taxOffice,
                    tax_no: form.taxNo,
                    address: form.address,
                    phone: form.phone,
                    email: form.email,
                    website: form.website,
                    currency: form.currency,
                }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => null);
                throw new Error(errBody?.error ?? "Kayıt başarısız. Tekrar deneyin.");
            }
            savedRef.current = { ...form };
            setIsDirty(false);
            onDirtyChange?.(false);
            toast({ type: "success", message: "Firma bilgileri kaydedildi" });
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Kayıt başarısız. Tekrar deneyin." });
        } finally {
            setIsSaving(false);
        }
    };

    const handleLogoFile = async (file: File) => {
        setLogoUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/settings/company/logo", { method: "POST", body: fd });
            if (!res.ok) {
                const { error } = await res.json().catch(() => ({ error: "Yükleme başarısız." }));
                throw new Error(error ?? "Yükleme başarısız.");
            }
            const { logo_url } = await res.json();
            setLogoUrl(logo_url);
            toast({ type: "success", message: "Logo yüklendi" });
        } catch (e: unknown) {
            toast({ type: "error", message: e instanceof Error ? e.message : "Logo yüklenemedi." });
        } finally {
            setLogoUploading(false);
        }
    };

    if (isDemoMode()) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Firma bilgileri yalnızca yetkili kullanıcılara gösterilir.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Yükleniyor…
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Logo */}
            <div>
                <div style={sectionTitle}>Firma Logosu</div>
                <input
                    ref={logoFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoFile(f); e.target.value = ""; }}
                />
                <div
                    onClick={() => logoFileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setLogoDragging(true); }}
                    onDragLeave={() => setLogoDragging(false)}
                    onDrop={e => {
                        e.preventDefault();
                        setLogoDragging(false);
                        const f = e.dataTransfer.files[0];
                        if (f) handleLogoFile(f);
                    }}
                    style={{
                        border: `1px dashed ${logoDragging ? "var(--accent)" : "var(--border-secondary)"}`,
                        borderRadius: "8px",
                        padding: "20px 24px",
                        textAlign: "center",
                        background: logoDragging ? "var(--accent-bg)" : "var(--bg-tertiary)",
                        cursor: "pointer",
                        transition: "border-color 0.15s, background 0.15s",
                        display: "flex",
                        alignItems: "center",
                        gap: "16px",
                    }}
                >
                    {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                            src={logoUrl}
                            alt="Firma logosu"
                            style={{ height: "56px", maxWidth: "120px", objectFit: "contain", borderRadius: "4px" }}
                        />
                    ) : (
                        <div style={{ fontSize: "28px" }}>🏭</div>
                    )}
                    <div>
                        <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                            {logoUploading ? "Yükleniyor…" : logoUrl ? "Logoyu değiştirmek için tıklayın veya sürükleyin" : "Logo yüklemek için tıklayın veya sürükleyin"}
                        </div>
                        <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                            PNG, JPEG, SVG, WebP · Maks 2MB
                        </div>
                    </div>
                </div>
            </div>

            {/* Fields grid */}
            <div>
                <div style={sectionTitle}>Firma Bilgileri</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                    <div style={{ gridColumn: "1 / -1" }}>
                        <label style={labelStyle}>Firma Adı *</label>
                        <input
                            style={fieldErrors.name ? { ...inputStyle, borderColor: "var(--danger-border)" } : inputStyle}
                            value={form.name}
                            onChange={set("name")}
                        />
                        {fieldErrors.name && <FieldError msg={fieldErrors.name} />}
                    </div>
                    <div>
                        <label style={labelStyle}>Vergi Dairesi</label>
                        <input style={inputStyle} value={form.taxOffice} onChange={set("taxOffice")} />
                    </div>
                    <div>
                        <label style={labelStyle}>Vergi No</label>
                        <input
                            style={fieldErrors.taxNo ? { ...inputStyle, borderColor: "var(--danger-border)" } : inputStyle}
                            value={form.taxNo}
                            onChange={set("taxNo")}
                            placeholder="10 hane (kurumsal) veya 11 hane (TC)"
                        />
                        {fieldErrors.taxNo && <FieldError msg={fieldErrors.taxNo} />}
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
                        <label style={labelStyle}>E-posta</label>
                        <input
                            style={fieldErrors.email ? { ...inputStyle, borderColor: "var(--danger-border)" } : inputStyle}
                            value={form.email}
                            onChange={set("email")}
                            type="email"
                        />
                        {fieldErrors.email && <FieldError msg={fieldErrors.email} />}
                    </div>
                    <div>
                        <label style={labelStyle}>Web Sitesi</label>
                        <input
                            style={fieldErrors.website ? { ...inputStyle, borderColor: "var(--danger-border)" } : inputStyle}
                            value={form.website}
                            onChange={set("website")}
                            placeholder="ornek.com.tr"
                        />
                        {fieldErrors.website && <FieldError msg={fieldErrors.website} />}
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

function KullaniciTab({ onDirtyChange }: { onDirtyChange?: (d: boolean) => void }) {
    const { toast } = useToast();
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [fullName, setFullName] = useState("");
    const savedFullNameRef = useRef("");
    const [isDirty, setIsDirty] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [avatarUploading, setAvatarUploading] = useState(false);
    const avatarFileRef = useRef<HTMLInputElement>(null);

    const [pwForm, setPwForm] = useState({ current: "", next: "", confirm: "" });
    const [pwError, setPwError] = useState("");
    const [isChangingPw, setIsChangingPw] = useState(false);

    const isDemo = isDemoMode();

    // Concurrent mutation lock — name + avatar + password aynı anda gönderilmemeli.
    // patchUserMetadata GET-merge-SET race window'unu UI tarafında kapatır
    // (lost-update koruması).
    const isMutating = isSavingProfile || avatarUploading || isChangingPw;

    useEffect(() => {
        if (isDemo) { setIsLoading(false); return; }
        const ctrl = new AbortController();
        fetch("/api/settings/user/profile", { signal: ctrl.signal })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then((p: UserProfile) => {
                setProfile(p);
                setFullName(p.fullName);
                savedFullNameRef.current = p.fullName;
            })
            .catch(err => {
                if (err?.name !== "AbortError") {
                    toast({ type: "error", message: "Profil yüklenemedi." });
                }
            })
            .finally(() => setIsLoading(false));
        return () => ctrl.abort();
    }, [isDemo, toast]);

    const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        setFullName(v);
        const dirty = v !== savedFullNameRef.current;
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    };

    const handleProfileSave = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (isMutating) return; // concurrent guard
        const trimmed = fullName.trim();
        if (trimmed.length < 2) {
            toast({ type: "error", message: "Ad soyad en az 2 karakter olmalı." });
            return;
        }
        setIsSavingProfile(true);
        try {
            const res = await fetch("/api/settings/user/profile", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ fullName: trimmed }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error ?? "Profil güncellenemedi.");
            }
            const updated: UserProfile = await res.json();
            setProfile(updated);
            setFullName(updated.fullName);
            savedFullNameRef.current = updated.fullName;
            setIsDirty(false);
            onDirtyChange?.(false);
            toast({ type: "success", message: "Profil güncellendi." });
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Hata oluştu." });
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleAvatarFile = async (file: File) => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (isMutating) return; // concurrent guard
        setAvatarUploading(true);
        try {
            const fd = new FormData();
            fd.append("file", file);
            const res = await fetch("/api/settings/user/avatar", { method: "POST", body: fd });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error ?? "Yükleme başarısız.");
            }
            const { avatarUrl } = await res.json();
            setProfile(p => p ? { ...p, avatarUrl } : p);
            toast({ type: "success", message: "Profil fotoğrafı güncellendi." });
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Yükleme başarısız." });
        } finally {
            setAvatarUploading(false);
        }
    };

    const handlePwSave = async () => {
        setPwError("");
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        if (isMutating) return; // concurrent guard
        if (!pwForm.current) { setPwError("Mevcut şifrenizi girin."); return; }
        if (pwForm.next.length < 8) { setPwError("Yeni şifre en az 8 karakter olmalı."); return; }
        if (pwForm.next !== pwForm.confirm) { setPwError("Yeni şifreler eşleşmiyor."); return; }
        if (pwForm.current === pwForm.next) { setPwError("Yeni şifre mevcut şifreden farklı olmalı."); return; }

        setIsChangingPw(true);
        try {
            const res = await fetch("/api/settings/user/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.next }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error ?? "Şifre güncellenemedi.");
            }
            setPwForm({ current: "", next: "", confirm: "" });
            toast({ type: "success", message: "Şifre güncellendi." });
        } catch (err) {
            setPwError(err instanceof Error ? err.message : "Hata oluştu.");
        } finally {
            setIsChangingPw(false);
        }
    };

    if (isDemo) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Kullanıcı bilgileri yalnızca yetkili kullanıcılara gösterilir.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Yükleniyor…
            </div>
        );
    }

    const initial = (profile?.fullName || profile?.email || "?").charAt(0).toUpperCase();

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {/* Avatar */}
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                <input
                    ref={avatarFileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = ""; }}
                />
                {profile?.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={profile.avatarUrl}
                        alt="Profil fotoğrafı"
                        style={{
                            width: "56px", height: "56px",
                            borderRadius: "50%", objectFit: "cover",
                            border: "0.5px solid var(--border-secondary)",
                            flexShrink: 0,
                        }}
                    />
                ) : (
                    <div
                        style={{
                            width: "56px", height: "56px", borderRadius: "50%",
                            background: "var(--accent-bg)", border: "0.5px solid var(--accent-border)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontSize: "20px", fontWeight: 600, color: "var(--accent-text)",
                            flexShrink: 0,
                        }}
                    >
                        {initial}
                    </div>
                )}
                <div>
                    <div style={{ fontSize: "14px", fontWeight: 500, color: "var(--text-primary)" }}>
                        {profile?.fullName || profile?.email}
                    </div>
                    <button
                        onClick={() => avatarFileRef.current?.click()}
                        disabled={isMutating}
                        style={{
                            fontSize: "11px",
                            marginTop: "3px",
                            padding: "3px 8px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "4px",
                            background: "transparent",
                            color: "var(--text-tertiary)",
                            cursor: isMutating ? "wait" : "pointer",
                        }}
                    >
                        {avatarUploading ? "Yükleniyor…" : "Fotoğraf Değiştir"}
                    </button>
                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                        PNG, JPEG, WebP · Maks 1MB
                    </div>
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
                            value={fullName}
                            onChange={handleNameChange}
                            placeholder="Ad Soyad"
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>E-posta</label>
                        <input
                            style={{ ...inputStyle, opacity: 0.6, cursor: "not-allowed" }}
                            value={profile?.email ?? ""}
                            readOnly
                            title="E-posta değiştirmek için destek ile iletişime geçin."
                        />
                        <div style={{ fontSize: "10px", color: "var(--text-tertiary)", marginTop: "3px" }}>
                            E-posta değiştirmek için destek ile iletişime geçin
                        </div>
                    </div>
                </div>
                <SaveButton onClick={handleProfileSave} loading={isSavingProfile} dirty={isDirty} />
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
                                autoComplete={key === "current" ? "current-password" : "new-password"}
                            />
                        </div>
                    ))}
                    {pwError && <FieldError msg={pwError} />}
                </div>
                <SaveButton onClick={handlePwSave} loading={isChangingPw} />
            </div>
        </div>
    );
}

// ─── Bildirimler ───────────────────────────────────────────────────────────────

function defaultPrefs(): NotificationPref[] {
    return NOTIFICATION_TYPES.map(t => ({
        type: t.key,
        emailEnabled: true,
        browserEnabled: true,
    }));
}

function BildirimlerTab({ onDirtyChange }: { onDirtyChange?: (d: boolean) => void }) {
    const { toast } = useToast();
    const isDemo = isDemoMode();
    const initialPrefsRef = useRef<NotificationPref[]>(defaultPrefs());
    const [prefs, setPrefs] = useState<NotificationPref[]>(() => initialPrefsRef.current);
    const savedRef = useRef<NotificationPref[]>(initialPrefsRef.current);
    const [isDirty, setIsDirty] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (isDemo) { setIsLoading(false); return; }
        const ctrl = new AbortController();
        fetch("/api/settings/user/preferences", { signal: ctrl.signal })
            .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
            .then((data: NotificationPref[]) => {
                if (Array.isArray(data) && data.length > 0) {
                    setPrefs(data);
                    savedRef.current = data;
                }
            })
            .catch(err => {
                if (err?.name !== "AbortError") {
                    toast({ type: "error", message: "Tercihler yüklenemedi." });
                }
            })
            .finally(() => setIsLoading(false));
        return () => ctrl.abort();
    }, [isDemo, toast]);

    const toggle = (type: NotificationTypeKey, channel: "emailEnabled" | "browserEnabled") => {
        const next = prefs.map(p => p.type === type ? { ...p, [channel]: !p[channel] } : p);
        setPrefs(next);
        const dirty = JSON.stringify(next) !== JSON.stringify(savedRef.current);
        setIsDirty(dirty);
        onDirtyChange?.(dirty);
    };

    const handleSave = async () => {
        if (isDemo) { toast({ type: "info", message: DEMO_BLOCK_TOAST }); return; }
        setIsSaving(true);
        try {
            const res = await fetch("/api/settings/user/preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ prefs }),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                throw new Error(errBody.error ?? "Tercihler kaydedilemedi.");
            }
            const updated: NotificationPref[] = await res.json();
            setPrefs(updated);
            savedRef.current = updated;
            setIsDirty(false);
            onDirtyChange?.(false);
            toast({ type: "success", message: "Bildirim tercihleri kaydedildi." });
        } catch (err) {
            toast({ type: "error", message: err instanceof Error ? err.message : "Hata oluştu." });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading && !isDemo) {
        return (
            <div style={{ padding: "40px 0", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
                Yükleniyor…
            </div>
        );
    }

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

                {NOTIFICATION_TYPES.map((typeDef, i) => {
                    const pref = prefs.find(p => p.type === typeDef.key)
                        ?? { type: typeDef.key, emailEnabled: true, browserEnabled: true };
                    return (
                        <div
                            key={typeDef.key}
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 80px 80px",
                                padding: "12px 16px",
                                borderBottom: i < NOTIFICATION_TYPES.length - 1 ? "0.5px solid var(--border-tertiary)" : "none",
                                alignItems: "center",
                            }}
                        >
                            <div>
                                <div style={{ fontSize: "13px", color: "var(--text-primary)" }}>{typeDef.label}</div>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px" }}>
                                    {typeDef.desc}
                                </div>
                            </div>
                            {(["emailEnabled", "browserEnabled"] as const).map(channel => (
                                <div key={channel} style={{ display: "flex", justifyContent: "center" }}>
                                    <button
                                        onClick={() => toggle(typeDef.key, channel)}
                                        title={isDemo ? "Demo modunda devre dışı" : undefined}
                                        disabled={isDemo}
                                        style={{
                                            width: "36px",
                                            height: "20px",
                                            borderRadius: "10px",
                                            border: "none",
                                            background: pref[channel] ? "var(--accent)" : "var(--bg-tertiary)",
                                            cursor: isDemo ? "not-allowed" : "pointer",
                                            position: "relative",
                                            transition: "background 0.2s",
                                            flexShrink: 0,
                                            opacity: isDemo ? 0.5 : 1,
                                        }}
                                    >
                                        <span
                                            style={{
                                                position: "absolute",
                                                top: "2px",
                                                left: pref[channel] ? "18px" : "2px",
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
                    );
                })}
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

interface ParasutTokenInfo {
    connected: boolean;
    expiresAt: string | null;
    secondsRemaining: number | null;
    tokenVersion: number | null;
    updatedAt: string | null;
}

function formatTokenDuration(seconds: number): string {
    if (seconds <= 0) return "Süresi doldu";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h >= 24) {
        const d = Math.floor(h / 24);
        return `${d}g ${h % 24}s`;
    }
    if (h > 0) return `${h}s ${m}dk`;
    return `${m}dk`;
}

function ApiTab() {
    const [status, setStatus] = useState<KeyStatus | null>(null);
    const [parasutToken, setParasutToken] = useState<ParasutTokenInfo | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "info" | "error"; message: string } | null>(null);

    const fetchToken = async () => {
        try {
            const r = await fetch("/api/parasut/stats");
            if (r.ok) {
                const data = await r.json();
                if (data.token) setParasutToken(data.token as ParasutTokenInfo);
            }
        } catch { /* sessizce geç */ }
    };

    useEffect(() => {
        fetch("/api/settings/api-keys-status")
            .then(r => r.ok ? r.json() : null)
            .then(data => { if (data) setStatus(data); })
            .catch(() => {});
        fetchToken();
    }, []);

    const handleRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        setFeedback(null);
        try {
            const res = await fetch("/api/parasut/oauth/refresh", { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setFeedback({ type: "info", message: "Token başarıyla yenilendi." });
                await fetchToken();
            } else {
                setFeedback({ type: "error", message: data.error ?? "Token yenilenemedi." });
            }
        } catch (err) {
            setFeedback({ type: "error", message: err instanceof Error ? err.message : "Token yenilenemedi." });
        } finally {
            setRefreshing(false);
        }
    };

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

            {/* Faz 11.5 — Paraşüt OAuth bağlantısı */}
            <div style={{ ...sectionTitle, marginTop: "24px" }}>Paraşüt OAuth</div>
            <div
                style={{
                    background: "var(--bg-secondary)",
                    border: "0.5px solid var(--border-tertiary)",
                    borderRadius: "8px",
                    padding: "14px 16px",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "10px" }}>
                    <div>
                        <div style={{ fontSize: "13px", color: "var(--text-primary)", marginBottom: "4px" }}>
                            OAuth Token
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-tertiary)" }}>
                            {parasutToken === null ? (
                                "Yükleniyor…"
                            ) : !parasutToken.connected ? (
                                "Bağlantı yok — 'Bağlan' ile akışı başlatın."
                            ) : (
                                <>
                                    Geçerli ·{" "}
                                    {parasutToken.secondsRemaining !== null
                                        ? formatTokenDuration(parasutToken.secondsRemaining)
                                        : "—"}
                                    {parasutToken.tokenVersion !== null && ` · v${parasutToken.tokenVersion}`}
                                </>
                            )}
                        </div>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                        <a
                            href="/api/parasut/oauth/start"
                            style={{
                                fontSize: "12px",
                                padding: "6px 14px",
                                border: "0.5px solid var(--accent-border)",
                                borderRadius: "6px",
                                background: "var(--accent-bg)",
                                color: "var(--accent-text)",
                                textDecoration: "none",
                            }}
                            title="OAuth akışını başlat"
                        >
                            Paraşüt&apos;e bağlan
                        </a>
                        <button
                            type="button"
                            onClick={handleRefresh}
                            disabled={refreshing || !parasutToken}
                            style={{
                                fontSize: "12px",
                                padding: "6px 14px",
                                border: "0.5px solid var(--border-secondary)",
                                borderRadius: "6px",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-secondary)",
                                cursor: refreshing || !parasutToken ? "not-allowed" : "pointer",
                                opacity: refreshing || !parasutToken ? 0.5 : 1,
                            }}
                        >
                            {refreshing ? "Yenileniyor…" : "↻ Token Yenile"}
                        </button>
                    </div>
                </div>
                {feedback && (
                    <div
                        style={{
                            marginTop: "10px",
                            padding: "6px 10px",
                            background: feedback.type === "info" ? "var(--success-bg)" : "var(--danger-bg)",
                            border: `0.5px solid ${feedback.type === "info" ? "var(--success-border)" : "var(--danger-border)"}`,
                            borderRadius: "4px",
                            fontSize: "11px",
                            color: feedback.type === "info" ? "var(--success-text)" : "var(--danger-text)",
                        }}
                    >
                        {feedback.message}
                    </div>
                )}
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
                    role="tablist"
                    aria-label="Ayarlar bölümleri"
                    aria-orientation="vertical"
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
                            role="tab"
                            id={`settings-tab-${key}`}
                            aria-selected={activeTab === key}
                            aria-controls="settings-tabpanel"
                            aria-label={dirtyTabs.has(key) ? `${label} (kaydedilmemiş değişiklikler)` : undefined}
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
                                <span aria-hidden="true" style={{
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
                <div
                    role="tabpanel"
                    id="settings-tabpanel"
                    aria-labelledby={`settings-tab-${activeTab}`}
                    style={{ padding: "24px 28px", maxWidth: "640px" }}
                >
                    {activeTab === "firma" && <FirmaTab onDirtyChange={(d) => handleDirtyChange("firma", d)} />}
                    {activeTab === "kullanici" && <KullaniciTab onDirtyChange={(d) => handleDirtyChange("kullanici", d)} />}
                    {activeTab === "bildirimler" && <BildirimlerTab onDirtyChange={(d) => handleDirtyChange("bildirimler", d)} />}
                    {activeTab === "api" && <ApiTab />}
                    {activeTab === "yapay-zeka" && <AiTab />}
                </div>
            </div>

            {/* Tehlikeli Bölge — sayfanın en altında, ayrı blok */}
            <ResetDemoSection />
        </div>
    );
}
