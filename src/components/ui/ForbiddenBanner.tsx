"use client";

import { useSearchParams } from "next/navigation";

/**
 * RBAC Faz 2 — yetkisiz sayfa bildirimi. proxy.ts page-gate erişimi reddedince
 * /dashboard?forbidden=<path>'e redirect eder; bu banner o path'i gösterir.
 * useSearchParams Next.js prerender için <Suspense> içinde mount edilmeli.
 */
export default function ForbiddenBanner() {
    const params = useSearchParams();
    const forbidden = params.get("forbidden");
    if (!forbidden) return null;

    return (
        <div
            role="alert"
            aria-live="polite"
            style={{
                marginBottom: "16px",
                padding: "12px 16px",
                background: "var(--danger-bg)",
                color: "var(--danger-text)",
                border: "0.5px solid var(--danger-border)",
                borderRadius: "8px",
                fontSize: "13px",
            }}
        >
            Bu sayfaya erişim yetkiniz yok (<code style={{ fontSize: "12px" }}>{forbidden}</code>). Panoya yönlendirildiniz.
        </div>
    );
}
