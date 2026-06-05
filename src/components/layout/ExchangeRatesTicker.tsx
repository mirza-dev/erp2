"use client";

import { memo, useEffect, useState } from "react";
import type { ExchangeCurrencyCode, ExchangeRatesResponse, ExchangeRatesSource } from "@/lib/exchange-rates";

const REFRESH_MS = 20 * 60 * 1000;
const CURRENCIES: ExchangeCurrencyCode[] = ["USD", "EUR"];
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

// Düz (çip-içinde-çip yok) — sağ kümenin içinde, kendi kutusu yok.
// borderRight = ticker'a ait ayraç: ticker null dönerse (kur yüklenemezse)
// ayraç da görünmez (sarkan separatör olmaz).
const tickerStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    height: "20px",
    paddingRight: "10px",
    borderRight: "0.5px solid var(--border-tertiary)",
    color: "var(--text-secondary)",
    fontSize: "11px",
    lineHeight: 1,
    whiteSpace: "nowrap",
};

const rateStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
};

const sepStyle: React.CSSProperties = {
    color: "var(--text-tertiary)",
};

const codeStyle: React.CSSProperties = {
    color: "var(--text-primary)",
    fontWeight: 700,
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
            {CURRENCIES.map((code, index) => {
                const rate = rates.rates[code];
                return (
                    <span key={code} style={rateStyle}>
                        {index > 0 && <span aria-hidden="true" style={sepStyle}>·</span>}
                        <span style={codeStyle}>{code}</span>
                        <span style={valueStyle}>
                            {formatRate(rate.buying)} / {formatRate(rate.selling)}
                        </span>
                    </span>
                );
            })}
        </div>
    );
});

export default ExchangeRatesTicker;
