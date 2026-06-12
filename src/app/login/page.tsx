"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, CheckCircle2, Eye, EyeOff, Lock, LogIn, Mail, Moon, Sun } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearDemoMode } from "@/lib/demo-utils";
import { REMEMBER_COOKIE } from "@/lib/auth/remember";
import { ThemeProvider, useTheme } from "@/lib/theme/use-theme";
import RovenLogo from "@/components/layout/RovenLogo";
import Button from "@/components/ui/Button";

type Lang = "tr" | "en";

/** Login-only i18n sözlüğü (global i18n altyapısı yok — tercih persist edilmez). */
const STR = {
    tr: {
        monoTag: "Endüstriyel ERP",
        monoSub: "Roven hesabınızla giriş yapın.",
        email: "E-posta",
        emailPh: "ad@firma.com",
        password: "Şifre",
        passwordPh: "Şifrenizi girin",
        showPw: "Parolayı göster",
        hidePw: "Parolayı gizle",
        remember: "Beni hatırla",
        forgot: "Şifremi unuttum",
        signIn: "Giriş Yap",
        signingIn: "Giriş yapılıyor…",
        or: "veya",
        google: "Google ile devam et",
        noAccount: "Hesabınız yok mu?",
        contact: "Yöneticinizle iletişime geçin",
        errAuth: "E-posta veya şifre hatalı.",
        errOAuth: "Google ile giriş tamamlanamadı.",
        errOAuthConfig: "Google girişi yapılandırma nedeniyle tamamlanamadı — dönüş adresi Supabase'de kayıtlı olmayabilir. Yöneticinize bildirin.",
        errUnauthorized: "Hesabınız bu sisteme yetkili değil. Yöneticinizle iletişime geçin.",
        errUnauthorizedEmail: "{email} hesabı bu sisteme ekli değil. Yöneticinizin sizi Ayarlar → Kullanıcılar'dan eklemesi gerekir.",
        errEmailEmpty: "E-posta adresi gerekli.",
        errEmailInvalid: "Geçerli bir e-posta girin.",
        errPwEmpty: "Şifre gerekli.",
        resetSent: "Sıfırlama bağlantısı e-postanıza gönderildi.",
        themeLabel: "Temayı değiştir",
    },
    en: {
        monoTag: "Industrial ERP",
        monoSub: "Sign in with your Roven account.",
        email: "Email",
        emailPh: "name@company.com",
        password: "Password",
        passwordPh: "Enter your password",
        showPw: "Show password",
        hidePw: "Hide password",
        remember: "Remember me",
        forgot: "Forgot password",
        signIn: "Sign In",
        signingIn: "Signing in…",
        or: "or",
        google: "Continue with Google",
        noAccount: "Don't have an account?",
        contact: "Contact your administrator",
        errAuth: "Email or password is incorrect.",
        errOAuth: "Google sign-in could not be completed.",
        errOAuthConfig: "Google sign-in failed due to configuration — the return URL may not be registered in Supabase. Notify your administrator.",
        errUnauthorized: "Your account is not authorized for this system. Contact your administrator.",
        errUnauthorizedEmail: "{email} is not registered in this system. Ask your administrator to add you via Settings → Users.",
        errEmailEmpty: "Email is required.",
        errEmailInvalid: "Enter a valid email.",
        errPwEmpty: "Password is required.",
        resetSent: "A reset link has been sent to your email.",
        themeLabel: "Toggle theme",
    },
} satisfies Record<Lang, Record<string, string>>;

type Strings = (typeof STR)[Lang];

const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/**
 * "Beni hatırla" tercihini sign-in BAŞLAMADAN önce cookie'ye yazar — auth cookie
 * yazan katmanlar (client/server/proxy) bu değere göre kalıcı/session karar verir.
 * Tercih cookie'sinin kendisi hep kalıcı (1 yıl).
 */
function persistRememberChoice(remember: boolean) {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${REMEMBER_COOKIE}=${remember ? "1" : "0"}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

/* Google "G" — çok renkli marka SVG'si (Google brand renkleri TEMA-MUAF, logo precedent'i). */
function GoogleIcon() {
    return (
        <svg width="17" height="17" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
            <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z" />
            <path fill="#EA4335" d="M12 4.75c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 1.46 14.97.5 12 .5A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 4.75 12 4.75Z" />
        </svg>
    );
}

/* Sağ üst: dil seçici + tema butonu (useTheme — ThemeProvider içinde). */
function Chrome({ lang, setLang, t }: { lang: Lang; setLang: (l: Lang) => void; t: Strings }) {
    const { resolved, toggle } = useTheme();
    const isDark = resolved === "dark";
    const Icon = isDark ? Sun : Moon;

    return (
        <div className="login-chrome">
            <div className="login-chrome-actions">
                <span className="seg" role="group" aria-label="Dil / Language">
                    <button type="button" className={lang === "tr" ? "is-active" : ""} aria-pressed={lang === "tr"} onClick={() => setLang("tr")}>
                        TR
                    </button>
                    <button type="button" className={lang === "en" ? "is-active" : ""} aria-pressed={lang === "en"} onClick={() => setLang("en")}>
                        EN
                    </button>
                </span>
                <button type="button" className="icon-btn" aria-label={t.themeLabel} title={t.themeLabel} onClick={toggle}>
                    <Icon size={16} strokeWidth={1.9} aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}

function LoginForm({ t }: { t: Strings }) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPw, setShowPw] = useState(false);
    // Beni hatırla — roven_remember cookie'si üzerinden GERÇEK bağlı (2026-06):
    // işaretli = kalıcı oturum (varsayılan), işaretsiz = tarayıcı kapanınca düşer.
    const [remember, setRemember] = useState(true);
    const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
    const [authError, setAuthError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const { push, refresh } = useRouter();

    // Redirect-time hatası (OAuth handler veya yetkisiz-erişim guard'ı) → mount'ta yüzeye çıkar.
    // `reason` (callback'in teşhisi) ve `attempted` (reddedilen e-posta) ayrışmış mesaj verir.
    useEffect(() => {
        if (typeof window === "undefined") return;
        const params = new URLSearchParams(window.location.search);
        const err = params.get("error");
        if (err === "oauth") {
            const reason = params.get("reason");
            setAuthError(reason === "provider" || reason === "pkce" ? t.errOAuthConfig : t.errOAuth);
        } else if (err === "unauthorized") {
            const attempted = params.get("attempted");
            setAuthError(
                attempted
                    ? t.errUnauthorizedEmail.replace("{email}", attempted)
                    : t.errUnauthorized,
            );
        }
        // yalnız ilk mount — dil değişiminde tekrar çalışmasın
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    function clearMessages() {
        setAuthError(null);
        setNotice(null);
    }

    function validate() {
        const e: { email?: string; password?: string } = {};
        if (!email.trim()) e.email = t.errEmailEmpty;
        else if (!isEmail(email.trim())) e.email = t.errEmailInvalid;
        if (!password) e.password = t.errPwEmpty;
        return e;
    }

    async function handleSubmit(ev: React.FormEvent) {
        ev.preventDefault();
        clearMessages();
        const e = validate();
        setErrors(e);
        if (Object.keys(e).length > 0) return;

        setLoading(true);
        persistRememberChoice(remember);
        const supabase = createClient();
        const { error: authErr } = await supabase.auth.signInWithPassword({ email, password });
        if (authErr) {
            setAuthError(t.errAuth);
            setLoading(false);
            return;
        }
        // Demo cookie'yi temizle — auth'lu kullanıcı dashboard'a girince mutation guard'lar kalksın.
        clearDemoMode();
        push("/dashboard");
        refresh();
    }

    async function handleGoogle() {
        clearMessages();
        setGoogleLoading(true);
        persistRememberChoice(remember);
        const supabase = createClient();
        const { error: oauthErr } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: { redirectTo: `${window.location.origin}/auth/callback` },
        });
        if (oauthErr) {
            setAuthError(t.errOAuth);
            setGoogleLoading(false);
        }
        // başarıda tarayıcı Google'a yönlenir (state çözülmez)
    }

    async function handleForgot() {
        clearMessages();
        if (!email.trim() || !isEmail(email.trim())) {
            setErrors((p) => ({ ...p, email: t.errEmailInvalid }));
            return;
        }
        const supabase = createClient();
        const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
            redirectTo: `${window.location.origin}/login`,
        });
        if (resetErr) {
            setAuthError(t.errAuth);
            return;
        }
        setNotice(t.resetSent);
    }

    return (
        <form className="login-panel login-panel--bare" onSubmit={handleSubmit} noValidate>
            {authError && (
                <div className="login-error" role="alert" aria-live="polite">
                    <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                    <span>{authError}</span>
                </div>
            )}
            {notice && (
                <p className="login-notice" role="status" aria-live="polite">
                    <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />
                    <span>{notice}</span>
                </p>
            )}

            <label className="login-field" htmlFor="login-email">
                <span className="lbl">
                    <span>{t.email}</span>
                </span>
                <span className={"input-wrap has-lead" + (errors.email ? " invalid" : "")}>
                    <span className="lead">
                        <Mail size={17} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <input
                        id="login-email"
                        aria-label={t.email}
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder={t.emailPh}
                        value={email}
                        onChange={(ev) => {
                            setEmail(ev.target.value);
                            if (errors.email) setErrors((p) => ({ ...p, email: undefined }));
                            clearMessages();
                        }}
                    />
                </span>
                {errors.email && (
                    <span className="field-msg">
                        <AlertCircle size={13} strokeWidth={2} aria-hidden="true" />
                        {errors.email}
                    </span>
                )}
            </label>

            <label className="login-field" htmlFor="login-password">
                <span className="lbl">
                    <span>{t.password}</span>
                </span>
                <span className={"input-wrap has-lead" + (errors.password ? " invalid" : "")}>
                    <span className="lead">
                        <Lock size={17} strokeWidth={2} aria-hidden="true" />
                    </span>
                    <input
                        id="login-password"
                        aria-label={t.password}
                        type={showPw ? "text" : "password"}
                        autoComplete="current-password"
                        placeholder={t.passwordPh}
                        value={password}
                        onChange={(ev) => {
                            setPassword(ev.target.value);
                            if (errors.password) setErrors((p) => ({ ...p, password: undefined }));
                            clearMessages();
                        }}
                    />
                    <button
                        type="button"
                        className="trail"
                        aria-label={showPw ? t.hidePw : t.showPw}
                        title={showPw ? t.hidePw : t.showPw}
                        onClick={() => setShowPw((v) => !v)}
                    >
                        {showPw ? <EyeOff size={17} strokeWidth={1.9} aria-hidden="true" /> : <Eye size={17} strokeWidth={1.9} aria-hidden="true" />}
                    </button>
                </span>
                {errors.password && (
                    <span className="field-msg">
                        <AlertCircle size={13} strokeWidth={2} aria-hidden="true" />
                        {errors.password}
                    </span>
                )}
            </label>

            <div className="login-row">
                <span
                    className={"check" + (remember ? " on" : "")}
                    role="checkbox"
                    aria-checked={remember}
                    tabIndex={0}
                    onClick={() => setRemember((v) => !v)}
                    onKeyDown={(ev) => {
                        if (ev.key === " " || ev.key === "Enter") {
                            ev.preventDefault();
                            setRemember((v) => !v);
                        }
                    }}
                >
                    <span className="box">
                        <Check size={12} strokeWidth={3.2} aria-hidden="true" />
                    </span>
                    {t.remember}
                </span>
                <button type="button" className="field-link" onClick={handleForgot}>
                    {t.forgot}
                </button>
            </div>

            <Button
                type="submit"
                size="lg"
                fullWidth
                loading={loading}
                leftIcon={<LogIn aria-hidden="true" />}
                style={{ height: "44px", minHeight: "44px", marginTop: "2px" }}
            >
                {loading ? t.signingIn : t.signIn}
            </Button>

            <div className="login-divider">{t.or}</div>

            <Button
                type="button"
                variant="secondary"
                size="lg"
                fullWidth
                loading={googleLoading}
                leftIcon={<GoogleIcon />}
                onClick={handleGoogle}
                style={{ height: "44px", minHeight: "44px" }}
            >
                {t.google}
            </Button>

            <p className="login-foot">
                {t.noAccount} <a href="mailto:">{t.contact}</a>
            </p>
        </form>
    );
}

function LoginMonolith() {
    const [lang, setLang] = useState<Lang>("tr");
    const t = STR[lang];

    return (
        <main className="login-monolith">
            <Chrome lang={lang} setLang={setLang} t={t} />
            <div className="monolith-hex" aria-hidden="true">
                <span />
            </div>
            <section className="monolith-access" aria-labelledby="login-tag">
                <div className="mono-brand">
                    <RovenLogo size={32} wordmarkSize={27} gap={8} />
                    <span className="mono-brand-tag" id="login-tag">
                        {t.monoTag}
                    </span>
                </div>
                <div className="mono-heading-block">
                    <p className="mono-sub">{t.monoSub}</p>
                </div>
                <LoginForm t={t} />
            </section>
        </main>
    );
}

export default function LoginPage() {
    return (
        <ThemeProvider>
            <LoginMonolith />
        </ThemeProvider>
    );
}
