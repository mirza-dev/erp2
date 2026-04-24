/**
 * Genel API Kırılma Noktası Testi — Karma Okuma Yükü
 *
 * Senaryo: Gerçek bir ops kullanıcısının günlük iş yükü simülasyonu.
 * Ağırlıklı GET endpoint'leri; veri hacmi büyüdükçe gecikmeyi ölçer.
 *
 * Kademeler: 5 → 15 → 30 → 50 → 75 → 100 VU (kırılana kadar)
 * Her kademe için:
 *   k6 run -e TARGET_VU=30 tests/load/breakpoint-api.k6.js --out json=results/api-vu30.json
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate, Trend, Counter } from "k6/metrics";

const errorRate = new Rate("errors");
const serverErrors = new Counter("server_errors_5xx");

// Endpoint bazında trend
const tProducts    = new Trend("dur_products_ms",    true);
const tOrders      = new Trend("dur_orders_ms",      true);
const tQuotes      = new Trend("dur_quotes_ms",      true);
const tAlerts      = new Trend("dur_alerts_ms",      true);
const tAging       = new Trend("dur_aging_ms",       true);
const tPurchase    = new Trend("dur_purchase_ms",    true);
const tCustomers   = new Trend("dur_customers_ms",   true);

const TARGET_VU = parseInt(__ENV.TARGET_VU || "5");

export const options = {
    stages: [
        { duration: "20s", target: TARGET_VU },
        { duration: "5m",  target: TARGET_VU },
        { duration: "20s", target: 0 },
    ],
    thresholds: {
        // Kırılma tespiti — gevşek threshold, abort etmiyoruz
        http_req_failed: ["rate<0.9"],
        errors: ["rate<0.9"],
        // Gerçek kırılma eşikleri — bunlar aşılınca kademeli değerlendirme yap
        "dur_products_ms{p(95)}": ["p(95)<5000"],
        "dur_orders_ms{p(95)}": ["p(95)<5000"],
        "dur_aging_ms{p(95)}": ["p(95)<10000"],
        "dur_purchase_ms{p(95)}": ["p(95)<10000"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";

const headers = {
    Cookie: SESSION_COOKIE,
    "Content-Type": "application/json",
};

function get(url, trend) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}${url}`, { headers, timeout: "30s" });
    trend.add(Date.now() - start);

    check(res, {
        "status 200": (r) => r.status === 200,
        "no 5xx": (r) => r.status < 500,
    });

    if (res.status >= 500) serverErrors.add(1);
    errorRate.add(res.status >= 500 || res.status === 0);
    return res;
}

export default function () {
    group("ürün listesi", () => {
        get("/api/products", tProducts);
    });

    sleep(0.2);

    group("sipariş listesi", () => {
        get("/api/orders", tOrders);
        get("/api/orders?commercial_status=approved", tOrders);
    });

    sleep(0.2);

    group("teklif listesi", () => {
        get("/api/quotes", tQuotes);
        get("/api/quotes?status=draft", tQuotes);
    });

    sleep(0.2);

    group("alerts", () => {
        get("/api/alerts?status=active", tAlerts);
    });

    sleep(0.2);

    group("ağır sorgular", () => {
        get("/api/products/aging", tAging);
        get("/api/purchase/suggestions", tPurchase);
    });

    sleep(0.2);

    group("müşteriler", () => {
        get("/api/customers", tCustomers);
    });

    sleep(0.5);
}
