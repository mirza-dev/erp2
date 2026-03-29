"use client";

/**
 * useAIPreferences — Kullanıcı AI tercihlerini localStorage'da saklar.
 *
 * User preference memory: ERP kullanıcısının AI çıktılarını nasıl
 * görmeyi tercih ettiğini oturum/cihaz bazında hatırlar.
 *
 * Tercihler sunucu gerektirmez; localStorage yeterli (tek ekip, B2B).
 * Gerektiğinde DB'ye taşınabilir (company_settings tablosu).
 */

import { useState, useCallback } from "react";

const STORAGE_KEY = "erp_ai_prefs_v1";

export interface AIPreferences {
    /** AI badge/çıktısı yalnızca bu eşiğin üzerindeki confidence'ta gösterilir (0.0–1.0) */
    minConfidenceDisplay: number;
    /** Import önizlemesinde eşleşmeyen alanlar vurgulanır */
    showImportUnmatched: boolean;
}

const DEFAULTS: AIPreferences = {
    minConfidenceDisplay: 0.4,
    showImportUnmatched: true,
};

export function useAIPreferences(): [AIPreferences, (partial: Partial<AIPreferences>) => void] {
    // Lazy initializer — sadece ilk mount'ta çalışır, useEffect'e gerek yok
    const [prefs, setPrefs] = useState<AIPreferences>(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) return { ...DEFAULTS, ...JSON.parse(stored) };
        } catch {
            // localStorage erişilemez — defaults kullanılır
        }
        return DEFAULTS;
    });

    const updatePrefs = useCallback((partial: Partial<AIPreferences>) => {
        setPrefs(prev => {
            const next = { ...prev, ...partial };
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            } catch {
                // silent
            }
            return next;
        });
    }, []);

    return [prefs, updatePrefs];
}
