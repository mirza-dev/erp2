"use client";

/**
 * Veri Aktarım Merkezi — rehber + şeffaflık katmanı.
 *
 * Her zaman görünür: 3 adım şeridi + seçili işleme göre "veri nereye gider" özeti.
 * Collapsible: tam veri-hedef haritası + Excel şablon merkezi + güven notları.
 *
 * Tüm içerik @/lib/import-guide (tek kaynak) ve seçili işlemden türetilir.
 */
import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, ShieldCheck, Workflow } from "lucide-react";
import type { AiImportOperationDefinition } from "@/lib/ai-import-operations";
import {
    IMPORT_STEPS,
    IMPORT_TRUST_NOTES,
    buildOperationTargets,
    getActiveTemplateLinks,
    getTargetForOperation,
} from "@/lib/import-guide";

interface ImportGuideProps {
    selectedOperation: AiImportOperationDefinition;
}

const cardStyle: React.CSSProperties = {
    padding: "14px",
    background: "var(--surface-subtle)",
    border: "var(--line-width) solid var(--surface-border)",
    borderRadius: "8px",
    boxShadow: "var(--surface-shadow-sm)",
};

export default function ImportGuide({ selectedOperation }: ImportGuideProps) {
    const [open, setOpen] = useState(false);
    const target = getTargetForOperation(selectedOperation);
    const operationTargets = buildOperationTargets();
    const templates = getActiveTemplateLinks();

    return (
        <section aria-label="Veri Aktarım Rehberi" style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: "14px" }}>
            {/* 3 adım şeridi — her zaman görünür */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "8px" }}>
                {IMPORT_STEPS.map(step => (
                    <div
                        key={step.n}
                        style={{
                            display: "flex",
                            gap: "10px",
                            alignItems: "flex-start",
                            padding: "10px",
                            borderRadius: "7px",
                            background: "var(--surface-raised)",
                            border: "var(--line-width) solid var(--border-tertiary)",
                        }}
                    >
                        <span
                            aria-hidden
                            style={{
                                flexShrink: 0,
                                width: "22px",
                                height: "22px",
                                borderRadius: "999px",
                                background: "var(--accent-bg-strong)",
                                color: "var(--accent-text)",
                                fontSize: "12px",
                                fontWeight: 700,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            {step.n}
                        </span>
                        <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{step.title}</div>
                            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", lineHeight: 1.5, marginTop: "2px" }}>
                                {step.desc}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Seçili işleme göre "veri nereye gider" özeti */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    flexWrap: "wrap",
                    padding: "10px 12px",
                    borderRadius: "7px",
                    background: "var(--accent-bg)",
                    border: "var(--line-width) solid var(--accent-border)",
                    fontSize: "12px",
                    color: "var(--text-secondary)",
                }}
            >
                <span style={{ fontWeight: 700, color: "var(--text-primary)" }}>{selectedOperation.title}</span>
                <ArrowRight size={14} aria-hidden style={{ color: "var(--accent-text)" }} />
                <span style={{ fontWeight: 600, color: "var(--accent-text)" }}>{target.module}</span>
                <span style={{ color: "var(--text-tertiary)" }}>· {target.action}</span>
            </div>

            {/* Detay: veri hedefleri + şablonlar + güven notları */}
            <details
                data-testid="import-guide-details"
                open={open}
                onToggle={e => setOpen((e.target as HTMLDetailsElement).open)}
                style={{ borderTop: "var(--line-width) solid var(--surface-border)", paddingTop: "10px" }}
            >
                <summary
                    style={{
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--text-secondary)",
                        listStyle: "none",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        userSelect: "none",
                    }}
                >
                    <span aria-hidden style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>{open ? "▾" : "▸"}</span>
                    <Workflow size={15} aria-hidden />
                    Nasıl çalışır? — veri hedefleri, şablonlar ve güvenlik
                </summary>

                <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
                    {/* Veri hedefleri haritası */}
                    <div>
                        <h3 id="import-guide-targets" style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px" }}>
                            Veri hedefleri — ne nereye kaydedilir
                        </h3>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "8px" }}>
                            {operationTargets.map(row => (
                                <div
                                    key={row.id}
                                    style={{
                                        padding: "10px",
                                        borderRadius: "7px",
                                        background: "var(--surface-raised)",
                                        border: "var(--line-width) solid var(--border-tertiary)",
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: "5px",
                                    }}
                                >
                                    <span style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)" }}>{row.title}</span>
                                    <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px" }}>
                                        <ArrowRight size={12} aria-hidden style={{ color: "var(--accent-text)", flexShrink: 0 }} />
                                        {row.target.href ? (
                                            <Link href={row.target.href} style={{ color: "var(--accent-text)", fontWeight: 600, textDecoration: "none" }}>
                                                {row.target.module}
                                            </Link>
                                        ) : (
                                            <span style={{ color: "var(--accent-text)", fontWeight: 600 }}>{row.target.module}</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{row.target.action}</div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                                        <b>Ne aranır:</b> {row.evidenceHint}
                                    </div>
                                    <div style={{ fontSize: "10px", color: "var(--text-tertiary)", lineHeight: 1.45 }}>
                                        <b>Ne korunur:</b> {row.safetyNote}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Excel şablon merkezi */}
                    <div>
                        <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 4px" }}>
                            Excel şablonları
                        </h3>
                        <p style={{ fontSize: "11px", color: "var(--text-tertiary)", margin: "0 0 8px", lineHeight: 1.5 }}>
                            Hazır şablonu indir, doldur ve aşağıdaki <b>Excel/CSV ile Toplu Aktarım</b> bölümünden yükle. Zorunlu sütunlar şablonda işaretlidir.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "8px" }}>
                            {templates.map(tpl => (
                                <a
                                    key={tpl.kind}
                                    href={tpl.href}
                                    download
                                    aria-label={`${tpl.title} Excel şablonunu indir`}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "8px",
                                        padding: "9px 11px",
                                        borderRadius: "7px",
                                        background: "var(--surface-raised)",
                                        border: "var(--line-width) solid var(--border-tertiary)",
                                        color: "var(--text-primary)",
                                        textDecoration: "none",
                                    }}
                                >
                                    <span style={{ minWidth: 0 }}>
                                        <span style={{ display: "block", fontSize: "12px", fontWeight: 600 }}>{tpl.title}</span>
                                        <span style={{ display: "block", fontSize: "10px", color: "var(--text-tertiary)", marginTop: "1px" }}>
                                            {tpl.columnCount} sütun · {tpl.requiredCount} zorunlu
                                        </span>
                                    </span>
                                    <Download size={15} aria-hidden style={{ color: "var(--accent-text)", flexShrink: 0 }} />
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Güven notları */}
                    <div>
                        <h3 style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-primary)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <ShieldCheck size={15} aria-hidden style={{ color: "var(--success-text)" }} />
                            Verileriniz güvende
                        </h3>
                        <ul style={{ margin: 0, paddingLeft: "18px", display: "flex", flexDirection: "column", gap: "5px" }}>
                            {IMPORT_TRUST_NOTES.map((note, i) => (
                                <li key={i} style={{ fontSize: "11px", color: "var(--text-secondary)", lineHeight: 1.5 }}>{note}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </details>
        </section>
    );
}
