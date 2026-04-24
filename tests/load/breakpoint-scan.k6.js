/**
 * Alert Scan Kırılma Noktası Testi — Kademeli Yük
 *
 * Amaç: Kaç eşzamanlı request'te scan süresi bozuluyor / timeout atıyor?
 * Advisory lock davranışı yük altında nasıl?
 *
 * Kademeler: 5 → 15 → 30 → 50 → 75 → 100 VU
 * Her kademe için ayrı çalıştır:
 *   k6 run -e TARGET_VU=5  tests/load/breakpoint-scan.k6.js --out json=results/scan-vu5.json
 *   k6 run -e TARGET_VU=15 tests/load/breakpoint-scan.k6.js --out json=results/scan-vu15.json
 *   ... vb.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const errorRate = new Rate("errors");
const scanDuration = new Trend("scan_duration_ms", true);
const timeoutCount = new Counter("scan_timeout");
const lockBusy = new Counter("scan_lock_busy");   // advisory lock meşgul (200 ama "locked" body)
const successCount = new Counter("scan_success");

const TARGET_VU = parseInt(__ENV.TARGET_VU || "5");

export const options = {
    stages: [
        { duration: "20s", target: TARGET_VU },      // ramp-up
        { duration: "5m",  target: TARGET_VU },      // steady (kırılma penceresi)
        { duration: "20s", target: 0 },              // ramp-down
    ],
    thresholds: {
        // Threshold'lar kasıtlı gevşek — kırılma noktasını kaydetmek için abort etmiyoruz
        http_req_failed: ["rate<0.9"],
        errors: ["rate<0.9"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const CRON_SECRET = __ENV.CRON_SECRET || "";

export default function () {
    const start = Date.now();
    const res = http.post(`${BASE_URL}/api/alerts/scan`, null, {
        headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
            "Content-Type": "application/json",
        },
        timeout: "30s",
    });
    const duration = Date.now() - start;
    scanDuration.add(duration);

    const isTimeout = res.status === 0 || duration >= 29000;
    const isSuccess = res.status === 200;
    const isError = res.status >= 500;

    // Advisory lock meşgulse body "locked" içerebilir
    const isLocked = isSuccess && res.body && res.body.includes("locked");

    check(res, {
        "no timeout": () => !isTimeout,
        "status 200": (r) => r.status === 200,
        "duration < 10s": () => duration < 10000,
    });

    if (isTimeout) timeoutCount.add(1);
    if (isLocked) lockBusy.add(1);
    if (isSuccess && !isLocked) successCount.add(1);
    errorRate.add(isError || isTimeout);

    sleep(1);
}
