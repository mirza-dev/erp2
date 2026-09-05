"use client";

import Link from "next/link";
import type { ReactNode, Ref } from "react";

/**
 * Gezinme rayının TEK kaynağı — Sidebar ve Ayarlar şeridi buradan beslenir.
 *
 * 2026-09-05 ölçümü üç gezinme yüzeyi buldu ve **eksenlerin çaprazlandığını**
 * gösterdi:
 *
 *   · GÖRSEL eksende ikili **Sidebar + Ayarlar** — aynı üç nav token'ı
 *     (`--nav-hover-bg` / `--nav-active-bg` / `--nav-active-border`), aynı 2px
 *     sol accent şeridi, aynı 7px yarıçap, aynı 13px. İki uygulama, altı
 *     ölçülebilir kayma.
 *   · MANTIK ekseninde ikili **Sidebar + Developer** — `isActiveHref`in gövdesi
 *     iki dosyada BİREBİR aynı yazılmıştı.
 *
 * Yani tek bir bileşen üçünü kapsayamaz. Bu dosya iki ekseni ayrı ayrı çözer:
 * görsel çekirdek `.nav-rail-item` CSS sınıfında (Sidebar + Ayarlar), aktif
 * hesabı `isActiveHref`te (Sidebar + Developer). Developer'ın ALT ÇİZGİ dili
 * KASTEN korundu: o yatay bir sekme şeridi, dikey ray dili orada yanlış olurdu.
 *
 * `NavLink` / `NavButton` ikilisi `Button.tsx`'in `Button` / `ButtonLink`
 * emsalini birebir izler: tek stil çekirdeği, iki eleman. Ayarlar bir
 * `<button>` (rota değil `?tab=` sorgusu iter), Sidebar bir `<a>` — ve
 * `dashboard.spec.ts` üç sidebar öğesini `getByRole("link")` ile arıyor, yani
 * `<a>` olmak sözleşme.
 *
 * `aria-current` HER İKİ elemanda da buradan basılır. Sebep ölçülmüş bir
 * eksiklik: Sidebar'ın 16-18 bağlantısında aktif durum ekran okuyucuya
 * HİÇBİR BİÇİMDE bildirilmiyordu — altı işaretin (zemin, metin rengi,
 * kenarlık, kalınlık, şerit, ikon opaklığı) altısı da yalnız görseldi.
 */

/**
 * Aktif rota hesabı — Sidebar ve Developer konsolu aynı ifadeyi paylaşır.
 *
 * `exact` yalnız kendi rotasında aktif olması gerekenler için (`/dashboard` ve
 * `/dashboard/settings`): onlar olmasa alt sayfalar iki öğeyi birden yakardı.
 */
export function isActiveHref(pathname: string, href: string, exact?: boolean): boolean {
    return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

interface RailProps {
    active: boolean;
    /** Baştaki ikon. Çağıran kendi `size`/`strokeWidth`ini verir. */
    icon?: ReactNode;
    /** Sondaki yuva: Sidebar sayaç rozeti · Ayarlar kirli-noktası. */
    trailing?: ReactNode;
    /** Yüzeye özgü ek sınıf (örn. Ayarlar'ın mobil yatay şerit ezmeleri). */
    className?: string;
    children: ReactNode;
}

export type NavLinkProps = RailProps & {
    href: string;
    onClick?: () => void;
    /** Etiket kısaldığında tam metni gösterir. */
    title?: string;
};

export type NavButtonProps = RailProps & {
    onClick: () => void;
    id?: string;
    /** Görünen etiketten farklı bir erişilebilir ad gerektiğinde. */
    ariaLabel?: string;
    ref?: Ref<HTMLButtonElement>;
};

function railClass(active: boolean, className?: string): string {
    return `nav-rail-item${active ? " is-active" : ""}${className ? ` ${className}` : ""}`;
}

/**
 * Etiket ayrı bir `<span>`: kısaltma (`text-overflow`) yalnız metne uygulanmalı,
 * ikona ve sondaki rozete değil.
 */
function RailBody({ icon, trailing, children }: Pick<RailProps, "icon" | "trailing" | "children">) {
    return (
        <>
            {icon}
            <span className="nav-rail-label">{children}</span>
            {trailing}
        </>
    );
}

export function NavLink({ href, active, icon, trailing, className, onClick, title, children }: NavLinkProps) {
    return (
        <Link
            href={href}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            className={railClass(active, className)}
            title={title}
        >
            <RailBody icon={icon} trailing={trailing}>{children}</RailBody>
        </Link>
    );
}

export function NavButton({ active, icon, trailing, className, onClick, id, ariaLabel, ref, children }: NavButtonProps) {
    return (
        <button
            type="button"
            id={id}
            ref={ref}
            onClick={onClick}
            aria-current={active ? "page" : undefined}
            aria-label={ariaLabel}
            className={railClass(active, className)}
        >
            <RailBody icon={icon} trailing={trailing}>{children}</RailBody>
        </button>
    );
}
