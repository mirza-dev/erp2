import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/exchange-rates/route";
import { parseTcmbExchangeRates } from "@/lib/exchange-rates";

const originalFetch = global.fetch;

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
    vi.restoreAllMocks();
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

describe("GET /api/exchange-rates", () => {
    it("başarılı TCMB response'unu 200 JSON'a çevirir", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            text: async () => TCMB_XML,
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        const res = await GET();
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledWith(
            "https://www.tcmb.gov.tr/kurlar/today.xml",
            expect.objectContaining({ next: { revalidate: 3600 } }),
        );

        const body = await res.json() as { source: string; rates: { USD: { buying: number }; EUR: { selling: number } } };
        expect(body.source).toBe("TCMB");
        expect(body.rates.USD.buying).toBe(40.1234);
        expect(body.rates.EUR.selling).toBe(46.4148);
        expect(res.headers.get("Cache-Control")).toContain("s-maxage=3600");
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
});
