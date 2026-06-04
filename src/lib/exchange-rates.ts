export type ExchangeCurrencyCode = "USD" | "EUR";
export type ExchangeRatesSource = "LIVE_RATES" | "TCMB";

export interface ExchangeRatePair {
    buying: number;
    selling: number;
}

export interface ExchangeRatesResponse {
    source: ExchangeRatesSource;
    date: string;
    rates: Record<ExchangeCurrencyCode, ExchangeRatePair>;
    fetchedAt: string;
    providerTimestamp?: string;
}

const CURRENCY_CODES: ExchangeCurrencyCode[] = ["USD", "EUR"];
const LIVE_RATE_PAIRS: Record<ExchangeCurrencyCode, string> = {
    USD: "USDTRY",
    EUR: "EURTRY",
};

interface LiveRatesQuote {
    currency?: unknown;
    bid?: unknown;
    ask?: unknown;
    timestamp?: unknown;
}

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

function normalizeCurrencyPair(value: unknown): string {
    return typeof value === "string" ? value.replace(/[^a-z0-9]/gi, "").toUpperCase() : "";
}

function normalizeLiveRatesItems(value: unknown): LiveRatesQuote[] {
    if (Array.isArray(value)) return value.filter(item => item && typeof item === "object") as LiveRatesQuote[];
    return value && typeof value === "object" ? [value as LiveRatesQuote] : [];
}

function parseLiveRatesNumber(value: unknown, pair: string, field: "bid" | "ask"): number {
    const parsed = typeof value === "number"
        ? value
        : typeof value === "string"
            ? Number(value.replace(",", "."))
            : Number.NaN;

    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error(`Live-Rates ${pair} ${field} invalid`);
    }

    return parsed;
}

function parseLiveRatesTimestamp(value: unknown): string | undefined {
    const parsed = typeof value === "number"
        ? value
        : typeof value === "string"
            ? Number(value)
            : Number.NaN;

    if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
    const milliseconds = parsed < 10_000_000_000 ? parsed * 1000 : parsed;
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
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

export function parseLiveRatesExchangeRates(payloads: unknown[], fetchedAt = new Date().toISOString()): ExchangeRatesResponse {
    const quotes = payloads.flatMap(normalizeLiveRatesItems);
    const providerTimestamps: string[] = [];

    const rates = Object.fromEntries(
        CURRENCY_CODES.map((code) => {
            const pair = LIVE_RATE_PAIRS[code];
            const quote = quotes.find(item => normalizeCurrencyPair(item.currency) === pair);
            if (!quote) throw new Error(`Live-Rates ${pair} quote missing`);

            const providerTimestamp = parseLiveRatesTimestamp(quote.timestamp);
            if (providerTimestamp) providerTimestamps.push(providerTimestamp);

            return [
                code,
                {
                    buying: parseLiveRatesNumber(quote.bid, pair, "bid"),
                    selling: parseLiveRatesNumber(quote.ask, pair, "ask"),
                },
            ];
        }),
    ) as Record<ExchangeCurrencyCode, ExchangeRatePair>;

    providerTimestamps.sort();
    const providerTimestamp = providerTimestamps[providerTimestamps.length - 1];

    return {
        source: "LIVE_RATES",
        date: providerTimestamp?.slice(0, 10) ?? fetchedAt.slice(0, 10),
        rates,
        fetchedAt,
        ...(providerTimestamp ? { providerTimestamp } : {}),
    };
}
