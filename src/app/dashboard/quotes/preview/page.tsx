"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Printer } from "lucide-react";
import Button from "@/components/ui/Button";
import QuoteDocument from "../components/QuoteDocument";
import { montserrat, inter } from "../components/quote-fonts";
import type { QuoteData } from "../components/quote-types";

export default function QuotePreviewPage() {
    const router = useRouter();
    const [printing, setPrinting] = useState(false);
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

    // "Yazdır / PDF": e-postadaki ile BİREBİR aynı react-pdf belgesini üretir
    // (not sayfalar arası gerçek bölünür). Popup-blocker'ı önlemek için pencere
    // senkron açılır, sonra blob URL'i atanır. Demo (POST 403) / hata → HTML
    // window.print() fallback (push-whole, kırpmaz).
    async function handlePrintPdf() {
        if (!data || printing) return;
        setPrinting(true);
        const win = window.open("", "_blank");
        try {
            const res = await fetch("/api/quotes/preview-pdf", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error(String(res.status));
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            if (win) {
                win.location.href = url;
            } else {
                const a = document.createElement("a");
                a.href = url;
                a.download = `${data.quoteNo || "Teklif"}.pdf`;
                a.click();
            }
            setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch {
            if (win) win.close();
            // Demo modunda POST engellenir (403) veya hata → HTML yazdırmaya düş.
            window.print();
        } finally {
            setPrinting(false);
        }
    }

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

    if (notFound) {
        return (
            <div style={{ position: "fixed", inset: 0, zIndex: 9999, background: "var(--bg-primary)", display: "grid", placeItems: "center" }}>
                <div style={{ textAlign: "center", color: "var(--text-secondary)" }}>
                    <div style={{ fontSize: "16px", marginBottom: "8px", color: "var(--text-primary)" }}>Önizleme verisi bulunamadı</div>
                    <div style={{ fontSize: "12px", marginBottom: "20px" }}>Formu doldurup tekrar deneyin.</div>
                    <Button leftIcon={<ArrowLeft size={14} />} onClick={() => router.push("/dashboard/quotes/new")}>Forma Dön</Button>
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
                        <Button variant="secondary" size="sm" leftIcon={<ArrowLeft size={14} />} onClick={() => router.push("/dashboard/quotes/new")}>
                            Formu Düzenle
                        </Button>
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                            {data.quoteNo} · {{ draft: "Taslak", sent: "Gönderildi", accepted: "Kabul Edildi", rejected: "Reddedildi", expired: "Süresi Doldu" }[data.status] ?? data.status}
                        </span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>E-postadaki PDF ile aynı belge</span>
                        <Button
                            size="sm"
                            leftIcon={<Printer size={14} />}
                            onClick={handlePrintPdf}
                            disabled={printing}
                        >
                            {printing ? "Hazırlanıyor…" : "Yazdır / PDF"}
                        </Button>
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
