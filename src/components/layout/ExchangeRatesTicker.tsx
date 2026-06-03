"use client";

import { memo, useEffect, useState } from "react";
import type { ExchangeCurrencyCode, ExchangeRatesResponse, ExchangeRatesSource } from "@/lib/exchange-rates";

const REFRESH_MS = 20 * 60 * 1000;
const CURRENCIES: ExchangeCurrencyCode[] = ["USD", "EUR"];
const SYMBOLS: Record<ExchangeCurrencyCode, string> = { USD: "$", EUR: "€" };
const SOURCE_META: Record<ExchangeRatesSource, { badge: string; label: string }> = {
    LIVE_RATES: { badge: "LIVE", label: "Live-Rates" },
    TCMB: { badge: "TCMB", label: "TCMB" },
};
const RATE_FORMATTER = new Intl.NumberFormat("tr-TR", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
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

const tickerStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    height: "28px",
    padding: "2px 5px 2px 6px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "7px",
    background: "var(--bg-secondary)",
    color: "var(--text-secondary)",
    boxSizing: "border-box",
    whiteSpace: "nowrap",
};

const sourceStyle: React.CSSProperties = {
    height: "20px",
    display: "inline-flex",
    alignItems: "center",
    padding: "0 6px",
    border: "0.5px solid var(--accent-border)",
    borderRadius: "5px",
    background: "var(--accent-bg)",
    color: "var(--accent-text)",
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.04em",
    lineHeight: 1,
};

const ratesStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "3px",
};

const rateStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    height: "22px",
    padding: "0 6px",
    borderRadius: "5px",
    background: "var(--bg-tertiary)",
    fontSize: "11px",
    lineHeight: 1,
};

const codeStyle: React.CSSProperties = {
    color: "var(--text-primary)",
    fontWeight: 600,
};

const labelStyle: React.CSSProperties = {
    color: "var(--text-tertiary)",
    fontSize: "10px",
    fontWeight: 600,
};

const valueStyle: React.CSSProperties = {
    color: "var(--text-secondary)",
    fontVariantNumeric: "tabular-nums",
};

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
            <span style={sourceStyle}>{meta.badge}</span>
            <span style={ratesStyle}>
                {CURRENCIES.map((code) => {
                    const rate = rates.rates[code];
                    return (
                        <span key={code} style={rateStyle}>
                            <span aria-hidden="true">{SYMBOLS[code]}</span>
                            <span style={codeStyle}>{code}</span>
                            <span style={labelStyle}>A/S</span>
                            <span style={valueStyle}>
                                {formatRate(rate.buying)} / {formatRate(rate.selling)}
                            </span>
                        </span>
                    );
                })}
            </span>
        </div>
    );
});

export default ExchangeRatesTicker;
