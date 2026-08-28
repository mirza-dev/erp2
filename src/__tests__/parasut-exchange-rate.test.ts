/**
 * Faz 12 — dövizli faturada TCMB kuru.
 *
 * BULGU: `createSalesInvoice` bugüne dek `exchange_rate` göndermiyordu →
 * Paraşüt kendi kurunu uyguluyor, ERP'nin gösterdiği TL karşılığından
 * sapabiliyordu (muhasebe ile ERP arasında açıklanamayan fark).
 *
 * Tasarım: best-effort. Kur çözülemezse alan HİÇ gönderilmez ve fatura yine
 * kesilir — yanlış kur göndermek, Paraşüt'ün kendi kurunu kullanmasından daha
 * kötüdür; kur yüzünden fatura kesilememek ise sevkiyatı bloke ederdi.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveInvoiceExchangeRate, tcmbDateToISO } from "@/lib/services/parasut-exchange-rate";
import { parseTcmbForexBuying } from "@/lib/exchange-rates";

const TCMB_XML = `<?xml version="1.0" encoding="ISO-8859-9"?>
<Tarih_Date Tarih="28.08.2026" Date="08/28/2026">
  <Currency CrossOrder="0" Kod="USD" CurrencyCode="USD">
    <Unit>1</Unit><Isim>ABD DOLARI</Isim>
    <ForexBuying>41,2345</ForexBuying><ForexSelling>41,3087</ForexSelling>
  </Currency>
  <Currency CrossOrder="1" Kod="EUR" CurrencyCode="EUR">
    <Unit>1</Unit><Isim>EURO</Isim>
    <ForexBuying>44,8812</ForexBuying><ForexSelling>44,9620</ForexSelling>
  </Currency>
  <Currency CrossOrder="2" Kod="GBP" CurrencyCode="GBP">
    <Unit>1</Unit><Isim>INGILIZ STERLINI</Isim>
    <ForexBuying>52,1030</ForexBuying><ForexSelling>52,3900</ForexSelling>
  </Currency>
</Tarih_Date>`;

function xmlResponse(body: string, status = 200): Response {
    return new Response(body, { status, headers: { "content-type": "application/xml" } });
}

// Kur çözümü YALNIZ gerçek adapter modunda ağa çıkar (mock modda testler
// yavaşlar/kırılganlaşırdı) → bu dosya gerçek modu taklit eder.
const OLD_MOCK_FLAG = process.env.PARASUT_USE_MOCK;
beforeEach(() => { process.env.PARASUT_USE_MOCK = "false"; });
afterEach(() => {
    if (OLD_MOCK_FLAG === undefined) delete process.env.PARASUT_USE_MOCK;
    else process.env.PARASUT_USE_MOCK = OLD_MOCK_FLAG;
});

describe("parseTcmbForexBuying", () => {
    it("istenen para biriminin ALIŞ kurunu okur (satış değil)", () => {
        expect(parseTcmbForexBuying(TCMB_XML, "USD")).toEqual({ rate: 41.2345, date: "28.08.2026" });
        expect(parseTcmbForexBuying(TCMB_XML, "EUR")?.rate).toBe(44.8812);
    });

    it("GBP'yi de çözer — ticker'ın USD/EUR sınırı burada geçerli değil", () => {
        expect(parseTcmbForexBuying(TCMB_XML, "GBP")?.rate).toBe(52.103);
    });

    it("bilinmeyen kodda THROW etmez, null döner", () => {
        expect(parseTcmbForexBuying(TCMB_XML, "JPY")).toBeNull();
    });

    it("regex enjeksiyonuna kapalı (yalnız 3 harfli ISO kodu)", () => {
        expect(parseTcmbForexBuying(TCMB_XML, "US.*")).toBeNull();
        expect(parseTcmbForexBuying(TCMB_XML, "usd")).toBeNull();
    });

    it("bozuk XML'de null (fatura akışı patlamaz)", () => {
        expect(parseTcmbForexBuying("<html>hata</html>", "USD")).toBeNull();
    });
});

describe("tcmbDateToISO", () => {
    it("DD.MM.YYYY → YYYY-MM-DD", () => {
        expect(tcmbDateToISO("28.08.2026")).toBe("2026-08-28");
    });

    it("tanımadığı biçimde null", () => {
        expect(tcmbDateToISO("2026-08-28")).toBeNull();
        expect(tcmbDateToISO("")).toBeNull();
    });
});

describe("resolveInvoiceExchangeRate", () => {
    it("TRL faturada kur çözülmez — ağa hiç çıkılmaz", async () => {
        const fetchImpl = vi.fn();
        const rate = await resolveInvoiceExchangeRate("TRL", "2026-08-28", fetchImpl as unknown as typeof fetch);
        expect(rate).toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("dövizli faturada TCMB alış kurunu döner", async () => {
        const fetchImpl = (async () => xmlResponse(TCMB_XML)) as unknown as typeof fetch;
        expect(await resolveInvoiceExchangeRate("USD", "2026-08-28", fetchImpl)).toBe(41.2345);
    });

    it("kur GÜNÜ fatura tarihiyle uyuşmuyorsa gönderilmez", async () => {
        // today.xml yalnız BUGÜNÜ taşır; geçmiş tarihli fatura yanlış kurla
        // damgalanmamalı.
        const fetchImpl = (async () => xmlResponse(TCMB_XML)) as unknown as typeof fetch;
        expect(await resolveInvoiceExchangeRate("USD", "2026-08-20", fetchImpl)).toBeUndefined();
    });

    it("TCMB erişilemezse undefined — fatura yine kesilir", async () => {
        const fetchImpl = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
        expect(await resolveInvoiceExchangeRate("USD", "2026-08-28", fetchImpl)).toBeUndefined();
    });

    it("TCMB 503 dönerse undefined", async () => {
        const fetchImpl = (async () => xmlResponse("", 503)) as unknown as typeof fetch;
        expect(await resolveInvoiceExchangeRate("USD", "2026-08-28", fetchImpl)).toBeUndefined();
    });

    it("mock modda ağa hiç çıkılmaz (test hızı + kırılganlık koruması)", async () => {
        process.env.PARASUT_USE_MOCK = "true";
        const fetchImpl = vi.fn();
        const rate = await resolveInvoiceExchangeRate("USD", "2026-08-28", fetchImpl as unknown as typeof fetch);
        expect(rate).toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe("upsertInvoice bağlantısı (kaynak kilidi)", () => {
    it("kur çözülür ve YALNIZ tanımlıysa payload'a girer", async () => {
        const { readFileSync } = await import("fs");
        const src = readFileSync("src/lib/services/parasut-service.ts", "utf8");
        expect(src).toContain("const exchangeRate = await resolveInvoiceExchangeRate(currency, issueDate);");
        expect(src).toMatch(/\.\.\.\(exchangeRate !== undefined \? \{ exchange_rate: exchangeRate \} : \{\}\)/);
    });

    it("kur çözümü attempted-marker'dan ÖNCE — ağ hatası create denemesi sayılmaz", async () => {
        const { readFileSync } = await import("fs");
        const src = readFileSync("src/lib/services/parasut-service.ts", "utf8");
        const rateIdx   = src.indexOf("const exchangeRate = await resolveInvoiceExchangeRate");
        const markerIdx = src.indexOf("parasut_invoice_create_attempted_at: new Date().toISOString()");
        expect(rateIdx).toBeGreaterThan(0);
        expect(markerIdx).toBeGreaterThan(rateIdx);
    });

    it("ERP sipariş numarası resmî order_no alanına da yazılır", async () => {
        const { readFileSync } = await import("fs");
        const src = readFileSync("src/lib/services/parasut-service.ts", "utf8");
        expect(src).toMatch(/order_no:\s+order\.order_number/);
    });
});
