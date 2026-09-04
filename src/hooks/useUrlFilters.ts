"use client";

import { useCallback, useMemo, useRef, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * A4 — filtre durumunu URL'de tutan istemci hook'u.
 *
 * `useListUrlState`in kardeşi ama ondan YAPISAL olarak ayrı: liste sayfaları
 * RSC'dir, filtreyi SUNUCU `searchParams`'tan okur; Developer Console sayfaları
 * `"use client"` + SWR'dir, yani URL'i kendileri GERİ OKUMAK zorunda
 * (`useSearchParams`). Aynı hook ikisine birden hizmet edemezdi.
 *
 * Sözleşme — tek cümle: **parametre YOKSA varsayılan, VARSA (boş olsa bile) o
 * değer.** Hatalar ekranının varsayılanı `open` olan `status` alanı bu yüzden
 * "Tüm durumlar" (`""`) seçildiğinde `?status=` olarak yazılabiliyor; uydurma
 * bir `all` sentinel'ine gerek kalmıyor. Varsayılana eşit değer URL'e HİÇ
 * yazılmaz → paylaşılan link kısa ve okunur kalır.
 *
 * Yazma `router.replace` + `startTransition` — altı liste sayfasında
 * (`useListUrlState`) verilmiş kararın aynısı: her tuş vuruşu geçmişe kayıt
 * düşmemeli, ama URL her an gerçeği söylemeli (yenile/paylaş çalışsın).
 *
 * Yalnız `string` taşır. Çoklu seçim (Kayıtlar'ın kaynak filtresi) virgüllü
 * tek değerdir — `URLSearchParams`'ın gerçeği bu; diziyi hook'un içinde
 * gizlemek çağıranın gördüğü şeyle URL'de duran şeyi ayrıştırırdı.
 */
export interface UrlFilters<T extends Record<string, string>> {
    values: T;
    set: (partial: Partial<T>) => void;
    isPending: boolean;
}

export function useUrlFilters<T extends Record<string, string>>(defaults: T): UrlFilters<T> {
    const router = useRouter();
    const pathname = usePathname();
    const params = useSearchParams();
    const [isPending, startTransition] = useTransition();

    // Varsayılanlar ilk render'da dondurulur: çağıran nesneyi satır içi yazdığı
    // için kimliği her render'da değişir ve deps'e konsaydı `set` hiç kararlı
    // olmazdı (debounce effect'leri her render'da yeniden bağlanırdı).
    const defaultsRef = useRef(defaults);

    const values = useMemo(() => {
        const base = defaultsRef.current;
        const out = { ...base };
        for (const key of Object.keys(base)) {
            const raw = params.get(key);
            if (raw !== null) out[key as keyof T] = raw as T[keyof T];
        }
        return out;
    }, [params]);

    const valuesRef = useRef(values);
    valuesRef.current = values;

    const set = useCallback((partial: Partial<T>) => {
        const base = defaultsRef.current;
        const next = { ...valuesRef.current, ...partial };
        const qs = new URLSearchParams();
        for (const key of Object.keys(base)) {
            const value = next[key as keyof T] as string;
            if (value === base[key as keyof T]) continue;
            qs.set(key, value);
        }
        const search = qs.toString();
        startTransition(() => {
            router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
        });
    }, [router, pathname]);

    return { values, set, isPending };
}
