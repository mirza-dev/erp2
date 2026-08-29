/**
 * Developer Console §12 — RUM toplama, endpoint normalizasyonu, yüzdelikler.
 *
 * `aggregateRumSamples` aynı zamanda bir GÜVENLİK sınırıdır: girdisi
 * TARAYICIDAN gelir. Testlerin yarısı bu yüzden "doğru hesaplıyor mu"yu değil,
 * "kötü girdiyi reddediyor mu"yu sınar.
 */
import { describe, it, expect } from "vitest";
import {
    BUCKET_COUNT,
    DURATION_BUCKETS,
    bucketIndexFor,
    isHttpMethod,
    normalizeEndpoint,
    percentileFromHistogram,
} from "@/lib/telemetry/endpoint";
import { MAX_SAMPLES_PER_BATCH, aggregateRumSamples } from "@/lib/telemetry/rum-aggregate";

const NOW = new Date("2026-08-30T14:37:12.000Z");

const sample = (over: Record<string, unknown> = {}) => ({
    endpoint: "/api/products",
    method: "GET",
    status: 200,
    durationMs: 120,
    ...over,
});

describe("normalizeEndpoint — dinamik segment yer tutucuya iner", () => {
    it("uuid ve sayısal kimlikler [id] olur", () => {
        expect(normalizeEndpoint("/api/products/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b"))
            .toBe("/api/products/[id]");
        expect(normalizeEndpoint("/api/orders/42/ship")).toBe("/api/orders/[id]/ship");
    });

    it("iç içe kimlikler ayrı ayrı iner", () => {
        expect(normalizeEndpoint(
            "/api/products/3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b/attachments/9b1e2c3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f",
        )).toBe("/api/products/[id]/attachments/[id]");
    });

    it("uzun opak token [token] olur (paylaşılan teklif linki)", () => {
        expect(normalizeEndpoint("/api/quotes/shared/AbCdEfGhIjKlMnOpQrStUvWxYz123456"))
            .toBe("/api/quotes/shared/[token]");
    });

    it("sorgu dizesi ve hash düşer — PII query string'de olabilir", () => {
        expect(normalizeEndpoint("/api/products?search=ali@firma.com")).toBe("/api/products");
        expect(normalizeEndpoint("/api/products#x")).toBe("/api/products");
    });

    it("TANINMAYAN yol reddedilir — ham string DB'ye yazılmaz", () => {
        expect(normalizeEndpoint("https://evil.example/api/x")).toBeNull();
        expect(normalizeEndpoint("/etc/passwd")).toBeNull();
        expect(normalizeEndpoint("/api/<script>alert(1)</script>")).toBeNull();
        expect(normalizeEndpoint("/api/" + "a/".repeat(20))).toBeNull(); // segment tavanı
        expect(normalizeEndpoint("")).toBeNull();
        expect(normalizeEndpoint(null)).toBeNull();
    });

    it("çok uzun tek segment [token]'a iner — reddedilmese de ham hâli saklanmaz", () => {
        // Asıl güvenlik şartı "reddet" değil, "ham kullanıcı verisi yazma".
        // Uzun opak segment yer tutucuya indiği için o şart zaten sağlanır.
        const out = normalizeEndpoint("/api/" + "x".repeat(200));
        expect(out).toBe("/api/[token]");
        expect(out).not.toContain("xxx");
    });

    it("dashboard yolları da kabul edilir", () => {
        expect(normalizeEndpoint("/dashboard/quotes/")).toBe("/dashboard/quotes");
    });
});

describe("isHttpMethod — allowlist", () => {
    it("bilinen methodlar geçer, uydurma method geçmez", () => {
        expect(isHttpMethod("GET")).toBe(true);
        expect(isHttpMethod("PATCH")).toBe(true);
        expect(isHttpMethod("TRACE")).toBe(false);
        expect(isHttpMethod("get")).toBe(false); // çağıran upper-case'e çevirir
    });
});

describe("kova ve yüzdelik matematiği", () => {
    it("kova sayısı ve sınırlar SQL şemasıyla aynı (10)", () => {
        expect(BUCKET_COUNT).toBe(10);
        expect(DURATION_BUCKETS.length).toBe(10);
    });

    it("süre doğru kovaya düşer (üst sınır DAHİL)", () => {
        expect(bucketIndexFor(0)).toBe(0);
        expect(bucketIndexFor(50)).toBe(0);
        expect(bucketIndexFor(51)).toBe(1);
        expect(bucketIndexFor(12_800)).toBe(8);
        expect(bucketIndexFor(999_999)).toBe(9);
    });

    it("boş histogramda yüzdelik null (uydurma değer yok — §28)", () => {
        expect(percentileFromHistogram(new Array(10).fill(0), 0.95)).toBeNull();
    });

    it("p50/p95 kova üst sınırını döner", () => {
        // 100 örnek: 90'ı <=50ms, 10'u <=800ms
        const hist = [90, 0, 0, 0, 10, 0, 0, 0, 0, 0];
        expect(percentileFromHistogram(hist, 0.5)).toBe(50);
        expect(percentileFromHistogram(hist, 0.95)).toBe(800);
    });
});

describe("aggregateRumSamples — kovalama", () => {
    it("aynı endpoint+method tek satırda toplanır", () => {
        const { rows, accepted, rejected } = aggregateRumSamples(
            [sample({ durationMs: 100 }), sample({ durationMs: 300 })], NOW,
        );
        expect(rows).toHaveLength(1);
        expect(accepted).toBe(2);
        expect(rejected).toBe(0);
        expect(rows[0].sample_count).toBe(2);
        expect(rows[0].sum_ms).toBe(400);
        expect(rows[0].max_ms).toBe(300);
    });

    it("farklı method AYRI satır", () => {
        const { rows } = aggregateRumSamples([sample(), sample({ method: "POST" })], NOW);
        expect(rows).toHaveLength(2);
    });

    it("kova saat başına yuvarlanır", () => {
        expect(aggregateRumSamples([sample()], NOW).rows[0].bucket_at)
            .toBe("2026-08-30T14:00:00.000Z");
    });

    it("status sınıfları doğru sayılır", () => {
        const { rows } = aggregateRumSamples([
            sample({ status: 200 }), sample({ status: 302 }),
            sample({ status: 404 }), sample({ status: 500 }), sample({ status: 503 }),
        ], NOW);
        expect(rows[0].status_2xx).toBe(1);
        expect(rows[0].status_3xx).toBe(1);
        expect(rows[0].status_4xx).toBe(1);
        expect(rows[0].status_5xx).toBe(2);
    });

    it("histogram 10 elemanlı ve toplamı örnek sayısına eşit", () => {
        const { rows } = aggregateRumSamples(
            [sample({ durationMs: 10 }), sample({ durationMs: 900 }), sample({ durationMs: 20_000 })],
            NOW,
        );
        expect(rows[0].histogram).toHaveLength(10);
        expect(rows[0].histogram.reduce((a, b) => a + b, 0)).toBe(3);
    });
});

describe("aggregateRumSamples — girdi doğrulaması (tarayıcıdan gelir)", () => {
    it("geçersiz endpoint'li örnek ATILIR", () => {
        const { rows, accepted, rejected } = aggregateRumSamples(
            [sample({ endpoint: "/etc/passwd" }), sample()], NOW,
        );
        expect(accepted).toBe(1);
        expect(rejected).toBe(1);
        expect(rows).toHaveLength(1);
    });

    it("geçersiz method / status / süre reddedilir", () => {
        const { accepted, rejected } = aggregateRumSamples([
            sample({ method: "STEAL" }),
            sample({ status: 999 }),
            sample({ status: 0 }),
            sample({ durationMs: -5 }),
            sample({ durationMs: 10_000_000 }),
            sample({ durationMs: "abc" }),
        ], NOW);
        expect(accepted).toBe(0);
        expect(rejected).toBe(6);
    });

    it("sayısal metin kabul edilir — sınır TİPİ değil ARALIĞI doğrular", () => {
        // Bilinçli tolerans: `"200"` → 200 geçerli bir status'tur ve aralık
        // kontrolünden geçer. Tehlikeli hiçbir değer sızmaz — `""`, `null`,
        // `true`, `[]` hepsi 0/NaN'a düşüp aralıkta reddedilir.
        expect(aggregateRumSamples([sample({ status: "200" })], NOW).accepted).toBe(1);
        for (const bad of ["", null, true, [], {}]) {
            expect(aggregateRumSamples([sample({ status: bad })], NOW).accepted, String(bad)).toBe(0);
        }
    });

    it("nesne olmayan girdiler reddedilir", () => {
        const { accepted, rejected } = aggregateRumSamples([null, "x", 42, undefined], NOW);
        expect(accepted).toBe(0);
        expect(rejected).toBe(4);
    });

    it("dizi olmayan gövde boş sonuç döner", () => {
        expect(aggregateRumSamples("hepsini kaydet", NOW)).toEqual({ rows: [], accepted: 0, rejected: 0 });
        expect(aggregateRumSamples(null, NOW).rows).toEqual([]);
    });

    it("parti tavanı uygulanır — fazlası reddedilen sayılır", () => {
        const many = Array.from({ length: MAX_SAMPLES_PER_BATCH + 20 }, () => sample());
        const { accepted, rejected } = aggregateRumSamples(many, NOW);
        expect(accepted).toBe(MAX_SAMPLES_PER_BATCH);
        expect(rejected).toBe(20);
    });

    it("süre tam sayıya yuvarlanır (float DB'ye gitmez)", () => {
        const { rows } = aggregateRumSamples([sample({ durationMs: 123.456 })], NOW);
        expect(Number.isInteger(rows[0].sum_ms)).toBe(true);
        expect(rows[0].sum_ms).toBe(123);
    });
});
