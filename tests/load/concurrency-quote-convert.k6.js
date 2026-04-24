/**
 * Quote Convert Yarışı — Concurrency Testi
 *
 * Senaryo: Aynı accepted teklif ID'sine eşzamanlı 5 VU dönüştürme isteği gönderir.
 * Beklenen: Sadece 1 başarılı (201), diğerleri 409 (already converted).
 * Invariant: migration 037 UNIQUE index (sales_orders.quote_id) race condition'ı önlemeli.
 *
 * Kullanım:
 *   k6 run tests/load/concurrency-quote-convert.k6.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e SESSION_COOKIE="sb-xxx=..." \
 *     -e QUOTE_ID=tkl-2026-001 \
 *     --out json=results/concurrency-quote-convert-$(date +%Y%m%d-%H%M%S).json
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const convertSuccess = new Counter("convert_success_201");
const convertConflict = new Counter("convert_conflict_409");
const convertError = new Counter("convert_server_error");
const errorRate = new Rate("errors");

export const options = {
    scenarios: {
        race_burst: {
            executor: "shared-iterations",
            vus: 5,
            iterations: 15,
            maxDuration: "30s",
        },
    },
    thresholds: {
        // Race koruması: 201 sayısı <= 1 olmalı (aynı teklif 2 kez sipariş yapılmamalı)
        convert_success_201: ["count<=1"],
        // 409 geldiğini doğrula — UNIQUE index çalışıyor
        convert_conflict_409: ["count>0"],
        convert_server_error: ["count<2"],
        errors: ["rate<0.1"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
const QUOTE_ID = __ENV.QUOTE_ID || "";

export default function () {
    if (!QUOTE_ID) {
        console.warn("QUOTE_ID env var gerekli (accepted durumda bir teklif ID'si)");
        return;
    }

    const res = http.post(
        `${BASE_URL}/api/quotes/${QUOTE_ID}/convert`,
        null,
        {
            headers: {
                Cookie: SESSION_COOKIE,
                "Content-Type": "application/json",
            },
            timeout: "15s",
        }
    );

    const isSuccess = res.status === 201;
    const isConflict = res.status === 409;
    const isError = res.status >= 500;
    const isBadRequest = res.status === 400;

    check(res, {
        "no 5xx": (r) => r.status < 500,
        "201 veya 409 veya 400": (r) => [201, 400, 409].includes(r.status),
    });

    if (isSuccess) convertSuccess.add(1);
    if (isConflict) convertConflict.add(1);
    if (isError) convertError.add(1);
    errorRate.add(isError);

    sleep(0.05); // Minimal sleep — race window'u daralt
}
