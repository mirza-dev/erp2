"use client";

import Link from "next/link";

export default function GlobalError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
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
            <div style={{ textAlign: "center", maxWidth: "400px", padding: "32px" }}>
                <h2
                    style={{
                        fontSize: "18px",
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        margin: "0 0 8px",
                    }}
                >
                    Bir hata olustu
                </h2>
                <p
                    style={{
                        fontSize: "13px",
                        color: "var(--text-tertiary)",
                        margin: "0 0 20px",
                        lineHeight: 1.6,
                    }}
                >
                    Sayfa yuklenirken beklenmeyen bir sorun olustu.
                    Tarayici ceviri eklentisi aktifse kapatip tekrar deneyin.
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
                    <button
                        onClick={reset}
                        style={{
                            fontSize: "13px",
                            padding: "9px 22px",
                            background: "var(--accent)",
                            color: "#fff",
                            border: "none",
                            borderRadius: "7px",
                            cursor: "pointer",
                            fontWeight: 500,
                        }}
                    >
                        Tekrar Dene
                    </button>
                    <Link
                        href="/"
                        style={{
                            fontSize: "13px",
                            padding: "9px 22px",
                            border: "0.5px solid var(--border-secondary)",
                            color: "var(--text-secondary)",
                            borderRadius: "7px",
                            textDecoration: "none",
                        }}
                    >
                        Ana Sayfa
                    </Link>
                </div>
            </div>
        </div>
    );
}
