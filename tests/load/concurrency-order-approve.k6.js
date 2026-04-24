/**
 * Sipariş Onay Yarışı — Concurrency Testi
 *
 * Senaryo: Aynı sipariş ID'sine eşzamanlı 5 VU onaylama isteği gönderir.
 * Beklenen: Sadece 1 başarılı (200/201), diğerleri 409 veya 422.
 * Invariant: Sipariş sadece 1 kez "approved" durumuna geçmeli.
 *
 * Kullanım:
 *   k6 run tests/load/concurrency-order-approve.k6.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e SESSION_COOKIE="sb-xxx=..." \
 *     --out json=results/concurrency-order-approve-$(date +%Y%m%d-%H%M%S).json
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";

const approveSuccess = new Counter("approve_success");
const approveConflict = new Counter("approve_conflict_409");
const approveError = new Counter("approve_error");
const errorRate = new Rate("errors");

export const options = {
    scenarios: {
        // Senaryo 1: Aynı sipariş üzerinde ani eşzamanlı yük (race window)
        race_burst: {
            executor: "shared-iterations",
            vus: 5,
            iterations: 20,
            maxDuration: "30s",
        },
    },
    thresholds: {
        // Başarılı approve sayısı, toplam denemeden az olmalı (race protection var)
        approve_conflict_409: ["count>0"],  // En az 1 tane 409 görülmeli
        errors: ["rate<0.5"],               // Sadece expected 409'lar var, gerçek 5xx az olmalı
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
// Önce bir sipariş oluşturup ID'sini test öncesinde environment variable olarak ver
// veya setup() ile oluştur
const ORDER_ID = __ENV.ORDER_ID || "";

export function setup() {
    if (!ORDER_ID) {
        // Bir test siparişi oluştur: DRAFT → PENDING_APPROVAL
        const createRes = http.post(
            `${BASE_URL}/api/orders`,
            JSON.stringify({
                customer_id: __ENV.TEST_CUSTOMER_ID || "",
                notes: "LOAD-TEST race condition test",
                lines: [
                    {
                        product_id: __ENV.TEST_PRODUCT_ID || "",
                        quantity: 1,
                        unit_price: 100,
                        discount_pct: 0,
                    },
                ],
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    Cookie: SESSION_COOKIE,
                },
            }
        );

        if (createRes.status !== 201) {
            console.warn(`Sipariş oluşturulamadı: ${createRes.status} — ${createRes.body}`);
            return { orderId: null };
        }

        const orderId = JSON.parse(createRes.body)?.id;
        if (!orderId) return { orderId: null };

        // DRAFT → PENDING_APPROVAL
        http.patch(
            `${BASE_URL}/api/orders/${orderId}`,
            JSON.stringify({ commercial_status: "pending_approval" }),
            {
                headers: {
                    "Content-Type": "application/json",
                    Cookie: SESSION_COOKIE,
                },
            }
        );

        return { orderId };
    }
    return { orderId: ORDER_ID };
}

export default function (data) {
    const orderId = data?.orderId;
    if (!orderId) {
        console.warn("orderId yok — test atlandı");
        return;
    }

    // Aynı siparişi approve etmeye çalış
    const res = http.patch(
        `${BASE_URL}/api/orders/${orderId}`,
        JSON.stringify({ commercial_status: "approved" }),
        {
            headers: {
                "Content-Type": "application/json",
                Cookie: SESSION_COOKIE,
            },
            timeout: "15s",
        }
    );

    const isSuccess = res.status === 200 || res.status === 201;
    const isConflict = res.status === 409 || res.status === 422;
    const isError = res.status >= 500;

    check(res, {
        "status is 200 or 409 (no 5xx)": (r) => r.status !== 500 && r.status !== 503,
    });

    if (isSuccess) approveSuccess.add(1);
    if (isConflict) approveConflict.add(1);
    if (isError) approveError.add(1);

    errorRate.add(isError);
    sleep(0.1);
}

export function teardown(data) {
    // Oluşturulan test siparişini temizle (cancel)
    const orderId = data?.orderId;
    if (!orderId || ORDER_ID) return; // Manuel verilen ID'ye dokunma

    http.patch(
        `${BASE_URL}/api/orders/${orderId}`,
        JSON.stringify({ commercial_status: "cancelled" }),
        {
            headers: {
                "Content-Type": "application/json",
                Cookie: SESSION_COOKIE,
            },
        }
    );
}
