"use client";

export default function DashboardError({
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <div style={{ padding: "40px 20px", textAlign: "center" }}>
            <h2
                style={{
                    fontSize: "16px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    margin: "0 0 8px",
                }}
            >
                Sayfa yuklenemedi
            </h2>
            <p
                style={{
                    fontSize: "13px",
                    color: "var(--text-tertiary)",
                    margin: "0 0 16px",
                    lineHeight: 1.6,
                }}
            >
                Tarayici ceviri eklentisi aktifse kapatip tekrar deneyin.
            </p>
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
        </div>
    );
}
