"use client";

import type { CSSProperties, ReactNode } from "react";
import Button from "@/components/ui/Button";

/**
 * Kategori / filtre çipleri — sistemin TEK kategori sekmesi dili.
 *
 * 2026-08-31 ölçümü: kategori sekmesi için DÖRT ayrı dil vardı —
 * `UnderlinedFilterTabs` (alt çizgili, 6 sayfa), Uyarılar'ın hap çipleri,
 * Öneriler'in kendi çipleri, Paraşüt'ün kendi çipleri. Üç hap varyantının
 * hiçbirinde pasif çipin DOLGUSU yoktu (`transparent` ya da `--bg-tertiary`),
 * aktif olan da `--accent-bg` = %10 tint'ti. Tarayıcıda ölçülen:
 * pasif `rgba(0,0,0,0)`, aktif `rgba(18,63,115,0.10)`.
 *
 * Bu bileşen KENDİ RENGİNİ YAZMAZ — doğrudan `Button`'ı sürer. Sebep yapısal:
 * "butonlar ve kategoriler aynı tasarım olsun" isteği ancak tek bir palet
 * kaynağı varsa zamanla ayrışmadan kalır. Pasif = `secondary` (beyaz), aktif =
 * `primary` (mavi) — login ekranındaki "Google ile devam et" / "Giriş Yap"
 * ikilisinin aynısı.
 *
 * Yan kazanç: `Button` `tap-44`'ü kendiliğinden veriyor; elle örülmüş çiplerde
 * dokunma hedefi yoktu.
 */
export type FilterChipItem<Key extends string> = {
    key: Key;
    label: string;
    /** Sayı rozeti. `undefined`/`null` ise rozet basılmaz (veri gelmeden sayı iddia etme). */
    count?: number | string | null;
    /** Etiketin solundaki küçük işaret — Uyarılar kategorilerindeki gibi. */
    icon?: ReactNode;
};

type FilterChipsProps<Key extends string> = {
    items: readonly FilterChipItem<Key>[];
    activeKey: Key;
    onChange: (key: Key) => void;
    ariaLabel: string;
    style?: CSSProperties;
};

/**
 * Rozet iki ayrı zeminde duruyor: mavi çipte beyaz metin, beyaz çipte koyu.
 * Tek bir token çifti ikisinde de okunmuyor — bu yüzden aktifliğe bağlı.
 */
function countBadgeStyle(active: boolean): CSSProperties {
    return {
        fontSize: "10px",
        fontWeight: 700,
        lineHeight: 1.4,
        padding: "1px 6px",
        borderRadius: "10px",
        minWidth: "18px",
        textAlign: "center",
        background: active ? "rgba(255,255,255,0.22)" : "var(--bg-tertiary)",
        color: active ? "#fff" : "var(--text-tertiary)",
    };
}

export default function FilterChips<Key extends string>({
    items,
    activeKey,
    onChange,
    ariaLabel,
    style,
}: FilterChipsProps<Key>) {
    return (
        <div
            role="tablist"
            aria-label={ariaLabel}
            style={{
                display: "flex",
                alignItems: "center",
                // 6px: dolgulu çipler kendi kenarlıklarıyla zaten ayrışıyor,
                // alt çizgili sekmeler kadar boşluğa gerek yok. Uyarılar'da 7
                // kategori 8px'te satıra sığmıyordu (ölçüm: 841 > 824).
                gap: "6px",
                // Dar ekranda çipler sarmak yerine kayar — sarmak satır
                // yüksekliğini zıplatıyor, kaydırma düzeni sabit tutuyor.
                overflowX: "auto",
                overflowY: "hidden",
                maxWidth: "100%",
                scrollbarWidth: "none",
                ...style,
            }}
        >
            {items.map((item) => {
                const active = item.key === activeKey;
                return (
                    <Button
                        key={item.key}
                        role="tab"
                        aria-selected={active}
                        variant={active ? "primary" : "secondary"}
                        size="sm"
                        onClick={() => onChange(item.key)}
                        leftIcon={item.icon}
                        // Erişilebilir ad rozet dahil okunsun: "Ticari (5)".
                        aria-label={item.count === undefined || item.count === null
                            ? item.label
                            : `${item.label} (${item.count})`}
                    >
                        {item.label}
                        {item.count !== undefined && item.count !== null && (
                            <span aria-hidden="true" style={countBadgeStyle(active)}>{item.count}</span>
                        )}
                    </Button>
                );
            })}
        </div>
    );
}
