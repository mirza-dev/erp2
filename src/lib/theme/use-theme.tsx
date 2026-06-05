"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Tema sistemi — koyu + aydınlık (Cool slate).
 *
 * - `theme`: kullanıcı tercihi ('system' | 'dark' | 'light'). localStorage'da saklanır.
 * - `resolved`: gerçekte uygulanan tema ('dark' | 'light'). 'system' ise OS tercihinden türetilir.
 *
 * FOUC yok: `data-theme` attribute'ü boyamadan ÖNCE `layout.tsx`'teki bootstrap
 * script'i ile set edilir. Provider başlangıç state'ini DOM'dan + localStorage'tan
 * okur (default'tan değil) → hydrate'te re-flash olmaz.
 */

export type ThemeChoice = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

const STORAGE_KEY = "theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

interface ThemeContextValue {
    theme: ThemeChoice;
    resolved: ResolvedTheme;
    setTheme: (next: ThemeChoice) => void;
    /** Koyu↔aydınlık arası geçiş (resolved'ın karşıtını açık seçer). */
    toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredChoice(): ThemeChoice {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw === "dark" || raw === "light" || raw === "system") return raw;
    } catch {
        // localStorage erişilemiyorsa system
    }
    return "system";
}

function systemResolved(): ResolvedTheme {
    try {
        return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
    } catch {
        return "dark";
    }
}

/** DOM'da bootstrap'ın zaten set ettiği temayı oku (re-flash önler). */
function readDomResolved(): ResolvedTheme {
    if (typeof document !== "undefined") {
        const attr = document.documentElement.getAttribute("data-theme");
        if (attr === "dark" || attr === "light") return attr;
    }
    return "dark";
}

function applyDom(resolved: ResolvedTheme) {
    if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", resolved);
    }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    // İlk değerler render-time okunur (default'tan değil). SSR'da güvenli default,
    // client'ta bootstrap'ın boyadığı değerle hizalı → flash yok.
    const [theme, setThemeState] = useState<ThemeChoice>(() =>
        typeof window === "undefined" ? "system" : readStoredChoice(),
    );
    const [resolved, setResolved] = useState<ResolvedTheme>(() =>
        typeof window === "undefined" ? "dark" : readDomResolved(),
    );

    // Hydration veya route geçişi <html> üzerindeki bootstrap attribute'ünü
    // düşürürse seçili tema yeniden DOM'a yazılır.
    useEffect(() => {
        applyDom(resolved);
    }, [resolved]);

    // theme === 'system' iken OS tercihini canlı izle.
    useEffect(() => {
        if (theme !== "system") return;
        const mq = window.matchMedia(DARK_QUERY);
        const onChange = () => {
            const next = mq.matches ? "dark" : "light";
            setResolved(next);
            applyDom(next);
        };
        onChange(); // anlık senkron
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [theme]);

    const setTheme = useCallback((next: ThemeChoice) => {
        setThemeState(next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch {
            // sessiz — persist edilemezse oturum boyunca state'te tutulur
        }
        const nextResolved = next === "system" ? systemResolved() : next;
        setResolved(nextResolved);
        applyDom(nextResolved);
    }, []);

    const toggle = useCallback(() => {
        setTheme(resolved === "dark" ? "light" : "dark");
    }, [resolved, setTheme]);

    const value = useMemo<ThemeContextValue>(
        () => ({ theme, resolved, setTheme, toggle }),
        [theme, resolved, setTheme, toggle],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
    const ctx = useContext(ThemeContext);
    if (!ctx) {
        throw new Error("useTheme must be used within a ThemeProvider");
    }
    return ctx;
}
