// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import ExchangeRatesTicker from "@/components/layout/ExchangeRatesTicker";
import Topbar from "@/components/layout/Topbar";

vi.mock("next/link", () => ({
    default: ({ href, children }: { href: string; children: ReactNode }) => (
        <a href={href}>{children}</a>
    ),
}));

vi.mock("@/lib/data-context", () => ({
    useData: () => ({ activeAlertCount: 15 }),
}));

const originalFetch = global.fetch;

const RATE_PAYLOAD = {
    source: "TCMB",
    date: "01.06.2026",
    fetchedAt: "2026-06-01T12:00:00.000Z",
    rates: {
        USD: { buying: 40.1234, selling: 40.2876 },
        EUR: { buying: 46.2012, selling: 46.4148 },
    },
};

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("ExchangeRatesTicker", () => {
    it("başarılı API response'unda USD/EUR alış-satış kurlarını gösterir", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => RATE_PAYLOAD,
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<ExchangeRatesTicker />);

        await waitFor(() => expect(screen.getByText("TCMB")).toBeTruthy());
        expect(screen.getByText("USD")).toBeTruthy();
        expect(screen.getByText("40,123 / 40,288")).toBeTruthy();
        expect(screen.getByText("EUR")).toBeTruthy();
        expect(screen.getByText("46,201 / 46,415")).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith("/api/exchange-rates");
    });

    it("API hata verirse hiçbir chip render etmez", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: false,
            json: async () => ({}),
        }) as unknown as typeof fetch;

        const { container } = render(<ExchangeRatesTicker />);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/exchange-rates"));
        expect(container.textContent).toBe("");
    });

    it("üst barın mevcut Bağlı, uyarı ve avatar davranışını korur", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => RATE_PAYLOAD,
        }) as unknown as typeof fetch;

        render(<Topbar />);

        expect(screen.getByText("Bağlı")).toBeTruthy();
        expect(screen.getByText("15 Uyarı")).toBeTruthy();
        expect(screen.getByText("CS")).toBeTruthy();
        await waitFor(() => expect(screen.getByLabelText("TCMB döviz kurları")).toBeTruthy());
    });
});
