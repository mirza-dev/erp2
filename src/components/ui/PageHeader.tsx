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
    /**
     * Başlığın YANINDA duran küçük içerik — tipik olarak bir durum rozeti.
     *
     * Neden ayrı bir yuva: bu kalıp ERP'de her belge ekranında var (sipariş
     * numarası + "Onaylandı", RFQ numarası + "Gönderildi"). `title`'ı ReactNode
     * yapmak da olurdu ama o zaman `refreshAriaLabel` varsayılanı (`${title}
     * listesini yenile`) metin üretemezdi. Başlık metin kalıyor, süs ayrı geliyor.
     */
    titleAdornment?: ReactNode;
    /**
     * Dikey hiza. Varsayılan `center` — tek satırlık aksiyonlarda doğrusu bu.
     *
     * `start`: sağdaki aksiyon bloğu ÇOK SATIRLIYSA (ör. Üretim ekranında
     * etiketli tarih seçici + düğme + durum satırı). Orada `center` başlığı
     * bloğun ortasına, yani gözle görülür biçimde aşağı kaydırırdı. Bu bir
     * kaçamak değil: hiza sayfanın içeriğine bağlı gerçek bir düzen kararı,
     * tipografi ise her iki durumda da ortak.
     */
    align?: "center" | "start";
}

const titleStyle: React.CSSProperties = {
    fontSize: "20px",
    fontWeight: 600,
    color: "var(--text-primary)",
    margin: 0,
};

export default function PageHeader({
    title,
    subtitle,
    onRefresh,
    refreshing = false,
    refreshAriaLabel,
    actions,
    titleAdornment,
    align = "center",
}: PageHeaderProps) {
    return (
        <div style={{
            display: "flex",
            alignItems: align === "start" ? "flex-start" : "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "8px",
        }}>
            <div>
                {/* Süs YOKSA sarmalayıcı da YOK: mevcut 20+ çağıranın DOM'u
                    birebir aynı kalsın (yapı testleri buna bakıyor) ve
                    kullanılmayan bir özellik için düğüm eklenmesin. */}
                {titleAdornment ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <h1 style={titleStyle}>{title}</h1>
                        {titleAdornment}
                    </div>
                ) : (
                    <h1 style={titleStyle}>{title}</h1>
                )}
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
