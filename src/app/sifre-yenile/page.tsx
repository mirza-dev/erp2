"use client";

/**
 * Yeni şifre belirleme ekranı — parola kurtarma zincirinin son halkası.
 *
 * 2026-08-31 denetimi (madde #4): bu ekran YOKTU. "Şifremi unuttum" e-postayı
 * gönderiyordu, link `/login`'e düşüyordu, kod hiç işlenmiyordu ve kullanıcı
 * hâlâ giremiyordu. Ayarlar'daki şifre değiştirme MEVCUT şifreyi istediği için
 * de kaçış yolu değildi. Sonuç: şifresini unutan herkes kilitleniyordu.
 *
 * Buraya oturumla gelinir: `/auth/callback` linkteki `?code=`'u
 * `exchangeCodeForSession` ile kurtarma oturumuna çevirmiş olur. Oturumsuz
 * gelen istek `proxy.ts` tarafından zaten `/login`'e atılır — bu yüzden sayfa
 * `ALWAYS_PUBLIC`'e GİRMEZ.
 *
 * KAYDA GEÇEN KARAR: exchange sonrası kullanıcının tam oturumu vardır ve teknik
 * olarak şifre belirlemeden panoya gidebilir. Bu Supabase kurtarma modelinin
 * doğası — linke sahip olmak, kişinin kendi e-posta kutusuna sahip olması
 * demektir ve kimlik kanıtı odur. Gizli bir açık değil, yazılı bir karar.
 *
 * Politika `checkPasswordPolicy` ile ayna: kural TEK kaynakta, burada kopyası yok.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { checkPasswordPolicy, MIN_PASSWORD_LENGTH } from "@/lib/auth/password-policy";
import Button from "@/components/ui/Button";
import Input, { labelStyle as sharedLabelStyle } from "@/components/ui/Input";

type Phase = "checking" | "ready" | "expired" | "done";

export default function RecoveryPage() {
    const router = useRouter();
    const [phase, setPhase] = useState<Phase>("checking");
    const [email, setEmail] = useState<string | null>(null);
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [show, setShow] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Kurtarma oturumu gerçekten var mı? Proxy oturumsuzu zaten /login'e atar;
    // bu kontrol oturumun ARADA düşmesine karşı (link eski sekmede açık kalmış).
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            const { data } = await createClient().auth.getUser();
            if (cancelled) return;
            if (data.user) {
                setEmail(data.user.email ?? null);
                setPhase("ready");
            } else {
                setPhase("expired");
            }
        })();
        return () => { cancelled = true; };
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);

        const policyError = checkPasswordPolicy(password, { email });
        if (policyError) { setError(policyError); return; }
        if (password !== confirm) { setError("Şifreler eşleşmiyor."); return; }

        setSaving(true);
        try {
            const { error: updateErr } = await createClient().auth.updateUser({ password });
            if (updateErr) {
                // En sık hâli: kurtarma oturumunun süresi doldu.
                setError("Şifre güncellenemedi. Bağlantının süresi dolmuş olabilir; yeni bir sıfırlama bağlantısı isteyin.");
                setSaving(false);
                return;
            }
            setPhase("done");
            // Yeni şifre yazıldı; oturum zaten açık — panoya bırak.
            router.replace("/dashboard");
            router.refresh();
        } catch {
            setError("Şifre güncellenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.");
            setSaving(false);
        }
    }

    return (
        <main style={shellStyle}>
            <div style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <KeyRound size={18} strokeWidth={2} aria-hidden="true" style={{ color: "var(--accent)" }} />
                    <h1 style={titleStyle}>Yeni şifre belirleyin</h1>
                </div>

                {phase === "checking" && (
                    <p style={hintStyle} role="status" aria-live="polite">Bağlantı doğrulanıyor…</p>
                )}

                {phase === "expired" && (
                    <>
                        <p style={hintStyle} role="alert">
                            Bu bağlantı geçersiz ya da süresi dolmuş. Sıfırlama bağlantıları tek
                            kullanımlıktır ve kısa süre sonra geçersiz olur.
                        </p>
                        <Link href="/login" style={linkStyle}>Giriş ekranına dön</Link>
                    </>
                )}

                {phase === "done" && (
                    <p style={{ ...hintStyle, display: "flex", alignItems: "center", gap: "8px" }} role="status">
                        <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />
                        Şifreniz güncellendi. Yönlendiriliyorsunuz…
                    </p>
                )}

                {phase === "ready" && (
                    <form onSubmit={handleSubmit} noValidate>
                        <p style={hintStyle}>
                            {email ? <><strong style={{ color: "var(--text-primary)" }}>{email}</strong> hesabı için </> : null}
                            en az {MIN_PASSWORD_LENGTH} karakterli yeni bir şifre girin. Uzun bir cümle,
                            karışık kısa bir paroladan daha güvenlidir.
                        </p>

                        {error && (
                            <div style={errorBoxStyle} role="alert">
                                <AlertCircle size={15} strokeWidth={2} aria-hidden="true" />
                                <span>{error}</span>
                            </div>
                        )}

                        <label htmlFor="yeni-sifre" style={labelStyle}>Yeni şifre</label>
                        <div style={{ position: "relative", marginBottom: "12px" }}>
                            <Input
                                id="yeni-sifre"
                                inputSize="lg"
                                type={show ? "text" : "password"}
                                autoComplete="new-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{ paddingRight: "40px" }}
                            />
                            <button
                                type="button"
                                onClick={() => setShow(v => !v)}
                                aria-label={show ? "Parolayı gizle" : "Parolayı göster"}
                                className="tap-44"
                                style={revealStyle}
                            >
                                {show ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                            </button>
                        </div>

                        <label htmlFor="yeni-sifre-tekrar" style={labelStyle}>Yeni şifre (tekrar)</label>
                        <Input
                            id="yeni-sifre-tekrar"
                            inputSize="lg"
                            type={show ? "text" : "password"}
                            autoComplete="new-password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            style={{ marginBottom: "18px" }}
                        />

                        <Button type="submit" variant="primary" disabled={saving} style={{ width: "100%" }}>
                            {saving ? "Kaydediliyor…" : "Şifreyi güncelle"}
                        </Button>
                    </form>
                )}
            </div>
        </main>
    );
}

const shellStyle: React.CSSProperties = {
    minHeight: "100dvh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "24px",
    background: "var(--bg-secondary)",
};

const cardStyle: React.CSSProperties = {
    width: "100%",
    maxWidth: "380px",
    padding: "28px",
    background: "var(--bg-primary)",
    border: "var(--line-width) solid var(--border-secondary)",
    borderRadius: "var(--radius-lg)",
};

const titleStyle: React.CSSProperties = {
    fontSize: "17px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
};

const hintStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--text-tertiary)",
    lineHeight: 1.6,
    margin: "0 0 18px",
};

const labelStyle: React.CSSProperties = { ...sharedLabelStyle(), display: "block", marginBottom: "6px" };

const errorBoxStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: "8px",
    fontSize: "12.5px",
    lineHeight: 1.5,
    // 2026-08-31 düzeltmesi: `--danger-soft-bg` diye bir token YOK (repodaki
    // benzer ad `--button-danger-soft-bg`, ayrı bir şey) → arka plan sessizce
    // `transparent`a düşüyordu. Repodaki standart hata kutusu üçlüsü kullanılıyor.
    color: "var(--danger-text)",
    background: "var(--danger-bg)",
    border: "var(--line-width) solid var(--danger-border)",
    borderRadius: "var(--radius-md)",
    padding: "9px 11px",
    marginBottom: "14px",
};

const revealStyle: React.CSSProperties = {
    position: "absolute",
    right: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    padding: 0,
    cursor: "pointer",
    color: "var(--text-tertiary)",
    display: "flex",
};

const linkStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--accent)",
    textDecoration: "none",
};
