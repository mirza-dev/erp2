"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/lib/auth/use-permissions";
import { LoadingState } from "@/components/ui/StateViews";

/**
 * Developer Console kabuğu.
 *
 * Buradaki kontrol KOZMETİKTİR — gerçek koruma üç katmanda: `proxy.ts`
 * INTERNAL_ONLY_PREFIXES (sayfa yönlendirmesi), `page-access.ts` (kaba izin) ve
 * her `/api/developer/*` route'unun `requireInternalOperatorFor` guard'ı.
 * Yani bu bileşen kaldırılsa bile ne sayfa ne veri açılır. Yine de burada
 * duruyor: kullanıcı sessiz boş ekran yerine nedeni okusun.
 */

const NAV = [
    { href: "/dashboard/developer", label: "Genel Bakış", exact: true },
    { href: "/dashboard/developer/errors", label: "Hatalar" },
    { href: "/dashboard/developer/logs", label: "Kayıtlar" },
    { href: "/dashboard/developer/bugs", label: "Bug'lar" },
    { href: "/dashboard/developer/performance", label: "Performans" },
    { href: "/dashboard/developer/diagnostics", label: "Tanılama" },
];

export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const { internalOperator, loading } = usePermissions();

    if (loading) return <LoadingState message="Yetki doğrulanıyor…" />;

    if (!internalOperator) {
        return (
            <div
                role="alert"
                style={{
                    background: "var(--surface-raised)",
                    border: "0.5px solid var(--border-secondary)",
                    borderRadius: "10px",
                    padding: "22px",
                    maxWidth: "560px",
                }}
            >
                <h1 style={{ fontSize: "16px", fontWeight: 650, margin: "0 0 8px", color: "var(--text-primary)" }}>
                    Developer Console kapalı
                </h1>
                <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.65, margin: 0 }}>
                    Bu alan yalnız yetkili geliştirici hesabına açıktır. Erişim
                    {" "}<code>INTERNAL_OPERATOR_EMAILS</code> allowlist&apos;i ile verilir ve
                    değişken tanımsızken herkese kapalıdır.
                </p>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <nav
                aria-label="Developer Console bölümleri"
                style={{
                    display: "flex",
                    gap: "2px",
                    flexWrap: "wrap",
                    borderBottom: "0.5px solid var(--border-secondary)",
                    paddingBottom: "1px",
                }}
            >
                {NAV.map(item => {
                    const active = item.exact
                        ? pathname === item.href
                        : pathname === item.href || pathname.startsWith(item.href + "/");
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            style={{
                                fontSize: "13px",
                                fontWeight: active ? 600 : 500,
                                padding: "7px 12px",
                                color: active ? "var(--text-primary)" : "var(--text-tertiary)",
                                borderBottom: active
                                    ? "2px solid var(--accent)"
                                    : "2px solid transparent",
                                textDecoration: "none",
                                marginBottom: "-1px",
                            }}
                        >
                            {item.label}
                        </Link>
                    );
                })}
            </nav>
            {children}
        </div>
    );
}
