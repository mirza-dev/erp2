"use client";

import { useCallback, useMemo, useState } from "react";

export const PAGE_SIZE = 50;

export interface UsePaginationResult<T> {
    pagedItems:     T[];
    currentPage:    number;
    setCurrentPage: (page: number) => void;
    totalPages:     number;
    totalItems:     number;
    pageSize:       number;
}

export interface UsePaginationOptions {
    pageSize?: number;
    /**
     * Filtre/arama/tab kombinasyonundan üretilen string. Değişince
     * currentPage 1'e döner — kullanıcı filtre değiştirince yeni listenin
     * başından başlasın.
     */
    resetKey?: string | number | null;
}

// ── Pure helpers (test edilebilir) ──────────────────────────────────────────

export function computeTotalPages(totalItems: number, pageSize: number): number {
    if (pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(page: number, totalPages: number): number {
    return Math.max(1, Math.min(page, totalPages));
}

export function slicePage<T>(items: readonly T[], page: number, pageSize: number): T[] {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePagination<T>(
    items: readonly T[],
    options?: UsePaginationOptions,
): UsePaginationResult<T> {
    const pageSize = options?.pageSize ?? PAGE_SIZE;
    const resetKey = options?.resetKey;

    const [currentPage, setCurrentPage] = useState(1);
    // "Adjusting state based on prop change" — render sırasında prev key ile
    // karşılaştırıp setState çağırmak React'in resmi paterni; useEffect ile
    // set-state-in-effect lint kuralına yakalanmaz, ekstra render yok.
    const [prevResetKey, setPrevResetKey] = useState(resetKey);
    if (prevResetKey !== resetKey) {
        setPrevResetKey(resetKey);
        setCurrentPage(1);
    }

    const totalItems = items.length;
    const totalPages = computeTotalPages(totalItems, pageSize);

    // Filtre daraldığında sayfa numarası taşıyorsa render-time clamp.
    const safePage = clampPage(currentPage, totalPages);

    const setCurrentPageSafe = useCallback((page: number) => {
        setCurrentPage(clampPage(page, totalPages));
    }, [totalPages]);

    const pagedItems = useMemo(
        () => slicePage(items, safePage, pageSize),
        [items, safePage, pageSize],
    );

    return {
        pagedItems,
        currentPage:    safePage,
        setCurrentPage: setCurrentPageSafe,
        totalPages,
        totalItems,
        pageSize,
    };
}
