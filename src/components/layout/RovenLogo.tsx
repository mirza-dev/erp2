import React, { useId } from "react";

interface RovenLogoProps {
    /** Hexagon mark kenar uzunluğu (px). Wordmark boyutu ayrıca verilmezse metin parent'tan miras alır. */
    size?: number;
    /** false → yalnız hexagon mark (ikon). Varsayılan true (mark + "Roven"). */
    showWordmark?: boolean;
    /** Wordmark fontSize override (px). Verilmezse parent fontSize'ı miras alınır. */
    wordmarkSize?: number;
    /** Mark ile wordmark arası boşluk (px). */
    gap?: number;
    className?: string;
}

const DEFAULT_GAP = 5;

/**
 * İşaretin geometrisi — `scripts/brand-mark.ts`, `src/app/icon.svg` ve
 * `src/app/global-error.tsx` (inline kopya) ile BİREBİR aynı sayılar;
 * `roven-logo.test.tsx` dördünü birbirine kilitler.
 */
const MARK_POINTS = "12,2.8 19.97,7.4 19.97,16.6 12,21.2 4.03,16.6 4.03,7.4";
const MARK_CHANNEL_PATH = "M1.5 9.6 H10.2 L13.8 14.4 H22.5";

interface RovenMarkProps {
    size: number;
    /** true → `aria-hidden`; false → `role="img"` + `aria-label="Roven"`. */
    decorative: boolean;
}

/**
 * Yalnız işaret — **Akış Altıgeni** (kullanıcı kararı 2026-09-16, marka rehberi §6).
 *
 * Yuvarlatılmış altıgen + içinden geçen tek "akış kanalı". Kanal NEGATİF
 * alandır: `<mask>` ile oyulur, böylece işaret tek renkle (`currentColor`)
 * çalışır ve koyu/aydınlık temada kendiliğinden ters döner. Mask kimliği
 * `useId` ile — aynı sayfada birden fazla logo (topbar + mock + footer) var,
 * sabit bir id ilk tanımı ezerdi.
 */
export function RovenMark({ size, decorative }: RovenMarkProps) {
    // useId'nin ayraçları (`:r0:` / `«r0»`) url(#…) parçasında tarayıcıya göre
    // sorun çıkarabilir → yalnız güvenli karakterler bırakılır (benzersizlik korunur).
    const maskId = "roven-channel-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden={decorative ? true : undefined}
            role={decorative ? undefined : "img"}
            aria-label={decorative ? undefined : "Roven"}
            style={{ display: "block", flexShrink: 0 }}
        >
            <mask id={maskId} maskUnits="userSpaceOnUse" x={0} y={0} width={24} height={24}>
                <rect width={24} height={24} fill="white" />
                <path
                    d={MARK_CHANNEL_PATH}
                    fill="none"
                    stroke="black"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
            </mask>
            <polygon
                points={MARK_POINTS}
                fill="currentColor"
                stroke="currentColor"
                strokeWidth={2.6}
                strokeLinejoin="round"
                mask={`url(#${maskId})`}
            />
        </svg>
    );
}

/**
 * Roven marka logosu — Akış Altıgeni mark + bold wordmark.
 *
 * Tema-uyumlu: renk `currentColor`/`inherit` üzerinden gelir → koyu temada
 * near-white (`var(--text-primary)` = #e6edf3), aydınlık temada koyu (#172033).
 * Logo hiçbir zaman kendi rengini taşımaz (marka rehberi §6.2).
 */
export function RovenLogo({
    size = 20,
    showWordmark = true,
    wordmarkSize,
    gap = DEFAULT_GAP,
    className,
}: RovenLogoProps) {
    const mark = <RovenMark size={size} decorative={showWordmark} />;

    if (!showWordmark) {
        return (
            <span className={className} style={{ display: "inline-flex", color: "inherit" }}>
                {mark}
            </span>
        );
    }

    return (
        <span
            className={className}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: `${gap}px`,
                color: "inherit",
                lineHeight: 1,
            }}
        >
            {mark}
            <span
                style={{
                    fontWeight: 700,
                    fontSize: wordmarkSize ? `${wordmarkSize}px` : undefined,
                    color: "currentColor",
                    letterSpacing: 0,
                }}
            >
                Roven
            </span>
        </span>
    );
}

export default RovenLogo;
