/**
 * Kapasite Endpoint Testi — Veri Hacmi Büyüdükçe Sorgu Gecikmesi
 *
 * Önce seed-large.ts ile veri yükle, sonra bu scripti çalıştır.
 * Her profil (small/medium/large) için ayrı run yapılır.
 * Sonuçlar kademeli olarak karşılaştırılır.
 *
 * Kullanım:
 *   npx tsx scripts/seed-large.ts --profile=small
 *   k6 run -e PROFILE=small tests/load/capacity-endpoints.k6.js --out json=results/capacity-small.json
 *
 *   npx tsx scripts/seed-large.ts --profile=medium
 *   k6 run -e PROFILE=medium tests/load/capacity-endpoints.k6.js --out json=results/capacity-medium.json
 */

import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

// Endpoint bazında süreler
const tProductsList    = new Trend("cap_products_list_ms",    true);
const tProductsFilter  = new Trend("cap_products_filter_ms",  true);
const tProductsAging   = new Trend("cap_aging_ms",            true);
const tOrdersList      = new Trend("cap_orders_list_ms",      true);
const tOrdersApproved  = new Trend("cap_orders_approved_ms",  true);
const tQuotesList      = new Trend("cap_quotes_list_ms",      true);
const tAlertsList      = new Trend("cap_alerts_list_ms",      true);
const tPurchaseSugg    = new Trend("cap_purchase_sugg_ms",    true);
const tCustomersList   = new Trend("cap_customers_list_ms",   true);

const serverErrors = new Counter("cap_server_errors");
const errorRate = new Rate("cap_errors");

export const options = {
    // Hafif yük — tek VU, 50 iterasyon; amaç gecikme ölçümü, stres değil
    vus: 3,
    iterations: 50,
    maxDuration: "10m",
    thresholds: {
        // Bilgi amaçlı — kırılma belirlenir, abort yok
        cap_errors: ["rate<0.5"],
    },
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:3000";
const SESSION_COOKIE = __ENV.SESSION_COOKIE || "";
const PROFILE = __ENV.PROFILE || "small";

const headers = {
    Cookie: SESSION_COOKIE,
    "Content-Type": "application/json",
};

function timed(url, trend, params = {}) {
    const start = Date.now();
    const res = http.get(`${BASE_URL}${url}`, { headers, timeout: "60s", ...params });
    const dur = Date.now() - start;
    trend.add(dur);

    check(res, {
        [`${url} → 200`]: (r) => r.status === 200,
        [`${url} → <30s`]: () => dur < 30000,
    });

    if (res.status >= 500) serverErrors.add(1);
    errorRate.add(res.status >= 500 || res.status === 0);

    if (dur > 10000) console.warn(`⚠️  YAVAŞ [${PROFILE}] ${url} — ${(dur / 1000).toFixed(1)}s`);
    if (res.status === 0) console.error(`❌  TIMEOUT [${PROFILE}] ${url}`);

    return { res, dur };
}

export default function () {
    group("ürün sorguları", () => {
        timed("/api/products", tProductsList);
        timed("/api/products?category=K%C3%BCre%C5%9Fel+Vanalar", tProductsFilter);
        sleep(0.3);
    });

    group("ağır hesaplamalar", () => {
        timed("/api/products/aging", tProductsAging);
        timed("/api/purchase/suggestions", tPurchaseSugg);
        sleep(0.5);
    });

    group("sipariş sorguları", () => {
        timed("/api/orders", tOrdersList);
        timed("/api/orders?commercial_status=approved", tOrdersApproved);
        sleep(0.3);
    });

    group("diğer listeler", () => {
        timed("/api/quotes", tQuotesList);
        timed("/api/alerts?status=active", tAlertsList);
        timed("/api/customers", tCustomersList);
        sleep(0.3);
    });

    sleep(1);
}
