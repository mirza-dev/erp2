"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { usePermissions } from "@/lib/auth/use-permissions";
import { LoadingState } from "@/components/ui/StateViews";
import { isActiveHref } from "@/components/ui/NavLink";

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
            {/* 2026-09-10: şerit SARMIYOR. Ölçüm (390px): altı sekme 69–98×**35.5**
                ve hiçbiri `tap-44` ailesinde değildi — konsolun tamamında sınıf
                SIFIRDI. Kutuyu eklemek tek başına yetmezdi: `flexWrap: wrap`
                dar ekranda iki satır üretiyor, 2px satır aralığında 44'lük
                kutular 6.5px üst üste binerdi. Çözüm CSS yaması değil YERLEŞİM —
                2026-09-04'te `.tap-row-gap` tam bu yüzden silinmişti ve tek
                çip-satırı üreticisi `FilterChips` de sarmaz. Ayarlar rayı da
                mobilde aynı dili konuşuyor (`.settings-tab-nav`). */}
            <nav
                aria-label="Developer Console bölümleri"
                className="tab-strip-scroll"
                style={{
                    display: "flex",
                    gap: "2px",
                    flexWrap: "nowrap",
                    borderBottom: "0.5px solid var(--border-secondary)",
                    paddingBottom: "1px",
                }}
            >
                {NAV.map(item => {
                    // Aktif hesabı Sidebar ile ORTAK (`ui/NavLink`) — bu ifade
                    // 2026-09-05'e kadar iki dosyada birebir yazılıydı. Ama
                    // GÖRSEL dil kasten ayrı kalıyor: bu YATAY bir sekme
                    // şeridi, dikey rayın 2px sol accent şeridi burada yanlış
                    // olurdu. Alt çizgi bu yüzeyin kendi dili.
                    const active = isActiveHref(pathname, item.href, item.exact);
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            // Yalnız DİKEY: sekmeler yan yana ve en darı 69px —
                            // yatay büyüme komşusunun alanını yerdi.
                            className="tap-44-v"
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
            {/* 2026-09-04 (A4): filtreler URL'e yazılıyor → sayfalar
                `useSearchParams` okuyor. O kanca bir Suspense sınırı OLMADAN
                Next build'ini kırar (Faz 4 dersi). Sınır altı sayfaya ayrı ayrı
                değil KABUĞA tek seferde kondu — yeni bir konsol sayfası
                eklendiğinde kimsenin hatırlaması gerekmesin. */}
            <Suspense fallback={<LoadingState message="Yükleniyor…" />}>
                {children}
            </Suspense>
        </div>
    );
}
