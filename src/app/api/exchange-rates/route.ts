import { NextResponse } from "next/server";
import { parseTcmbExchangeRates } from "@/lib/exchange-rates";

const TCMB_TODAY_XML_URL = "https://www.tcmb.gov.tr/kurlar/today.xml";
const ONE_HOUR_SECONDS = 60 * 60;

export const revalidate = 3600;

export async function GET() {
    try {
        const response = await fetch(TCMB_TODAY_XML_URL, {
            headers: { accept: "application/xml,text/xml,*/*" },
            next: { revalidate: ONE_HOUR_SECONDS },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: "TCMB kur verisi şu anda alınamadı." },
                { status: 503 },
            );
        }

        const xml = await response.text();
        const payload = parseTcmbExchangeRates(xml);

        return NextResponse.json(payload, {
            headers: {
                "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
            },
        });
    } catch {
        return NextResponse.json(
            { error: "TCMB kur verisi şu anda alınamadı." },
            { status: 503 },
        );
    }
}
