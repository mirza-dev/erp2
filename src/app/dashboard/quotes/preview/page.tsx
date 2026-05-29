"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import QuoteDocument from "../components/QuoteDocument";
import { montserrat, inter } from "../components/quote-fonts";
import type { QuoteData } from "../components/quote-types";

export default function QuotePreviewPage() {
    const router = useRouter();
    const [data] = useState<QuoteData | null>(() => {
        if (typeof window === "undefined") return null;
        try {
            const raw = localStorage.getItem("teklif_v3_full");
            return raw ? (JSON.parse(raw) as QuoteData) : null;
        } catch {
            return null;
        }
    });
    const notFound = data === null;

    const toolbarStyle: React.CSSProperties = {
        position: "fixed" as const,
        top: "0",
        left: "0",
        right: "0",
        zIndex: 10001,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 24px",
        background: "var(--bg-primary)",
        borderBottom: "0.5px solid var(--border-tertiary)",
        boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
    };

    const btnBase: React.CSSProperties = {
        display: "inline-flex",
        alignItems: "center",
        gap: "7px",
        padding: "7px 16px",
        fontSize: "12.5px",
        fontWeight: 500,
        borderRadius: "6px",
        cursor: "pointer",
        fontFamily: "var(--font-geist-sans), system-ui, sans-serif",
    };

    const btnPrimary: React.CSSProperties = {
        ...btnBase,
        background: "var(--accent)",
        // Beyaz, accent zemin üzerinde okunaklı; var(--accent-text) projede
        // accent **rengi** olarak (badge text vs.) farklı amaçla kullanılıyor.
        color: "white",
        border: "none",
    };

    const btnSecondary: React.CSSProperties = {
        ...btnBase,
        background: "transparent",
        color: "var(--text-secondary)",
        border: "0.5px solid var(--border-secondary)",
    };

    if (notFound) {
        return (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-primary)", display: "grid", placeItems: "center" }}>
                <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                    <div style={{ fontSize: "16px", marginBottom: "8px", color: "var(--text-primary)" }}>Önizleme verisi bulunamadı</div>
                    <div style={{ fontSize: "12px", marginBottom: "20px" }}>Formu doldurup tekrar deneyin.</div>
                    <button style={btnPrimary} onClick={() => router.push("/dashboard/quotes/new")}>
                        ← Forma Dön
                    </button>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-primary)", display: "grid", placeItems: "center" }}>
                <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>Yükleniyor…</div>
            </div>
        );
    }

    return (
        <>
            {/* Print CSS: fixed → static so browser renders the document */}
            <style dangerouslySetInnerHTML={{ __html: `
                @media print {
                    .qpw-outer {
                        position: static !important;
                        overflow: visible !important;
                        background: white !important;
                        padding: 0 !important;
                        z-index: auto !important;
                        inset: auto !important;
                        width: 100% !important;
                    }
                    .qpw-inner {
                        padding: 0 !important;
                    }
                }
            ` }} />
            <div
                className={`${montserrat.variable} ${inter.variable} qpw-outer`}
                // #d0d5dd: PDF kağıdını taklit eden açık gri scroll arkaplanı —
                // bilinçli olarak CSS variable kullanılmadı (dark theme'de gri
                // tonu print önizleme bağlamını bozardı).
                style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#d0d5dd", overflowY: "auto" }}
            >
                {/* ── Toolbar (hidden on print) ── */}
                <div className="quote-preview-toolbar" style={toolbarStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <button style={btnSecondary} onClick={() => router.push("/dashboard/quotes/new")}>
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M10 3L5 8l5 5" />
                            </svg>
                            Formu Düzenle
                        </button>
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            {data.quoteNo} · {{ draft: "Taslak", sent: "Gönderildi", accepted: "Kabul Edildi", rejected: "Reddedildi", expired: "Süresi Doldu" }[data.status] ?? data.status}
                        </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Ctrl+P ile de yazdırabilirsiniz</span>
                        <button
                            style={btnPrimary}
                            onClick={() => window.print()}
                        >
                            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M4 6V2h8v4M4 11H3a1 1 0 01-1-1V7a1 1 0 011-1h10a1 1 0 011 1v3a1 1 0 01-1 1h-1M4 11v3h8v-3H4z" />
                                <circle cx="12.5" cy="8.5" r=".5" fill="currentColor" />
                            </svg>
                            Yazdır / PDF
                        </button>
                    </div>
                </div>

                {/* ── Document ── */}
                <div className="qpw-inner" style={{ paddingTop: "60px", paddingBottom: "40px" }}>
                    <QuoteDocument data={data} />
                </div>
            </div>
        </>
    );
}
