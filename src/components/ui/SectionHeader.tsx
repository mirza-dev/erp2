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
    /** BOŞLUK istisnası. En dış elemana iner. */
    style?: CSSProperties;
}

export default function SectionHeader({
    children,
    variant = "label",
    level = 2,
    id,
    icon,
    description,
    rule,
    action,
    style,
}: SectionHeaderProps) {
    const Tag = level === 3 ? "h3" : "h2";
    const hasSlot = Boolean(action || description || rule);

    const heading = (
        <Tag
            id={id}
            style={{
                ...TYPOGRAPHY[variant],
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
