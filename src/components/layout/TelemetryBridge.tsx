"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installRumCollector, recordPageView } from "@/lib/telemetry/rum-client";

/**
 * RUM toplayıcısını kuran tek nokta (§12, §21).
 *
 * `RealtimeSyncBridge` emsali: hiçbir şey ÇİZMEZ, yalnız bir yan etkiyi
 * dashboard kabuğunun içine bağlar. Buraya konulmasının sebebi kapsam:
 * ölçmek istediğimiz trafik dashboard içindeki ERP kullanımıdır; login ve
 * landing sayfaları kapsam dışıdır.
 *
 * 2026-08-31 (madde #14): sayfa görüntüleme kaydı da buraya bağlandı — "hangi
 * modül gerçekten kullanılıyor" sorusunun cevabı. Aynı kapsam kuralı geçerli:
 * bileşen yalnız dashboard kabuğunda mount edildiği için login/landing sayılmaz.
 */
export default function TelemetryBridge() {
    const pathname = usePathname();

    useEffect(() => installRumCollector(), []);

    // Gezinme başına bir kayıt. Ham `pathname` gönderilir; normalizasyon
    // (`/dashboard/products/<uuid>` → `/dashboard/products/[id]`) ve allowlist
    // doğrulaması SUNUCUDA yapılır — istemciden gelen yol serbest metin sayılmaz.
    useEffect(() => {
        if (pathname) recordPageView(pathname);
    }, [pathname]);

    return null;
}
