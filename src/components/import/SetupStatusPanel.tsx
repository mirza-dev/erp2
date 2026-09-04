"use client";

/**
 * Kurulum Durumu paneli — Veri Aktarım Merkezi'nin konumlandırma cevabı.
 *
 * NEDEN VAR: sayfa dosya BİÇİMİNE göre kurgulanmıştı ("Excel mi PDF mi"),
 * kullanıcı ise İŞE göre düşünüyor ("ürün listemi yükleyeyim"). Sayfayı ilk
 * açan kişiye ne yapabileceğini hiçbir yer söylemiyordu — 5 günlük çalışan
 * simülasyonunda dört kişiden hiçbiri bu sayfayı açmadı bile.
 *
 * Panel sırayı kullanıcı adına düşünür: ürün tipleri → ürünler → cariler →
 * tedarikçiler → açılış stoğu. Sıra keyfî değil; ürünler tiplerden ÖNCE
 * yüklenirse teknik alanlar boş kalır, tedarikçi-ürün bağı ürünlerden önce
 * kurulamaz.
 *
 * Sayılar GERÇEK veriden gelir (`/api/import/setup-status`) — elle
 * işaretlenebilen bir kontrol listesi DEĞİLDİR.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, ChevronRight, Circle, Download, Upload } from "lucide-react";
import Button from "@/components/ui/Button";
import type { ImportSetupStatus } from "@/lib/supabase/import-setup-status";
import type { ExcelImportTemplateKind } from "@/lib/import-center";

export interface SetupStep {
    id: string;
    title: string;
    /** Ne yaptığı — tek cümle, kullanıcının dilinde. */
    hint: string;
    /** Bu adım tamam mı? */
    done: boolean;
    /** Sayı özeti — "20 ürün · 8 tip" gibi. */
    summary: string;
    /** Dikkat çekilmesi gereken durum (tamam olsa bile gösterilir). */
    warning?: string;
    /** İndirilebilir şablon (varsa). */
    template?: ExcelImportTemplateKind;
    /** İlgili modülün sayfası. */
    href: string;
    /** Bu adımı sihirbazda açan bağlantı (şablonu olmayan adımda yok). */
    wizardKind?: ExcelImportTemplateKind;
}

/**
 * Sayaçlardan adımları türetir. Saf fonksiyon — test edilebilir, UI'dan bağımsız.
 */
export function buildSetupSteps(s: ImportSetupStatus): SetupStep[] {
    const { productTypes, products, customers, vendors, stock } = s;

    return [
        {
            id: "product_types",
            title: "Ürün tipleri",
            hint: "Teknik alanları (DN, PN, malzeme…) tanımlar. Ürünlerden ÖNCE gelmeli — sonra yüklenirse teknik alanlar boş kalır.",
            done: productTypes.withFields > 0,
            summary: `${productTypes.total} tip · ${productTypes.withFields} tanesinde alan tanımlı`,
            warning: productTypes.total > 0 && productTypes.withFields === 0
                ? "Hiçbir tipte teknik alan tanımlı değil — ürünlerin teknik verisi tutulamaz."
                : undefined,
            href: "/dashboard/settings/product-types",
        },
        {
            id: "products",
            title: "Ürünler",
            hint: "Katalog: SKU, ad, birim, kategori ve ürün tipine bağlı teknik alanlar.",
            done: products.total > 0,
            summary: `${products.total} aktif ürün`,
            warning: products.withoutType > 0
                ? `${products.withoutType} aktif ürünün tipi yok — teknik alanları tutulamaz.`
                : products.withoutSku > 0
                    ? `${products.withoutSku} aktif ürünün SKU'su yok — stok ve sipariş eşleşmesi yapılamaz.`
                    : undefined,
            template: "product",
            wizardKind: "product",
            href: "/dashboard/products",
        },
        {
            id: "customers",
            title: "Cariler",
            hint: "Müşteri listesi: unvan, vergi no, adres, ödeme vadesi. Teklif ve sipariş bunlara bağlanır.",
            done: customers.total > 0,
            summary: `${customers.total} cari`,
            template: "customer",
            wizardKind: "customer",
            href: "/dashboard/customers",
        },
        {
            id: "vendors",
            title: "Tedarikçiler ve ürün kodları",
            hint: "Tedarikçi kartları + hangi ürünü kimden, hangi kodla/lead time/MOQ ile aldığın.",
            done: vendors.total > 0,
            summary: `${vendors.total} tedarikçi · ${vendors.productLinks} ürün bağı · ${vendors.productsWithPreferred} üründe tercihli tedarikçi`,
            warning: vendors.total > 0 && vendors.productLinks === 0
                ? "Hiçbir ürün tedarikçiye bağlı değil — satın alma önerileri kaynak bulamaz."
                : vendors.productLinks > 0 && vendors.productsWithPreferred === 0
                    // Bağ var ama hiçbirinde "tercihli" işaretli değil: satın alma
                    // önerisi hangi tedarikçiye sipariş açacağını seçemez.
                    ? "Hiçbir üründe tercihli tedarikçi seçili değil — satın alma önerisi kaynak seçemez."
                    : undefined,
            template: "vendor_product_relation",
            wizardKind: "vendor_product_relation",
            href: "/dashboard/vendors",
        },
        {
            id: "stock",
            title: "Açılış stokları",
            hint: "Depodaki fiili miktarlar. Sistemin ilk günkü gerçekliği bununla oturur.",
            done: stock.productsWithStock > 0,
            summary: `${stock.productsWithStock} üründe stok var`,
            warning: products.total > 0 && stock.productsWithStock === 0
                ? "Hiçbir üründe stok yok — sevk edilebilirlik ve kritik stok uyarıları çalışmaz."
                : undefined,
            template: "stock_count",
            wizardKind: "stock_count",
            href: "/dashboard/products",
        },
    ];
}

export interface SetupStatusPanelProps {
    /** Sihirbazı belirli bir tiple açar (hub'ın stash akışına dokunmaz). */
    onOpenStep?: (kind: ExcelImportTemplateKind) => void;
    disabled?: boolean;
    disabledTooltip?: string;
}

export default function SetupStatusPanel({ onOpenStep, disabled, disabledTooltip }: SetupStatusPanelProps) {
    const [status, setStatus] = useState<ImportSetupStatus | null>(null);
    const [loadFailed, setLoadFailed] = useState(false);
    // Kullanıcının açma/kapama tercihi; null = henüz karar vermedi, o zaman
    // "hepsi tamam mı" belirler (tamamsa katlanır).
    const [expandedOverride, setExpandedOverride] = useState<boolean | null>(null);

    useEffect(() => {
        const ac = new AbortController();
        (async () => {
            try {
                const res = await fetch("/api/import/setup-status", { signal: ac.signal });
                if (!res.ok) { setLoadFailed(true); return; }
                setStatus((await res.json()) as ImportSetupStatus);
            } catch {
                if (!ac.signal.aborted) setLoadFailed(true);
            }
        })();
        return () => ac.abort();
    }, []);

    // Yüklenemediyse panel hiç görünmez — yanlış sayı göstermektense göstermemek
    // daha doğru; dropzone ve şablonlar zaten çalışıyor.
    if (loadFailed || !status) return null;

    const steps = buildSetupSteps(status);
    const doneCount = steps.filter(s => s.done).length;
    const allDone = doneCount === steps.length;
    const expanded = expandedOverride ?? !allDone;

    return (
        <section
            aria-label="Kurulum durumu"
            style={{
                background: "var(--surface-raised)",
                border: "var(--line-width) solid var(--surface-border)",
                borderRadius: "8px",
                boxShadow: "var(--surface-shadow-sm)",
                overflow: "hidden",
            }}
        >
            <button
                type="button"
                onClick={() => setExpandedOverride(!expanded)}
                aria-expanded={expanded}
                style={{
                    display: "flex", alignItems: "center", gap: "8px", width: "100%",
                    padding: "11px 14px", background: "transparent", border: "none",
                    cursor: "pointer", textAlign: "left", color: "var(--text-primary)",
                }}
            >
                {expanded ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />}
                <span style={{ fontSize: "13px", fontWeight: 600 }}>Kurulum Durumu</span>
                <span style={{ fontSize: "11px", color: allDone ? "var(--success-text)" : "var(--text-tertiary)" }}>
                    {doneCount}/{steps.length} adım tamam
                </span>
            </button>

            {expanded && (
                <div style={{ borderTop: "var(--line-width) solid var(--surface-border)" }}>
                    {steps.map((step, i) => (
                        <div
                            key={step.id}
                            style={{
                                display: "flex", alignItems: "flex-start", gap: "10px",
                                padding: "12px 14px",
                                borderTop: i > 0 ? "var(--line-width) solid var(--border-tertiary)" : "none",
                            }}
                        >
                            <span style={{ flexShrink: 0, marginTop: "1px" }}>
                                {step.done
                                    ? <CheckCircle2 size={15} aria-hidden style={{ color: "var(--success-text)" }} />
                                    : <Circle size={15} aria-hidden style={{ color: "var(--text-tertiary)" }} />}
                            </span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                                    <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>
                                        {i + 1}. {step.title}
                                    </span>
                                    <Link
                                        href={step.href}
                                        style={{ fontSize: "11px", color: "var(--text-secondary)", textDecoration: "none" }}
                                    >
                                        {step.summary} →
                                    </Link>
                                </div>
                                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "3px", lineHeight: 1.5 }}>
                                    {step.hint}
                                </div>
                                {step.warning && (
                                    <div style={{ fontSize: "11px", color: "var(--warning-text)", marginTop: "4px", lineHeight: 1.5 }}>
                                        ⚠ {step.warning}
                                    </div>
                                )}
                            </div>

                            {step.template && (
                                <div style={{ display: "flex", gap: "6px", flexShrink: 0, alignItems: "center" }}>
                                    <a
                                        href={`/api/import/templates?kind=${step.template}`}
                                        download
                                        title={`${step.title} şablonunu indir`}
                                        style={{
                                            display: "inline-flex", alignItems: "center", gap: "4px",
                                            fontSize: "11px", padding: "4px 9px", borderRadius: "5px",
                                            border: "var(--line-width) solid var(--border-tertiary)",
                                            color: "var(--text-secondary)", background: "var(--surface-subtle)",
                                            textDecoration: "none", whiteSpace: "nowrap",
                                        }}
                                    >
                                        <Download size={12} aria-hidden /> Şablon
                                    </a>
                                    {step.wizardKind && onOpenStep && (
                                        <Button
                                            type="button"
                                            variant="primary"
                                            size="xs"
                                            onClick={() => onOpenStep(step.wizardKind!)}
                                            disabled={disabled}
                                            title={disabled ? disabledTooltip : `${step.title} için sihirbazı aç`}
                                            leftIcon={<Upload size={13} aria-hidden />}
                                        >
                                            Yükle
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
