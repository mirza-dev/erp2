import type { CSSProperties, ReactNode } from "react";
import Card from "@/components/ui/Card";
import { TONE_TOKENS, type BadgeTone } from "@/components/ui/Badge";

/**
 * Sayı kutusu — büyük bir değer, altında etiketi.
 *
 * 2026-09-05 ölçümü kayıtlı sayının iki katını buldu: 3 paylaşılan bileşen +
 * 7 dosya-yerel bileşen + 26 satır içi blok, ve **20 farklı değer
 * tipografisi** (kayıtlı sayı 9'du), 9 yüzey reçetesi, 10 ızgara.
 *
 * ## Asıl bulgu: kapının kanıtladığı kusur, kapının BAKMADIĞI yerde yaşıyor
 *
 * Beş stat yüzeyi (`aging` · `products/[id]` · `import/excel` ·
 * `CustomerDetailPanel` · `VendorDetailPanel`) kutu zemini olarak
 * `--bg-secondary` kullanıyordu. `gate/surface-consistency.test.ts`in
 * "kuralın DAYANAĞI" testi bu token'ın **iki temada da `--app-bg` ile birebir
 * aynı** olduğunu zaten kanıtlıyor — yani o beş yüzey GÖRÜNMEZ KUTUYDU. Kapı
 * bu kusuru 2026-08-31'de bulup düzeltti ama yalnız BEŞ SAYFALIK bir allowlist
 * üzerinde; bu beşi listenin dışında kaldığı için o günden beri kusurluydular.
 *
 * ## Kanonik değerler ölçülen dağılımdan
 *
 * · Değer `21px` — tek başına en yaygın (MetricCard 17 + KpiCard 5-8 örnek).
 *   Ağırlık SAYI değil TOKEN (`--font-heading-weight`); ölçümde 650/680/700
 *   birbirine yakındı ve token deponun kendi kaynağı.
 * · Etiket `11px` / `--text-tertiary` / `--font-ui-weight` — `MetricCard` ile
 *   birebir. **BÜYÜK HARF YOK**: 26 yüzeyin yalnız 6'sı kullanıyordu ve
 *   `form-consistency` kanonik etiketin `textTransform` taşımamasını kasten
 *   kilitliyor (kullanıcı kararı, Türkçe uzun etiketler).
 * · Yüzey `Card` — üçlüsü (`--surface-raised` + `--surface-border` +
 *   `--surface-shadow-sm`) tek kaynakta. Dolgu `12px 14px` (ölçümde 39 kez).
 * · `tabular-nums` HER ZAMAN: ızgarada alt alta duran sayılar hizalanmalı.
 *   Ölçümde yüzeylerin ÇOĞUNDA yoktu.
 *
 * `href` propu YOK: ölçümde dönüşen 26 yüzeyin hiçbiri tıklanabilir değil
 * (tek örnek `StatsCards`, ölü kod). İhtiyaç doğunca eklenir — `Card` `as="a"`
 * desteklemediği için o gün ayrı bir karar gerekecek.
 */

export interface StatProps {
    label: ReactNode;
    /** `null`/`undefined` → `emptyText` yazılır; uydurma değer YOK. */
    value: ReactNode;
    /** Değerin rengi. Verilmezse `--text-primary`. */
    tone?: BadgeTone;
    /** Değerin ALTINDAKİ açıklama satırı. */
    sub?: ReactNode;
    subTone?: BadgeTone;
    /** Etiketin YANINDAKİ ikon. */
    icon?: ReactNode;
    /** Etiket satırının SAĞ ucundaki kontrol (`SectionHeader.action` ile aynı kalıp). */
    action?: ReactNode;
    /** Değer yokken yazılacak metin. */
    emptyText?: string;
    /** Yüzeyi (zemin/kenarlık/dolgu) EZER; tipografi ve yapı çerçevede kalır. */
    surfaceStyle?: CSSProperties;
}

const BOX: CSSProperties = {
    padding: "12px 14px",
    display: "flex",
    flexDirection: "column",
    gap: "3px",
    minWidth: 0,
};

const LABEL: CSSProperties = {
    fontSize: "11px",
    fontWeight: "var(--font-ui-weight)",
    color: "var(--text-tertiary)",
    display: "flex",
    alignItems: "center",
    gap: "6px",
    minWidth: 0,
};

const VALUE: CSSProperties = {
    fontSize: "21px",
    fontWeight: "var(--font-heading-weight)",
    lineHeight: 1.15,
    fontVariantNumeric: "tabular-nums",
};

const SUB: CSSProperties = {
    fontSize: "11px",
    color: "var(--text-tertiary)",
    lineHeight: 1.4,
};

/** Ölçülmemiş değer — 21px'lik boş bir kutu yerine sebebini söyleyen metin. */
const EMPTY: CSSProperties = {
    fontSize: "13px",
    fontWeight: "var(--font-ui-weight)",
    color: "var(--text-tertiary)",
    fontStyle: "italic",
};

function toneColor(tone: BadgeTone | undefined, fallback: string): string {
    return tone ? TONE_TOKENS[tone].text : fallback;
}

export default function Stat({
    label, value, tone, sub, subTone, icon, action, emptyText = "—", surfaceStyle,
}: StatProps) {
    const measured = value !== null && value !== undefined && value !== "";
    return (
        <Card style={{ ...BOX, ...surfaceStyle }}>
            {action ? (
                <span style={{ ...LABEL, justifyContent: "space-between", gap: "10px" }}>
                    <span style={{ ...LABEL, minWidth: 0 }}>{icon}{label}</span>
                    {action}
                </span>
            ) : (
                <span style={LABEL}>{icon}{label}</span>
            )}
            <span style={measured ? { ...VALUE, color: toneColor(tone, "var(--text-primary)") } : EMPTY}>
                {measured ? value : emptyText}
            </span>
            {sub ? (
                <span style={{ ...SUB, color: toneColor(subTone, "var(--text-tertiary)") }}>{sub}</span>
            ) : null}
        </Card>
    );
}

/**
 * Sayı kutusu ızgarası.
 *
 * `auto-fill` + `minmax` bilinçli: ölçümde on ayrı ızgara vardı ve yarısı
 * SABİT kolon sayısı yazıyordu (`repeat(3, 1fr)`), yani dar ekranda kutular
 * eziliyordu. `min` kolu, kutu içeriği gerçekten daha geniş olan yüzeyler için.
 */
export function StatGrid({ min = "170px", gap = "10px", style, children }: {
    min?: string; gap?: string; style?: CSSProperties; children: ReactNode;
}) {
    return (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fill, minmax(${min}, 1fr))`, gap, ...style }}>
            {children}
        </div>
    );
}
