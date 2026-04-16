/**
 * Alert Scan Yük Testi
 *
 * Kullanım:
 *   k6 run tests/load/alert-scan.k6.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e CRON_SECRET=your-secret
 *
 * CI ortamında:
 *   BASE_URL ve CRON_SECRET ortam değişkenleri veya GitHub Secrets olarak verilir.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const scanDuration = new Trend("scan_duration_ms", true);

export const options = {
    stages: [
        { duration: "30s", target: 3 },  // ramp-up
        { duration: "1m", target: 3 },   // steady state
        { duration: "15s", target: 0 },  // ramp-down
    ],
    thresholds: {
        http_req_duration: ["p(95)<3000"],   // alert scan DB-heavy olabilir, 3s tolerans
        http_req_failed: ["rate<0.02"],
        errors: ["rate<0.02"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const CRON_SECRET = __ENV.CRON_SECRET || "";

export default function () {
    const res = http.post(`${BASE_URL}/api/alerts/scan`, null, {
        headers: {
            Authorization: `Bearer ${CRON_SECRET}`,
            "Content-Type": "application/json",
        },
        timeout: "10s",
    });

    const ok = check(res, {
        "status 200": (r) => r.status === 200,
        "response time < 3s": (r) => r.timings.duration < 3000,
        "has result body": (r) => r.body.length > 0,
    });

    errorRate.add(!ok);
    scanDuration.add(res.timings.duration);

    sleep(2);  // gerçek CRON aralığını simüle et — DB'ye fazla basınç uygulanmasın
}
