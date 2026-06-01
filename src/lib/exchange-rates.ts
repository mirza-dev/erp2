export type ExchangeCurrencyCode = "USD" | "EUR";

export interface ExchangeRatePair {
    buying: number;
    selling: number;
}

export interface ExchangeRatesResponse {
    source: "TCMB";
    date: string;
    rates: Record<ExchangeCurrencyCode, ExchangeRatePair>;
    fetchedAt: string;
}

const CURRENCY_CODES: ExchangeCurrencyCode[] = ["USD", "EUR"];

function decodeXml(value: string): string {
    return value
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}

function getAttribute(xml: string, attr: string): string | null {
    const match = xml.match(new RegExp(`\\b${attr}=["']([^"']+)["']`));
    return match ? decodeXml(match[1]) : null;
}

function getTagText(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`));
    return match ? decodeXml(match[1].trim()) : null;
}

function parseTcmbNumber(value: string | null, code: ExchangeCurrencyCode, field: string): number {
    if (!value) throw new Error(`TCMB ${code} ${field} missing`);
    const parsed = Number(value.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`TCMB ${code} ${field} invalid`);
    }
    return parsed;
}

function extractCurrencyBlock(xml: string, code: ExchangeCurrencyCode): string {
    const match = xml.match(
        new RegExp(`<Currency\\b(?=[^>]*(?:Kod|CurrencyCode)=["']${code}["'])[^>]*>([\\s\\S]*?)</Currency>`),
    );
    if (!match) throw new Error(`TCMB ${code} currency block missing`);
    return match[1];
}

export function parseTcmbExchangeRates(xml: string, fetchedAt = new Date().toISOString()): ExchangeRatesResponse {
    const date = getAttribute(xml, "Tarih") ?? getAttribute(xml, "Date");
    if (!date) throw new Error("TCMB date missing");

    const rates = Object.fromEntries(
        CURRENCY_CODES.map((code) => {
            const block = extractCurrencyBlock(xml, code);
            return [
                code,
                {
                    buying: parseTcmbNumber(getTagText(block, "ForexBuying"), code, "ForexBuying"),
                    selling: parseTcmbNumber(getTagText(block, "ForexSelling"), code, "ForexSelling"),
                },
            ];
        }),
    ) as Record<ExchangeCurrencyCode, ExchangeRatePair>;

    return {
        source: "TCMB",
        date,
        rates,
        fetchedAt,
    };
}
