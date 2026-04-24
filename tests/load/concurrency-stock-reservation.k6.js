/**
 * Stok Rezervasyon Yarışı — Concurrency + Kademeli Yük Testi
 *
 * Senaryo: Aynı ürün için eşzamanlı sipariş oluşturma + onaylama denemeleri.
 * Invariant: reserved <= on_hand — hiçbir durumda aşılmamalı.
 *
 * Yük kademeleri: 5 → 15 → 30 → 50 → 75 → 100 VU (kırılana kadar)
 *
 * Kullanım:
 *   k6 run tests/load/concurrency-stock-reservation.k6.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e SESSION_COOKIE="sb-xxx=..." \
 *     -e TARGET_VU=30 \
 *     --out json=results/concurrency-stock-kademe-$(date +%Y%m%d-%H%M%S).json
 *
 * Her kademe için ayrı çalıştır; arasında invariant SQL kontrol et.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const orderCreated = new Counter("order_created");
const orderFailed = new Counter("order_failed");
const orderApproved = new Counter("order_approved");
const approveRejected = new Counter("approve_rejected");
const serverError = new Counter("server_error_5xx");
const errorRate = new Rate("errors");
const createDuration = new Trend("create_duration_ms", true);
const approveDuration = new Trend("approve_duration_ms", true);

const TARGET_VU = parseInt(__ENV.TARGET_VU || "5");

export const options = {
    stages: [
        { duration: "30s", target: TARGET_VU },         // ramp-up
        { duration: "5m",  target: TARGET_VU },         // steady state
        { duration: "20s", target: 0 },                 // ramp-down
    ],
    thresholds: {
        http_req_duration: ["p(95)<5000"],
        http_req_failed: ["rate<0.3"],
        server_error_5xx: ["count<10"],
        errors: ["rate<0.3"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
const PRODUCT_ID = __ENV.PRODUCT_ID || "";       // Stok kısıtlı ürün
const CUSTOMER_ID = __ENV.CUSTOMER_ID || "";
// API'nin gerektirdiği ek alanlar — env ya da varsayılan
const PRODUCT_NAME = __ENV.PRODUCT_NAME || "Test Ürün";
const PRODUCT_SKU  = __ENV.PRODUCT_SKU  || "TEST-SKU";
const PRODUCT_UNIT = __ENV.PRODUCT_UNIT || "adet";
const CUSTOMER_NAME = __ENV.CUSTOMER_NAME || "Test Müşteri";

export default function () {
    if (!PRODUCT_ID || !CUSTOMER_ID) {
        console.warn("PRODUCT_ID ve CUSTOMER_ID env var gerekli");
        return;
    }

    // Adım 1: Sipariş oluştur (DRAFT)
    const createStart = Date.now();
    const createRes = http.post(
        `${BASE_URL}/api/orders`,
        JSON.stringify({
            customer_id: CUSTOMER_ID,
            customer_name: CUSTOMER_NAME,
            currency: "TRY",
            commercial_status: "draft",
            fulfillment_status: "unallocated",
            subtotal: 100,
            vat_total: 20,
            grand_total: 120,
            notes: `LOAD-TEST reservation-race VU${__VU}`,
            lines: [
                {
                    product_id: PRODUCT_ID,
                    product_name: PRODUCT_NAME,
                    product_sku: PRODUCT_SKU,
                    unit: PRODUCT_UNIT,
                    quantity: 1,
                    unit_price: 100,
                    discount_pct: 0,
                    line_total: 100,
                },
            ],
        }),
        {
            headers: {
                "Content-Type": "application/json",
                Cookie: SESSION_COOKIE,
            },
            timeout: "15s",
        }
    );
    createDuration.add(Date.now() - createStart);

    const createOk = check(createRes, {
        "create: no 5xx": (r) => r.status < 500,
        "create: 201 created": (r) => r.status === 201,
    });

    if (!createOk || createRes.status !== 201) {
        orderFailed.add(1);
        errorRate.add(createRes.status >= 500);
        if (createRes.status >= 500) serverError.add(1);
        return;
    }

    orderCreated.add(1);
    const orderId = JSON.parse(createRes.body)?.id;
    if (!orderId) return;

    sleep(0.1);

    // Adım 2: DRAFT → PENDING_APPROVAL
    http.patch(
        `${BASE_URL}/api/orders/${orderId}`,
        JSON.stringify({ transition: "pending_approval" }),
        {
            headers: { "Content-Type": "application/json", Cookie: SESSION_COOKIE },
            timeout: "10s",
        }
    );

    sleep(0.1);

    // Adım 3: PENDING_APPROVAL → APPROVED (rezervasyon burada tetiklenir)
    const approveStart = Date.now();
    const approveRes = http.patch(
        `${BASE_URL}/api/orders/${orderId}`,
        JSON.stringify({ transition: "approved" }),
        {
            headers: { "Content-Type": "application/json", Cookie: SESSION_COOKIE },
            timeout: "15s",
        }
    );
    approveDuration.add(Date.now() - approveStart);

    check(approveRes, {
        "approve: no 5xx": (r) => r.status < 500,
    });

    if (approveRes.status === 200) {
        orderApproved.add(1);
    } else if (approveRes.status >= 400 && approveRes.status < 500) {
        approveRejected.add(1);
    } else if (approveRes.status >= 500) {
        serverError.add(1);
        errorRate.add(1);
    }

    // Temizlik: cancel
    sleep(0.1);
    http.patch(
        `${BASE_URL}/api/orders/${orderId}`,
        JSON.stringify({ transition: "cancelled" }),
        {
            headers: { "Content-Type": "application/json", Cookie: SESSION_COOKIE },
            timeout: "10s",
        }
    );

    sleep(0.5);
}
