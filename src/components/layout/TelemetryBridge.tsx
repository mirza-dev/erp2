"use client";

import { useEffect } from "react";
import { installRumCollector } from "@/lib/telemetry/rum-client";

/**
 * RUM toplayıcısını kuran tek nokta (§12, §21).
 *
 * `RealtimeSyncBridge` emsali: hiçbir şey ÇİZMEZ, yalnız bir yan etkiyi
 * dashboard kabuğunun içine bağlar. Buraya konulmasının sebebi kapsam:
 * ölçmek istediğimiz trafik dashboard içindeki ERP kullanımıdır; login ve
 * landing sayfaları kapsam dışıdır.
 */
export default function TelemetryBridge() {
    useEffect(() => installRumCollector(), []);
    return null;
}
