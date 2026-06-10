"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, ShieldCheck } from "lucide-react";
import { useIsDemo, DEMO_DISABLED_TOOLTIP } from "@/lib/demo-utils";
import { useToast } from "@/components/ui/Toast";
import DropZone from "@/components/import/DropZone";
import ClassifierQueue from "@/components/import/ClassifierQueue";
import type { ProductTypeRow } from "@/lib/database.types";
import { stashImportFile, takeImportFile, isExcelWizardFile } from "@/lib/import-file-transfer";
import { getActiveTemplateLinks, IMPORT_TRUST_NOTES } from "@/lib/import-guide";

// Veri Aktarım Merkezi — dosya-önce model (2026-06-10 sadeleştirme).
// Eski tasarım: kullanıcı önce işlem-türü ızgarasından seçiyordu (4-6 buton), arayüz buna
// göre DropZone veya Excel CTA gösteriyordu; Excel sihirbazı aynı sayfada
// accordion içindeydi. Yeni tasarım: tek dropzone — sistem dosya tipine
// göre yönlendirir. Excel/CSV → /dashboard/import/excel sihirbazı (AI maliyeti
// yok); PDF/görsel → AI classify kuyruğu (işlem türü sınıflandırmadan türetilir,
// İncele ekranında override edilebilir).

const TEMPLATE_LINKS = getActiveTemplateLinks();
const TRUST_LINE = "Onayın olmadan hiçbir kayıt yazılmaz · finansal alanlar ayrı yetki ister";

export default function ImportPage() {
    const router = useRouter();
    const { toast } = useToast();
    const isDemo = useIsDemo();

    const [aiFiles, setAiFiles] = useState<File[]>([]);
    const [aiSuggestedTypes, setAiSuggestedTypes] = useState<Array<{ id: string; name: string }>>([]);
    const [templateTypeId, setTemplateTypeId] = useState("");

    // Load product types once for AI badge labels + tip-özel şablon seçimi
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/product-types");
                if (!cancelled && res.ok) {
                    const data = (await res.json()) as ProductTypeRow[];
                    setAiSuggestedTypes(data.map(t => ({ id: t.id, name: t.name })));
                }
            } catch { /* graceful */ }
        })();
        return () => { cancelled = true; };
    }, []);

    // Excel sihirbazından "AI ile analiz et" kaçışıyla gelen dosyayı al
    // (singleton oku-ve-temizle).
    useEffect(() => {
        const handed = takeImportFile("ai");
        if (handed) setAiFiles(prev => [...prev, handed]);
    }, []);

    // Dosya-önce yönlendirme: Excel/CSV → sihirbaz sayfası; diğerleri → AI kuyruğu.
    const routeFiles = (files: File[]) => {
        const excelFiles = files.filter(f => isExcelWizardFile(f.name));
        const aiBound = files.filter(f => !isExcelWizardFile(f.name));
        if (aiBound.length > 0) {
            setAiFiles(prev => [...prev, ...aiBound]);
        }
        if (excelFiles.length > 0) {
            if (excelFiles.length > 1) {
                toast({ type: "info", message: "Excel dosyalarını tek tek yükleyin — ilki sihirbazda açılıyor." });
            }
            stashImportFile(excelFiles[0], "excel");
            router.push("/dashboard/import/excel");
        }
    };

    const openExcelWizard = (file: File) => {
        stashImportFile(file, "excel");
        router.push("/dashboard/import/excel");
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {/* Header */}
            <div>
                <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                    Veri Aktarım Merkezi
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "3px" }}>
                    Dosyanı bırak — Excel/CSV toplu aktarım sihirbazında, PDF ve görseller AI çıkarımında açılır.
                </div>
            </div>

            {/* Tek giriş: dropzone */}
            <DropZone
                onFiles={routeFiles}
                disabled={isDemo}
                disabledTooltip={DEMO_DISABLED_TOOLTIP}
            />

            {/* Boş durum — kısa yönlendirme */}
            {aiFiles.length === 0 && (
                <output
                    style={{
                        padding: "14px 18px",
                        background: "var(--surface-subtle)",
                        border: "var(--line-width) dashed var(--surface-border)",
                        borderRadius: "8px",
                        boxShadow: "var(--surface-shadow-sm)",
                        color: "var(--text-tertiary)",
                        fontSize: "12px", lineHeight: 1.6,
                    }}
                >
                    <div style={{ fontWeight: 600, color: "var(--text-secondary)", marginBottom: "4px" }}>
                        Sistem dosya tipini tanır
                    </div>
                    <b>Excel/CSV</b> → sheet, kolon ve alan bazlı onaylı toplu aktarım sihirbazı (
                    <Link href="/dashboard/import/excel" style={{ color: "var(--accent-text)", textDecoration: "none" }}>doğrudan aç</Link>
                    ). <b>PDF, görsel, datasheet, sertifika</b> → AI sınıflandırır, eşleşen ürünleri bulur,
                    onayınla uygular.
                </output>
            )}

            {/* AI sınıflandırma kuyruğu */}
            <ClassifierQueue
                files={aiFiles}
                suggestedProductTypes={aiSuggestedTypes}
                onClear={() => setAiFiles([])}
                onRemove={file => setAiFiles(prev => prev.filter(f => f !== file))}
                onOpenExcelWizard={openExcelWizard}
            />

            {/* Şablon satırı — eski 290 satırlık rehber bloğunun sade hali */}
            <section
                aria-label="Excel şablonları"
                style={{
                    display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap",
                    padding: "10px 14px",
                    background: "var(--surface-subtle)",
                    border: "var(--line-width) solid var(--surface-border)",
                    borderRadius: "8px",
                }}
            >
                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                    <FileSpreadsheet size={14} aria-hidden /> Şablon indir:
                </span>
                {TEMPLATE_LINKS.map(tpl => (
                    <a
                        key={tpl.kind}
                        href={tpl.href}
                        download
                        title={`${tpl.title} — ${tpl.columnCount} sütun · ${tpl.requiredCount} zorunlu`}
                        style={{
                            fontSize: "11px", padding: "4px 9px", borderRadius: "5px",
                            border: "var(--line-width) solid var(--border-tertiary)",
                            color: "var(--text-secondary)", background: "var(--surface-raised)",
                            textDecoration: "none", whiteSpace: "nowrap",
                        }}
                    >
                        {tpl.title}
                    </a>
                ))}
                {/* Faz B — tip-özel şablon (ürün tipi teknik alanları sütun olarak dahil) */}
                {aiSuggestedTypes.length > 0 && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                        <select
                            value={templateTypeId}
                            onChange={e => setTemplateTypeId(e.target.value)}
                            aria-label="Ürün tipi seç"
                            title="Teknik alanları (DN, PN, malzeme vb.) sütun olarak içeren tip-özel şablon"
                            style={{
                                fontSize: "11px", padding: "4px 8px", borderRadius: "5px",
                                border: "var(--line-width) solid var(--border-secondary)",
                                background: "var(--surface-raised)", color: "var(--text-primary)",
                            }}
                        >
                            <option value="">Tip-özel şablon…</option>
                            {aiSuggestedTypes.map(t => (
                                <option key={t.id} value={t.id}>{t.name}</option>
                            ))}
                        </select>
                        {templateTypeId && (
                            <a
                                href={`/api/import/templates?kind=product_type&typeId=${templateTypeId}`}
                                download
                                aria-label="Seçili ürün tipi şablonunu indir"
                                style={{
                                    display: "inline-flex", alignItems: "center", gap: "4px",
                                    fontSize: "11px", fontWeight: 600, padding: "4px 9px", borderRadius: "5px",
                                    background: "var(--accent-bg)", color: "var(--accent-text)",
                                    border: "var(--line-width) solid var(--accent-border)",
                                    textDecoration: "none",
                                }}
                            >
                                <Download size={12} aria-hidden /> İndir
                            </a>
                        )}
                    </span>
                )}
            </section>

            {/* Güven satırı — detaylar tooltip'te */}
            <div
                title={IMPORT_TRUST_NOTES.join("\n")}
                style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", color: "var(--text-tertiary)" }}
            >
                <ShieldCheck size={13} aria-hidden style={{ color: "var(--success-text)", flexShrink: 0 }} />
                {TRUST_LINE}
            </div>
        </div>
    );
}
