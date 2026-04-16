/**
 * Import Wizard Yük Testi
 *
 * Test akışı: batch listesi + batch durumu okuma (read-only) —
 * gerçek dosya yükleme yerine okuma yolunu test eder.
 *
 * Kullanım:
 *   k6 run tests/load/import-wizard.k6.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e SESSION_COOKIE="sb-xxx-auth-token=..."
 *
 * SESSION_COOKIE nasıl alınır:
 *   1. Tarayıcıda giriş yap
 *   2. DevTools → Application → Cookies → sb-*-auth-token değerini kopyala
 *   3. -e SESSION_COOKIE="sb-xxx-auth-token=eyJ..." olarak gönder
 *
 * Not: Gerçek file upload testi için multipart/form-data ile
 * POST /api/import/batch endpoint'ine xlsx gönderilmesi gerekir —
 * bu script okuma yolunun altında kalmayacağını doğrular.
 */

import http from "k6/http";
import { check, sleep, group } from "k6";
import { Rate, Trend } from "k6/metrics";

const errorRate = new Rate("errors");
const listDuration = new Trend("list_duration_ms", true);
const batchDuration = new Trend("batch_duration_ms", true);

export const options = {
    stages: [
        { duration: "20s", target: 5 },
        { duration: "1m", target: 10 },
        { duration: "10s", target: 0 },
    ],
    thresholds: {
        http_req_duration: ["p(95)<2000"],
        http_req_failed: ["rate<0.02"],
        errors: ["rate<0.02"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";

function authHeaders() {
    return {
        Cookie: SESSION_COOKIE,
        "Content-Type": "application/json",
    };
}

export default function () {
    group("import batch list", () => {
        const res = http.get(`${BASE_URL}/api/import/batch?limit=20`, {
            headers: authHeaders(),
        });

        const ok = check(res, {
            "status 200": (r) => r.status === 200,
            "response time < 2s": (r) => r.timings.duration < 2000,
        });

        errorRate.add(!ok);
        listDuration.add(res.timings.duration);
    });

    sleep(0.5);

    group("import column-mappings (AI memory)", () => {
        const res = http.get(`${BASE_URL}/api/import/column-mappings`, {
            headers: authHeaders(),
        });

        const ok = check(res, {
            "status 200 or 404": (r) => r.status === 200 || r.status === 404,
            "response time < 1s": (r) => r.timings.duration < 1000,
        });

        errorRate.add(!ok);
        batchDuration.add(res.timings.duration);
    });

    sleep(1);
}
