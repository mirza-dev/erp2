"use client";

import { memo, useEffect, useState } from "react";
import type { ExchangeCurrencyCode, ExchangeRatesResponse } from "@/lib/exchange-rates";

const REFRESH_MS = 60 * 60 * 1000;
const CURRENCIES: ExchangeCurrencyCode[] = ["USD", "EUR"];
const SYMBOLS: Record<ExchangeCurrencyCode, string> = { USD: "$", EUR: "€" };

function isRatePayload(value: unknown): value is ExchangeRatesResponse {
    if (!value || typeof value !== "object") return false;
    const candidate = value as Partial<ExchangeRatesResponse>;
    return candidate.source === "TCMB"
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
    return new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(value);
}

const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    height: "24px",
    padding: "0 8px",
    border: "0.5px solid var(--border-secondary)",
    borderRadius: "6px",
    background: "var(--bg-secondary)",
    color: "var(--text-secondary)",
    fontSize: "11px",
    lineHeight: 1,
    whiteSpace: "nowrap",
};

const codeStyle: React.CSSProperties = {
    color: "var(--text-primary)",
    fontWeight: 600,
};

const valueStyle: React.CSSProperties = {
    color: "var(--text-tertiary)",
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

    return (
        <div
            aria-label="TCMB döviz kurları"
            title={`TCMB alış/satış kuru · ${rates.date}`}
            style={{ display: "flex", alignItems: "center", gap: "6px" }}
        >
            {CURRENCIES.map((code) => {
                const rate = rates.rates[code];
                return (
                    <span key={code} style={chipStyle}>
                        <span aria-hidden="true">{SYMBOLS[code]}</span>
                        <span style={codeStyle}>{code} A/S</span>
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
