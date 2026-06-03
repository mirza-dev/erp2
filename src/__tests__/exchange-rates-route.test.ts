import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/exchange-rates/route";
import { parseLiveRatesExchangeRates, parseTcmbExchangeRates } from "@/lib/exchange-rates";

const originalFetch = global.fetch;
const originalLiveRatesKey = process.env.LIVE_RATES_API_KEY;

const TCMB_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="01.06.2026" Date="06/01/2026">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <ForexBuying>40.1234</ForexBuying>
    <ForexSelling>40.2876</ForexSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
    <ForexBuying>46.2012</ForexBuying>
    <ForexSelling>46.4148</ForexSelling>
  </Currency>
</Tarih_Date>`;

afterEach(() => {
    global.fetch = originalFetch;
    if (originalLiveRatesKey === undefined) {
        delete process.env.LIVE_RATES_API_KEY;
    } else {
        process.env.LIVE_RATES_API_KEY = originalLiveRatesKey;
    }
    vi.restoreAllMocks();
});

beforeEach(() => {
    delete process.env.LIVE_RATES_API_KEY;
});

describe("parseTcmbExchangeRates", () => {
    it("TCMB XML'den USD/EUR alış-satış kurlarını parse eder", () => {
        const parsed = parseTcmbExchangeRates(TCMB_XML, "2026-06-01T12:00:00.000Z");

        expect(parsed).toEqual({
            source: "TCMB",
            date: "01.06.2026",
            fetchedAt: "2026-06-01T12:00:00.000Z",
            rates: {
                USD: { buying: 40.1234, selling: 40.2876 },
                EUR: { buying: 46.2012, selling: 46.4148 },
            },
        });
    });

    it("USD/EUR bloklarından biri eksikse fail-closed davranır", () => {
        const xml = TCMB_XML.replace(/<Currency CrossOrder="1"[\s\S]*?<\/Currency>/, "");
        expect(() => parseTcmbExchangeRates(xml)).toThrow(/EUR currency block missing/);
    });
});

describe("parseLiveRatesExchangeRates", () => {
    it("Live-Rates USDTRY/EURTRY bid/ask response'unu parse eder", () => {
        const timestamp = 1_764_702_000_000;
        const parsed = parseLiveRatesExchangeRates([
            [{ currency: "USD/TRY", bid: "40.1234", ask: "40.2876", timestamp }],
            [{ currency: "EURTRY", bid: 46.2012, ask: 46.4148, timestamp: String(timestamp + 1000) }],
        ], "2026-06-02T12:00:00.000Z");

        expect(parsed).toEqual({
            source: "LIVE_RATES",
            date: new Date(timestamp + 1000).toISOString().slice(0, 10),
            fetchedAt: "2026-06-02T12:00:00.000Z",
            providerTimestamp: new Date(timestamp + 1000).toISOString(),
            rates: {
                USD: { buying: 40.1234, selling: 40.2876 },
                EUR: { buying: 46.2012, selling: 46.4148 },
            },
        });
    });

    it("Live-Rates pair eksikse fail-closed davranır", () => {
        expect(() => parseLiveRatesExchangeRates([
            [{ currency: "USDTRY", bid: 40.1, ask: 40.2 }],
        ])).toThrow(/EURTRY quote missing/);
    });
});

describe("GET /api/exchange-rates", () => {
    it("başarılı anahtarsız Live-Rates response'unu tek request ile 200 JSON'a çevirir", async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "https://www.live-rates.com/api/rates") {
                return Promise.resolve({
                    ok: true,
                    json: async () => [
                        { currency: "USD/TRY", bid: "40.1234", ask: "40.2876", timestamp: "1764702000000" },
                        { currency: "EUR/TRY", bid: "46.2012", ask: "46.4148", timestamp: "1764702001000" },
                    ],
                } as Response);
            }
            throw new Error(`unexpected url ${url}`);
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        const res = await GET();
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://www.live-rates.com/api/rates",
            expect.objectContaining({ next: { revalidate: 1200 } }),
        );

        const body = await res.json() as { source: string; providerTimestamp?: string; rates: { USD: { buying: number }; EUR: { selling: number } } };
        expect(body.source).toBe("LIVE_RATES");
        expect(body.providerTimestamp).toBe(new Date(1_764_702_001_000).toISOString());
        expect(body.rates.USD.buying).toBe(40.1234);
        expect(body.rates.EUR.selling).toBe(46.4148);
        expect(res.headers.get("Cache-Control")).toContain("s-maxage=1200");
    });

    it("Live-Rates key varsa key parametresiyle yine tek canlı request atar", async () => {
        process.env.LIVE_RATES_API_KEY = "live-key";
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => [
                { currency: "USDTRY", bid: 40.1234, ask: 40.2876 },
                { currency: "EURTRY", bid: 46.2012, ask: 46.4148 },
            ],
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        const res = await GET();
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://www.live-rates.com/api/rates?key=live-key",
            expect.objectContaining({ next: { revalidate: 1200 } }),
        );

        const body = await res.json() as { source: string };
        expect(body.source).toBe("LIVE_RATES");
    });

    it("Live-Rates erişilemezse başarılı TCMB response'unu fallback olarak 200 JSON'a çevirir", async () => {
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("live-rates.com")) {
                return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
            }
            if (url === "https://www.tcmb.gov.tr/kurlar/today.xml") {
                return Promise.resolve({
                    ok: true,
                    text: async () => TCMB_XML,
                } as Response);
            }
            throw new Error(`unexpected url ${url}`);
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        const res = await GET();
        const body = await res.json() as { source: string; rates: { USD: { buying: number }; EUR: { selling: number } } };

        expect(res.status).toBe(200);
        expect(body.source).toBe("TCMB");
        expect(body.rates.USD.buying).toBe(40.1234);
        expect(body.rates.EUR.selling).toBe(46.4148);
    });

    it("Live-Rates bozuk payload dönerse TCMB fallback çalışır", async () => {
        process.env.LIVE_RATES_API_KEY = "live-key";
        const fetchMock = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url.includes("live-rates.com")) {
                return Promise.resolve({
                    ok: true,
                    json: async () => [{ currency: "USDTRY", bid: "bad", ask: "40.2" }],
                } as Response);
            }
            if (url === "https://www.tcmb.gov.tr/kurlar/today.xml") {
                return Promise.resolve({
                    ok: true,
                    text: async () => TCMB_XML,
                } as Response);
            }
            throw new Error(`unexpected url ${url}`);
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        const res = await GET();
        const body = await res.json() as { source: string };

        expect(res.status).toBe(200);
        expect(body.source).toBe("TCMB");
        expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
        expect(fetchMock).toHaveBeenCalledWith(
            "https://www.tcmb.gov.tr/kurlar/today.xml",
            expect.objectContaining({ next: { revalidate: 3600 } }),
        );
    });

    it("bozuk XML'de 503 döner ve hata detayı sızdırmaz", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => "<not-tcmb />",
        }) as unknown as typeof fetch;

        const res = await GET();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ error: "TCMB kur verisi şu anda alınamadı." });
    });

    it("TCMB fetch hatasında 503 döner", async () => {
        global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

        const res = await GET();
        expect(res.status).toBe(503);
        expect(await res.json()).toEqual({ error: "TCMB kur verisi şu anda alınamadı." });
    });

    it("Live-Rates ve TCMB ikisi de hata verirse 503 döner ve key sızdırmaz", async () => {
        process.env.LIVE_RATES_API_KEY = "secret-live-key";
        global.fetch = vi.fn().mockRejectedValue(new Error("secret-live-key network down")) as unknown as typeof fetch;

        const res = await GET();
        const body = await res.json() as { error: string };

        expect(res.status).toBe(503);
        expect(body).toEqual({ error: "TCMB kur verisi şu anda alınamadı." });
        expect(JSON.stringify(body)).not.toContain("secret-live-key");
    });
});
