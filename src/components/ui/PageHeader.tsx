import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Sayfa üst şeridi — başlık + özet + Yenile + aksiyonlar.
 *
 * 2026-08-24: 9 liste sayfasının üst şeridi elle yazılmıştı ve İKİ AYRI kalıba
 * ayrılmıştı:
 *   · 20px `<h1>` + `<p 13px --text-tertiary>` — orders · vendors · purchase/orders
 *     · purchase/rfqs · purchase/suggested
 *   · 14px `<div>` + `<div 12px --text-secondary>` — quotes · customers · products
 *     · production
 *
 * Yani Teklifler/Cariler/Stok/Üretim sayfalarının başlığı diğerlerinin ALT
 * BAŞLIĞI kadardı ve o dört sayfada hiç `<h1>` yoktu (başlık hiyerarşisi de
 * kırıktı). Ortak kalıp olarak 20px `<h1>` seçildi: semantik olarak doğru olan
 * ve daha yeni sayfaların (Faz B dönüşümleri) zaten kullandığı biçim.
 *
 * "Yenile" bilerek ayrı prop: 10 sayfada vardı, hepsinde farklı yazılmıştı
 * (etiket, ikon boyutu, aria-label). Tek yerden gelince metin ve erişilebilir
 * ad her sayfada aynı olur.
 */
export interface PageHeaderProps {
    title: string;
    /** Başlığın altındaki özet — sayaç, açıklama vb. Zengin içerik alabilir. */
    subtitle?: ReactNode;
    /** Verilirse standart "Yenile" butonu render edilir. */
    onRefresh?: () => void;
    /** Yenileme sürüyor — buton kilitlenir ve etiket "Yenileniyor…" olur. */
    refreshing?: boolean;
    /** Ekran okuyucu için: "Teklifleri yenile" gibi. Verilmezse genel metin. */
    refreshAriaLabel?: string;
    /** Sağ taraftaki ek içerik: birincil aksiyon, arama kutusu, filtre… */
    actions?: ReactNode;
}

export default function PageHeader({
    title,
    subtitle,
    onRefresh,
    refreshing = false,
    refreshAriaLabel,
    actions,
}: PageHeaderProps) {
    return (
        <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
        }}>
            <div>
                <h1 style={{
                    fontSize: "20px",
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    margin: 0,
                }}>
                    {title}
                </h1>
                {subtitle != null && subtitle !== "" && (
                    <p style={{
                        fontSize: "13px",
                        color: "var(--text-tertiary)",
                        margin: "4px 0 0",
                    }}>
                        {subtitle}
                    </p>
                )}
            </div>

            {(onRefresh || actions) && (
                <div style={{
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                }}>
                    {onRefresh && (
                        <Button
                            variant="toolbar"
                            size="md"
                            onClick={onRefresh}
                            disabled={refreshing}
                            aria-label={refreshAriaLabel ?? `${title} listesini yenile`}
                            leftIcon={<RefreshCw size={15} />}
                        >
                            {refreshing ? "Yenileniyor…" : "Yenile"}
                        </Button>
                    )}
                    {actions}
                </div>
            )}
        </div>
    );
}
