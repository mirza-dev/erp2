"use client";

import SectionHeader from "@/components/ui/SectionHeader";
import { fieldStyle, labelStyle as sharedLabelStyle } from "@/components/ui/Input";
import {
    DEFAULT_DOCUMENT_ACCENT,
    isHexColor,
    resolveDocumentAccent,
    validateDocumentAccent,
} from "@/lib/document-accent";

/**
 * Ayarlar › Firma › Belge Rengi (mig.112).
 *
 * Teklif, satın alma siparişi ve fiyat talebi belgelerinin (HTML + baskı + PDF)
 * vurgu rengi. 2026-09-18'e kadar kodda sabit PMT mavisiydi (#0072BC); teslim
 * modeli müşteri başına ayrı kurulum olduğundan her firma kendi rengini seçer.
 *
 * `supported=false` → veritabanında 112 henüz uygulanmamış (GET yanıtında anahtar
 * yok). Alan kilitlenir ve nedeni yazılır; aksi hâlde kaydetme 409'a düşerdi.
 *
 * Önizleme kutusu TEMA-MUAF: beyaz kâğıt + seçilen renk + beyaz yazı — belgenin
 * kendisi gibi iki temada da aynı görünmeli (logo önizlemesi emsali).
 */
export default function DocumentAccentField({
    value,
    onChange,
    supported,
    error,
    companyName,
}: {
    value: string;
    onChange: (next: string) => void;
    supported: boolean;
    error?: string;
    companyName: string;
}) {
    const preview = resolveDocumentAccent(value);
    // Tam bir renk yazıldıysa okunabilirlik anında söylenir; kaydetmede aynı kural koşar.
    const liveProblem = isHexColor(value) ? validateDocumentAccent(value) : null;
    const message = error ?? liveProblem;
    const inputStyle = { ...fieldStyle("md"), fontWeight: "var(--font-ui-weight)" } as const;

    return (
        <div>
            <SectionHeader>Belge Rengi</SectionHeader>
            <label htmlFor="document-accent-hex" style={{ ...sharedLabelStyle(), display: "block", marginBottom: "4px" }}>
                Vurgu rengi
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
                <input
                    type="color"
                    aria-label="Belge rengini paletten seç"
                    value={preview.toLowerCase()}
                    onChange={(e) => onChange(e.target.value.toUpperCase())}
                    disabled={!supported}
                    style={{
                        width: "44px",
                        height: "34px",
                        padding: "2px",
                        border: "var(--line-width) solid var(--border-secondary)",
                        borderRadius: "6px",
                        background: "var(--bg-secondary)",
                        cursor: supported ? "pointer" : "not-allowed",
                    }}
                />
                <input
                    id="document-accent-hex"
                    value={value}
                    onChange={(e) => onChange(e.target.value.trim().toUpperCase())}
                    maxLength={7}
                    spellCheck={false}
                    disabled={!supported}
                    aria-invalid={message ? true : undefined}
                    aria-describedby="document-accent-help"
                    style={{
                        ...inputStyle,
                        width: "120px",
                        fontFamily: "var(--font-mono, ui-monospace, monospace)",
                        ...(message ? { borderColor: "var(--danger-border)" } : {}),
                    }}
                />
                {supported && value !== DEFAULT_DOCUMENT_ACCENT && (
                    <button
                        type="button"
                        onClick={() => onChange(DEFAULT_DOCUMENT_ACCENT)}
                        style={{
                            background: "none",
                            border: "none",
                            padding: "6px 4px",
                            color: "var(--accent-text)",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        Varsayılana dön ({DEFAULT_DOCUMENT_ACCENT})
                    </button>
                )}
            </div>
            {message && (
                <div role="alert" style={{ fontSize: "11px", color: "var(--danger-text)", marginTop: "4px" }}>
                    {message}
                </div>
            )}

            {/* tema-muaf: belge önizlemesi — beyaz kâğıt, seçilen renk, beyaz yazı */}
            <div
                aria-hidden="true"
                style={{
                    marginTop: "10px",
                    maxWidth: "380px",
                    borderRadius: "6px",
                    overflow: "hidden",
                    border: "var(--line-width) solid var(--border-secondary)",
                    background: "#ffffff",
                }}
            >
                <div style={{ background: preview, color: "#ffffff", padding: "9px 12px", fontSize: "12px", fontWeight: 700 }}>
                    {companyName.trim() || "Firma Adı"}
                </div>
                <div style={{ padding: "8px 12px", textAlign: "center", color: preview, fontSize: "12px", fontWeight: 800, letterSpacing: "0.08em" }}>
                    TEKLİF · QUOTATION
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "2fr 1fr 1fr",
                        background: preview,
                        color: "#ffffff",
                        fontSize: "10px",
                        fontWeight: 700,
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                    }}
                >
                    <span style={{ padding: "5px 12px" }}>Ürün</span>
                    <span style={{ padding: "5px 8px" }}>Miktar</span>
                    <span style={{ padding: "5px 8px" }}>Tutar</span>
                </div>
            </div>

            <p id="document-accent-help" style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "8px 0 0", maxWidth: "560px" }}>
                {supported
                    ? "Teklif, satın alma siparişi ve fiyat talebi belgelerinde başlık bandı, tablo başlıkları ve bölüm başlıkları bu renkle basılır. Gönderilmiş tekliflerin arşiv kopyaları değişmez."
                    : `Bu ayar, veritabanına 112 numaralı migration uygulanınca açılır. O zamana kadar belgeler varsayılan renkle (${DEFAULT_DOCUMENT_ACCENT}) basılır.`}
            </p>
        </div>
    );
}
