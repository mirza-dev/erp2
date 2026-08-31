"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * KÖK hata sınırı.
 *
 * 2026-08-31 denetimi (madde #9): `app/error.tsx` vardı ama o KÖK LAYOUT'ta
 * patlayan hatayı yakalamaz — layout render'ı çökerse React o sınıra hiç
 * ulaşamaz ve kullanıcı tarayıcının boş hata ekranını görür. Bu dosya Next'in
 * o durum için beklediği sınırdır ve Sentry'nin de araması gereken yer burasıdır.
 *
 * Kök layout değiştirilemediği için kendi `<html>`/`<body>`'sini render ETMEK
 * ZORUNDA. Aynı sebeple tema token'ları YÜKLENMEMİŞ olabilir — bu tek yüzeyde
 * renkler bilerek sabit yazılır ve her iki temada da okunur kalır
 * (`color-scheme: light dark` + sistem renkleri).
 */
export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);

    return (
        <html lang="tr">
            <body style={{ margin: 0, colorScheme: "light dark" }}>
                <main
                    style={{
                        minHeight: "100dvh",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "24px",
                        fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif",
                    }}
                >
                    <div style={{ textAlign: "center", maxWidth: "400px" }}>
                        <h1 style={{ fontSize: "17px", fontWeight: 600, margin: "0 0 8px" }}>
                            Uygulama başlatılamadı
                        </h1>
                        <p style={{ fontSize: "13px", opacity: 0.7, lineHeight: 1.6, margin: "0 0 22px" }}>
                            Beklenmeyen bir sorun oluştu ve kayıt altına alındı. Tekrar deneyin;
                            sorun sürerse yöneticinize bildirin.
                        </p>
                        <button
                            type="button"
                            onClick={reset}
                            style={{
                                fontSize: "13px",
                                fontWeight: 500,
                                padding: "9px 22px",
                                border: "1px solid currentColor",
                                borderRadius: "7px",
                                background: "transparent",
                                color: "inherit",
                                cursor: "pointer",
                            }}
                        >
                            Tekrar dene
                        </button>
                    </div>
                </main>
            </body>
        </html>
    );
}
