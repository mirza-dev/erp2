import type { CSSProperties, ReactNode } from "react";

/**
 * Bölüm başlığı — ve HER ZAMAN gerçek bir başlık elemanı.
 *
 * 2026-09-05 ölçümü 85 çağrı yeri ve 42 varyant buldu. Kusur yalnız görsel
 * ayrışma değildi:
 *
 *   · 44 bölüm etiketi (`"Genel Bilgiler"`, `"Ticari Süreç"`, `"Stok
 *     Yönetimi"`…) `<div>` olarak yazılmıştı. Başlık gibi GÖRÜNÜYOR, başlık
 *     DEĞİLLER — belge ana hattına hiç girmiyorlar.
 *   · Sonuç ölçüldü: `orders/[id]` ve `quotes/[id]` sayfalarının h1/h2/h3
 *     sayısı SIFIRDI. Uygulamanın en çok kullanılan iki detay sayfasında ekran
 *     okuyucuyla başlıktan başlığa gezinmek mümkün değildi.
 *
 * Bu, `Drawer` turunun "ilan etmek ≠ davranmak" dersinin TERSTEN hâli: orada
 * işaretleme vardı davranış yoktu, burada görünüm vardı işaretleme yoktu.
 *
 * Üstelik iki rakip çözüm AYNI DOSYADA duruyordu (`settings/page.tsx`: `const
 * sectionTitle` mb12 ve `function SectionHeader` mb6+mt20), üçüncüsü
 * `products/[id]`de (9 çağrı, alt çizgili), dördüncüsü `console-ui.ts`te
 * (12 çağrı, `<h2>`, kapı korumalı) — dördü de birbirinden habersiz.
 *
 * ## Üç rol, üç ölçek
 *
 * Varyantlar keyfî değil; her biri farklı bir YUVALANMA seviyesini adlandırır
 * ve `level` ile birlikte hareket eder:
 *
 *   · `label`  — kartın İÇİNDEKİ alan grubunu adlandırır (yoğun panel dili).
 *   · `title`  — kartın KENDİSİNİ adlandırır.
 *   · `dialog` — bir diyaloğun/çekmecenin adı; `aria-labelledby` hedefi.
 *
 * ## Kanonik değerler ölçülen dağılımın tepesinden
 *
 * Etiket ailesinde (69 blok): `11px`=38 · `--text-tertiary`=55 ·
 * `0.04em`=33 · `marginBottom: 10px`=9. Ağırlık için sayı yerine TOKEN
 * seçildi (`--font-label-weight`, 600): 600 ile 700 sayıca başabaştı ve
 * token deponun kendi anlamsal kaynağı.
 *
 * `--font-label-weight`i `Input.tsx`'in `labelStyle()`ından TÜRETMEK yasak:
 * `form-consistency.test.ts` o yardımcının `textTransform` TAŞIMAMASINI
 * kilitliyor (kullanıcı kararı: Türkçe uzun form etiketleri BÜYÜK HARFte satır
 * kaplıyor). Bölüm etiketi ayrı bir roldür ve kendi tanımını taşır.
 *
 * ## `style` en DIŞ elemana iner
 *
 * Ek yuvası (`action`/`description`/`rule`) yoksa bileşen TEK eleman basar ve
 * `style` başlığın kendisine gider; yuva varsa sarmalayıcıya. `style`
 * pratikte yalnız BOŞLUK istisnası için kullanılır ve boşluk zaten en dış
 * elemanın işidir. Her kullanımı denetim raporunda sayılır — kaçış kapısı
 * sessizce yeni bir varyanta dönüşmesin.
 */

export type SectionHeaderVariant = "label" | "title" | "dialog";

/**
 * Başlığın ANLAMSAL rengi. Varsayılan `default`.
 *
 * 2026-09-08 turunda `quotes/[id]`nin onay diyaloğu `SectionHeader`a
 * TAŞINAMADI: başlığı yıkıcı işlemde `--danger-text`e dönüyor ve bileşende
 * bunu ifade edecek bir kol yoktu. `style` kaçış kapısı da doğru cevap
 * değildi — sözleşmesi yalnız BOŞLUK ve renk oradan sızarsa kural ölçülemez
 * hale gelirdi.
 *
 * Ton bir VARYANT değil: ölçek/ağırlık/harf aralığı aynen kalır, yalnız renk
 * anlamı taşır. Bu yüzden ayrı bir eksen.
 *
 * `warning` de gerçek bir ihtiyaçtan geldi: `style` tipi daraltılınca ölçüldü
 * ki BEŞ çağrı yeri sözleşmeyi zaten deliyordu — üçü renk (2× danger, 1×
 * warning), ikisi satır yüksekliği. Kaçış kapısı YORUMDA yasaklıydı ama
 * TİPTE açıktı ve fiilen kullanılıyordu.
 */
export type SectionHeaderTone = "default" | "danger" | "warning";

const TONE_COLOR: Record<SectionHeaderTone, string | undefined> = {
    default: undefined,
    danger: "var(--danger-text)",
    warning: "var(--warning-text)",
};

const TYPOGRAPHY: Record<SectionHeaderVariant, CSSProperties> = {
    label: {
        fontSize: "11px",
        fontWeight: "var(--font-label-weight)",
        color: "var(--text-tertiary)",
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        margin: "0 0 10px",
    },
    title: {
        fontSize: "13px",
        fontWeight: "var(--font-heading-weight)",
        color: "var(--text-primary)",
        margin: 0,
    },
    dialog: {
        fontSize: "16px",
        fontWeight: "var(--font-heading-weight)",
        color: "var(--text-primary)",
        // Diyalog başlığı SARABİLİR (e-posta konusu, not başlığı) ve iki çağrı
        // yeri 2026-09-10'a kadar bunu bağımsız olarak `style` ile telafi
        // ediyordu — ikisi de tam olarak 1.35 yazmıştı. Tekrarlayan ayar
        // bileşen varsayılanı olur (`feedback_global_over_hardcode`).
        lineHeight: 1.35,
        margin: 0,
    },
};

/** `rule` — başlığın altındaki ayraç. `products/[id]`nin dokuz bölümünün dili. */
const RULE: CSSProperties = {
    paddingBottom: "6px",
    borderBottom: "var(--line-width) solid var(--border-tertiary)",
};

const ROW: CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "12px",
};

const WITH_ICON: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "7px",
};

const DESCRIPTION: CSSProperties = {
    fontSize: "12px",
    color: "var(--text-tertiary)",
    lineHeight: 1.5,
    margin: "4px 0 0",
};

export interface SectionHeaderProps {
    children: ReactNode;
    /** Varsayılan `label` — ölçümde en yaygın rol (44 çağrı). */
    variant?: SectionHeaderVariant;
    /** Başlık seviyesi. Kart İÇİ alt grup → 3. Varsayılan 2. */
    level?: 2 | 3;
    /** `aria-labelledby` hedefi olacaksa. */
    id?: string;
    /** Başlığın İÇİNDEKİ ikon. Çağıran kendi `size`ını verir. */
    icon?: ReactNode;
    /** Başlığın ALTINDAKİ açıklama satırı. */
    description?: ReactNode;
    /** Altta ayraç çizgisi. */
    rule?: boolean;
    /** Sağ blok: buton · "Tümü →" · sayaç. */
    action?: ReactNode;
    /**
     * Anlamsal renk. Yalnız `color` değişir; ölçek/ağırlık varyanttan gelir.
     * Yıkıcı onay diyaloglarında `danger`.
     */
    tone?: SectionHeaderTone;
    /**
     * BOŞLUK istisnası. En dış elemana iner.
     *
     * Tip, boşluk anahtarlarıyla SINIRLI: sözleşme 2026-09-05'te yalnız
     * yorumda yazıyordu ve `CSSProperties` renk/ölçek geçirmeye açıktı
     * (slot'suz çağrıda `style` en son yayıldığı için tipografiyi EZERDİ).
     * Renk için `tone`, ölçek için `variant` var — kaçış kapısı kapalı.
     */
    style?: SectionHeaderSpacing;
}

/** `style` yalnız dış boşluk taşır — renk `tone`, ölçek `variant` işidir. */
export type SectionHeaderSpacing = Pick<
    CSSProperties,
    "margin" | "marginTop" | "marginBottom" | "marginLeft" | "marginRight"
    | "marginBlock" | "marginBlockStart" | "marginBlockEnd"
    | "marginInline" | "marginInlineStart" | "marginInlineEnd"
    | "padding" | "paddingTop" | "paddingBottom" | "paddingLeft" | "paddingRight"
    | "paddingBlock" | "paddingInline"
>;

export default function SectionHeader({
    children,
    variant = "label",
    level = 2,
    id,
    icon,
    description,
    rule,
    action,
    tone = "default",
    style,
}: SectionHeaderProps) {
    const Tag = level === 3 ? "h3" : "h2";
    const hasSlot = Boolean(action || description || rule);

    const heading = (
        <Tag
            id={id}
            style={{
                ...TYPOGRAPHY[variant],
                ...(TONE_COLOR[tone] ? { color: TONE_COLOR[tone] } : null),
                ...(icon ? WITH_ICON : null),
                // Sarmalayıcı varsa boşluk ONUN işi; başlık sıfırlanır.
                ...(hasSlot ? { margin: 0 } : null),
                ...(hasSlot ? null : style),
            }}
        >
            {icon}
            {children}
        </Tag>
    );

    if (!hasSlot) return heading;

    return (
        <div style={{ ...TYPOGRAPHY[variant], ...MARGIN_ONLY, ...(rule ? RULE : null), ...style }}>
            {action ? <div style={ROW}>{heading}{action}</div> : heading}
            {description ? <p style={DESCRIPTION}>{description}</p> : null}
        </div>
    );
}

/**
 * Sarmalayıcı YALNIZ dış boşluğu devralır — tipografiyi değil.
 *
 * Aksi hâlde `color`/`fontSize` sarmalayıcıdan `description`a da miras kalır
 * ve açıklama satırı sessizce BÜYÜK HARF olurdu.
 */
const MARGIN_ONLY: CSSProperties = {
    fontSize: undefined,
    fontWeight: undefined,
    color: undefined,
    letterSpacing: undefined,
    textTransform: undefined,
};
