"use client";

import { useRef } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme/use-theme";
import { useToast } from "@/components/ui/Toast";

const LONG_PRESS_MS = 500;

/**
 * Tema geçişi — sakin topbar diline uyumlu tek ikon buton.
 *
 * - Kısa tık: koyu ↔ aydınlık geçişi.
 * - Uzun bas (≥500ms): 'system'e sıfırla (OS tercihini izle) + info toast.
 *   (2-durumlu ikon ilk tıktan sonra localStorage'ı sabitler → 'system' aksi halde
 *    ulaşılamaz olurdu; uzun-bas geri dönüş kancası.)
 */
export default function ThemeToggle() {
    const { resolved, toggle, setTheme } = useTheme();
    const { toast } = useToast();
    const timerRef = useRef<number | null>(null);
    const longPressedRef = useRef(false);

    const isDark = resolved === "dark";
    const Icon = isDark ? Moon : Sun;

    const clearTimer = () => {
        if (timerRef.current !== null) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    const handlePointerDown = () => {
        longPressedRef.current = false;
        timerRef.current = window.setTimeout(() => {
            longPressedRef.current = true;
            setTheme("system");
            toast({ type: "info", message: "Tema sistem tercihine ayarlandı" });
        }, LONG_PRESS_MS);
    };

    const handleClick = () => {
        // Uzun bas tetiklendiyse takip eden click toggle yapmasın.
        if (longPressedRef.current) {
            longPressedRef.current = false;
            return;
        }
        toggle();
    };

    return (
        <button
            type="button"
            aria-label="Temayı değiştir"
            title={isDark ? "Aydınlık temaya geç (uzun bas: sistem)" : "Koyu temaya geç (uzun bas: sistem)"}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerUp={clearTimer}
            onPointerLeave={clearTimer}
            onPointerCancel={clearTimer}
            style={{
                width: "30px",
                height: "30px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                background: "none",
                border: "none",
                borderRadius: "7px",
                color: "var(--text-secondary)",
                cursor: "pointer",
                flexShrink: 0,
                transition: "color 0.14s ease, background 0.14s ease",
            }}
        >
            <Icon size={16} strokeWidth={1.9} aria-hidden />
        </button>
    );
}
