"use client";

import { memo, useEffect, useState } from "react";
import type { ExchangeCurrencyCode, ExchangeRatesResponse, ExchangeRatesSource } from "@/lib/exchange-rates";

const REFRESH_MS = 20 * 60 * 1000;
const CURRENCIES: ExchangeCurrencyCode[] = ["USD", "EUR"];
const CURRENCY_META: Record<ExchangeCurrencyCode, { symbol: string; label: string }> = {
    USD: { symbol: "$", label: "Amerikan Doları" },
    EUR: { symbol: "€", label: "Euro" },
};
const SOURCE_META: Record<ExchangeRatesSource, { badge: string; label: string }> = {
    LIVE_RATES: { badge: "LIVE", label: "Live-Rates" },
    TCMB: { badge: "TCMB", label: "TCMB" },
};
const RATE_FORMATTER = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

function isRatePayload(value: unknown): value is ExchangeRatesResponse {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ExchangeRatesResponse>;
    return (candidate.source === "LIVE_RATES" || candidate.source === "TCMB")
        && typeof candidate.date === "string"
        && !!candidate.rates
        && CURRENCIES.every((code) => {
            const rate = candidate.rates?.[code];
            return !!rate
                && Number.isFinite(rate.buying)
                && Number.isFinite(rate.selling)
                && rate.buying > 0
                && rate.selling > 0;
        });
}

function formatRate(value: number): string {
    return RATE_FORMATTER.format(value);
}

function sourceMeta(source: ExchangeRatesSource) {
    return SOURCE_META[source];
}

function titleForRates(rates: ExchangeRatesResponse): string {
    const meta = sourceMeta(rates.source);
    const timestamp = rates.providerTimestamp ?? rates.date;
    return `${meta.label} alış/satış kuru · ${timestamp}`;
}

// Düz (çip-içinde-çip yok) — sağ kümenin içinde, kendi kutusu yok.
// borderRight = ticker'a ait ayraç: ticker null dönerse (kur yüklenemezse)
// ayraç da görünmez (sarkan separatör olmaz).
const tickerStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    height: "30px",
    paddingRight: "10px",
    borderRight: "0.5px solid var(--border-tertiary)",
    color: "var(--text-secondary)",
    fontSize: "11px",
    lineHeight: 1,
    whiteSpace: "nowrap",
};

// Çip: kod + iki satır kolon (Alış kalın · Satış yeşil) — tasarım RateChip'i.
const rateStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "7px",
};

// Çipler arası dikey ayraç (nokta yerine).
const sepStyle: React.CSSProperties = {
    width: "1px",
    height: "20px",
    background: "var(--border-tertiary)",
};

const codeGroupStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "3px",
};

const symbolStyle: React.CSSProperties = {
    color: "var(--text-tertiary)",
    fontWeight: 650,
    fontSize: "11px",
};

const codeStyle: React.CSSProperties = {
    color: "var(--text-primary)",
    fontWeight: 700,
    fontSize: "11.5px",
};

const colStyle: React.CSSProperties = {
    display: "inline-flex",
    flexDirection: "column",
    lineHeight: 1.2,
    fontVariantNumeric: "tabular-nums",
};

const lineStyle: React.CSSProperties = { fontSize: "10px" };
const labelStyle: React.CSSProperties = { color: "var(--text-tertiary)" };
const buyValStyle: React.CSSProperties = { color: "var(--text-primary)", fontWeight: 700 };
const sellValStyle: React.CSSProperties = { color: "var(--success-text)", fontWeight: 700 };

const ExchangeRatesTicker = memo(function ExchangeRatesTicker() {
    const [rates, setRates] = useState<ExchangeRatesResponse | null>(null);

    useEffect(() => {
        let cancelled = false;

        async function loadRates() {
            try {
                const response = await fetch("/api/exchange-rates");
                if (!response.ok) {
                    if (!cancelled) setRates(null);
                    return;
                }

                const payload: unknown = await response.json();
                if (!cancelled) setRates(isRatePayload(payload) ? payload : null);
            } catch {
                if (!cancelled) setRates(null);
            }
        }

        void loadRates();
        const timer = window.setInterval(() => { void loadRates(); }, REFRESH_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, []);

    if (!rates) return null;
    const meta = sourceMeta(rates.source);

    return (
        <div
            aria-label={`${meta.label} döviz kurları`}
            title={titleForRates(rates)}
            style={tickerStyle}
        >
            {CURRENCIES.map((code, index) => {
                const rate = rates.rates[code];
                const currency = CURRENCY_META[code];
                return (
                    <span key={code} style={rateStyle}>
                        {index > 0 && <span aria-hidden="true" style={sepStyle} />}
                        <span aria-label={`${currency.label} (${currency.symbol} ${code})`} style={codeGroupStyle}>
                            <span aria-hidden="true" style={symbolStyle}>{currency.symbol}</span>
                            <span aria-hidden="true" style={codeStyle}>{code}</span>
                        </span>
                        <span style={colStyle}>
                            <span style={lineStyle}>
                                <span style={labelStyle}>Alış</span> <b style={buyValStyle}>{formatRate(rate.buying)}</b>
                            </span>
                            <span style={lineStyle}>
                                <span style={labelStyle}>Satış</span> <b style={sellValStyle}>{formatRate(rate.selling)}</b>
                            </span>
                        </span>
                    </span>
                );
            })}
        </div>
    );
});

export default ExchangeRatesTicker;
