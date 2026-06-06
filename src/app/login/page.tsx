"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Eye, EyeOff, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { clearDemoMode } from "@/lib/demo-utils";
import RovenLogo from "@/components/layout/RovenLogo";
import Button from "@/components/ui/Button";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const { push, refresh } = useRouter();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        const supabase = createClient();
        const { error: authError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });
        if (authError) {
            setError("E-posta veya şifre hatalı.");
            setLoading(false);
            return;
        }
        // Demo cookie'yi temizle — auth'lu kullanıcı dashboard'a girince
        // settings tarafında isDemoMode() false dönsün, mutation guard'lar kalksın
        clearDemoMode();
        push("/dashboard");
        refresh();
    };

    return (
        <main className="login-shell">
            <div className="login-brand-geometry" aria-hidden="true">
                <span />
            </div>

            <section className="login-access" aria-labelledby="login-title">
                <div className="login-brand">
                    <RovenLogo size={28} wordmarkSize={22} gap={9} />
                </div>

                <form className="login-panel" onSubmit={handleSubmit}>
                    <header className="login-panel-header">
                        <p className="login-eyebrow">Kurumsal erişim</p>
                        <h1 id="login-title">Çalışma alanınıza giriş yapın</h1>
                        <p>Roven hesabınızla güvenli biçimde devam edin.</p>
                    </header>

                    {error && (
                        <div className="login-error" role="alert" aria-live="polite">
                            <AlertCircle size={16} strokeWidth={2} aria-hidden="true" />
                            <span>{error}</span>
                        </div>
                    )}

                    <label className="login-field" htmlFor="login-email">
                        <span>E-posta</span>
                        <input
                            id="login-email"
                            aria-label="E-posta"
                            type="email"
                            required
                            autoComplete="email"
                            inputMode="email"
                            autoCapitalize="none"
                            spellCheck={false}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="ad@firma.com"
                        />
                    </label>

                    <div className="login-field">
                        <label htmlFor="login-password">Şifre</label>
                        <span className="login-password-control">
                            <input
                                id="login-password"
                                aria-label="Şifre"
                                type={showPassword ? "text" : "password"}
                                required
                                autoComplete="current-password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Şifrenizi girin"
                            />
                            <button
                                type="button"
                                className="login-password-toggle"
                                aria-label={showPassword ? "Parolayı gizle" : "Parolayı göster"}
                                title={showPassword ? "Parolayı gizle" : "Parolayı göster"}
                                onClick={() => setShowPassword((visible) => !visible)}
                            >
                                {showPassword ? (
                                    <EyeOff size={17} strokeWidth={1.9} aria-hidden="true" />
                                ) : (
                                    <Eye size={17} strokeWidth={1.9} aria-hidden="true" />
                                )}
                            </button>
                        </span>
                    </div>

                    <Button
                        type="submit"
                        size="lg"
                        fullWidth
                        loading={loading}
                        leftIcon={<LogIn aria-hidden="true" />}
                        className="login-submit"
                        style={{ height: "44px", minHeight: "44px" }}
                    >
                        {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
                    </Button>
                </form>
            </section>
        </main>
    );
}
