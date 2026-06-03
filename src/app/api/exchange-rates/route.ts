import { NextResponse } from "next/server";
import { parseLiveRatesExchangeRates, parseTcmbExchangeRates } from "@/lib/exchange-rates";

const TCMB_TODAY_XML_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const LIVE_RATES_URL = "https://www.live-rates.com/api/rates";
const LIVE_RATES_SECONDS = 20 * 60;
const ONE_HOUR_SECONDS = 60 * 60;
const ERROR_BODY = { error: "TCMB kur verisi şu anda alınamadı." };

export const revalidate = 1200;

function cacheHeaders(seconds: number) {
    return {
        "Cache-Control": `public, s-maxage=${seconds}, stale-while-revalidate=${Math.floor(seconds / 2)}`,
    };
}

async function fetchLiveRates(apiKey?: string) {
    const url = new URL(LIVE_RATES_URL);
    if (apiKey) url.searchParams.set("key", apiKey);

    const response = await fetch(url.toString(), {
        headers: { accept: "application/json" },
        next: { revalidate: LIVE_RATES_SECONDS },
    });

    if (!response.ok) throw new Error("Live-Rates unavailable");
    const payload: unknown = await response.json();
    return parseLiveRatesExchangeRates([payload]);
}

async function fetchTcmbRates() {
    const response = await fetch(TCMB_TODAY_XML_URL, {
        headers: { accept: "application/xml,text/xml,*/*" },
        next: { revalidate: ONE_HOUR_SECONDS },
    });

    if (!response.ok) throw new Error("TCMB unavailable");

    const xml = await response.text();
    return parseTcmbExchangeRates(xml);
}

export async function GET() {
    try {
        const liveRatesApiKey = process.env.LIVE_RATES_API_KEY?.trim();
        const payload = await fetchLiveRates(liveRatesApiKey || undefined);
        return NextResponse.json(payload, { headers: cacheHeaders(LIVE_RATES_SECONDS) });
    } catch {
        // Live kaynak opsiyonel; hata, limit veya bozuk payload TCMB fallback'e düşer.
    }

    try {
        const payload = await fetchTcmbRates();
        return NextResponse.json(payload, { headers: cacheHeaders(ONE_HOUR_SECONDS) });
    } catch {
        return NextResponse.json(ERROR_BODY, { status: 503 });
    }
}
