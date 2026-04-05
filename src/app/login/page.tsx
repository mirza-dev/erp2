"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import DemoButton from "@/components/ui/DemoButton";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const router = useRouter();

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
        router.push("/dashboard");
        router.refresh();
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                background: "var(--bg-secondary)",
            }}
        >
            <form
                onSubmit={handleSubmit}
                style={{
                    width: "100%",
                    maxWidth: "360px",
                    background: "var(--bg-primary)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "12px",
                    padding: "32px 28px",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                }}
            >
                <div style={{ textAlign: "center", marginBottom: "8px" }}>
                    <h1
                        style={{
                            fontSize: "20px",
                            fontWeight: 600,
                            color: "var(--text-primary)",
                            margin: 0,
                        }}
                    >
                        KokpitERP
                    </h1>
                    <p
                        style={{
                            fontSize: "13px",
                            color: "var(--text-tertiary)",
                            marginTop: "4px",
                            marginBottom: 0,
                        }}
                    >
                        Devam etmek için giriş yapın
                    </p>
                </div>

                {error && (
                    <div
                        style={{
                            fontSize: "13px",
                            color: "var(--danger-text)",
                            background: "var(--danger-bg)",
                            border: "0.5px solid var(--danger-border)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                        }}
                    >
                        {error}
                    </div>
                )}

                <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        E-posta
                    </span>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={{
                            padding: "8px 10px",
                            fontSize: "13px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                            outline: "none",
                        }}
                    />
                </label>

                <label style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                        Şifre
                    </span>
                    <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        style={{
                            padding: "8px 10px",
                            fontSize: "13px",
                            border: "0.5px solid var(--border-secondary)",
                            borderRadius: "6px",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                            outline: "none",
                        }}
                    />
                </label>

                <button
                    type="submit"
                    disabled={loading}
                    style={{
                        padding: "10px",
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "#fff",
                        background: "var(--accent)",
                        border: "none",
                        borderRadius: "8px",
                        cursor: loading ? "not-allowed" : "pointer",
                        opacity: loading ? 0.6 : 1,
                        marginTop: "4px",
                    }}
                >
                    {loading ? "Giriş yapılıyor..." : "Giriş Yap"}
                </button>

                <div style={{ textAlign: "center", marginTop: "4px" }}>
                    <DemoButton variant="link" />
                </div>
            </form>
        </div>
    );
}
