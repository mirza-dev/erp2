"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";

/**
 * A1 server-side pagination — liste sayfası client tarafı URL-state yönetimi.
 *
 * Filtre/arama/sayfa değerleri SUNUCU (URL/props) tek kaynağında tutulur; bu hook
 * yalnız değişikliği URL'e yazar (router.replace → sunucu yeniden render eder).
 * `current` bir ref'te tutulur → `navigate` kararlıdır (deps yalnız router/pathname)
 * → debounce effect'leri her parent render'da yeniden bağlanmaz.
 */
export interface ListUrlState<T> {
    navigate: (partial: Partial<T>) => void;
    isPending: boolean;
}

export function useListUrlState<T extends object>(
    current: T,
    serialize: (params: T) => URLSearchParams,
): ListUrlState<T> {
    const router = useRouter();
    const pathname = usePathname();
    const [isPending, startTransition] = useTransition();

    const currentRef = useRef(current);
    currentRef.current = current;
    const serializeRef = useRef(serialize);
    serializeRef.current = serialize;

    const navigate = useCallback((partial: Partial<T>) => {
        const next = { ...currentRef.current, ...partial };
        const qs = serializeRef.current(next).toString();
        startTransition(() => {
            router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
        });
    }, [router, pathname]);

    return { navigate, isPending };
}

/**
 * Arama kutusu için debounce: yazarken responsive (yerel state), duraklayınca
 * `onCommit` (genelde `navigate({search})`). Sunucu değeri (`serverValue`)
 * dışarıdan değişince (geri/ileri navigasyon) input senkronlanır.
 */
export function useDebouncedSearch(
    serverValue: string,
    onCommit: (value: string) => void,
    delay = 350,
): { value: string; setValue: (v: string) => void } {
    const [value, setValue] = useState(serverValue);
    const onCommitRef = useRef(onCommit);
    onCommitRef.current = onCommit;

    // Dış navigasyonda (back/forward) yerel input'u sunucu değeriyle senkronla.
    useEffect(() => { setValue(serverValue); }, [serverValue]);

    useEffect(() => {
        if (value === serverValue) return;
        const t = setTimeout(() => onCommitRef.current(value.trim()), delay);
        return () => clearTimeout(t);
    }, [value, serverValue, delay]);

    return { value, setValue };
}
