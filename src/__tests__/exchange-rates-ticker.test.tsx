// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import ExchangeRatesTicker from "@/components/layout/ExchangeRatesTicker";
import Topbar from "@/components/layout/Topbar";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode; [key: string]: unknown }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("@/lib/data-context", () => ({
    useData: () => ({ activeAlertCount: 15 }),
}));

const originalFetch = global.fetch;

const LIVE_RATE_PAYLOAD = {
    source: "LIVE_RATES",
    date: "2026-06-02",
    fetchedAt: "2026-06-02T12:00:00.000Z",
    providerTimestamp: "2026-06-02T12:00:01.000Z",
    rates: {
        USD: { buying: 40.1234, selling: 40.2876 },
        EUR: { buying: 46.2012, selling: 46.4148 },
    },
};

const TCMB_RATE_PAYLOAD = {
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
    it("Live-Rates response'unda LIVE rozetiyle USD/EUR alış-satış kurlarını gösterir", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => LIVE_RATE_PAYLOAD,
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<ExchangeRatesTicker />);

        await waitFor(() => expect(screen.getByText("LIVE")).toBeTruthy());
        expect(screen.getByText("USD")).toBeTruthy();
        expect(screen.getByText("40,123 / 40,288")).toBeTruthy();
        expect(screen.getByText("EUR")).toBeTruthy();
        expect(screen.getByText("46,201 / 46,415")).toBeTruthy();
        expect(screen.getByLabelText("Live-Rates döviz kurları")).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith("/api/exchange-rates");
    });

    it("TCMB fallback response'unda TCMB rozetiyle render eder", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => TCMB_RATE_PAYLOAD,
        }) as unknown as typeof fetch;

        render(<ExchangeRatesTicker />);

        await waitFor(() => expect(screen.getByText("TCMB")).toBeTruthy());
        expect(screen.getByLabelText("TCMB döviz kurları")).toBeTruthy();
    });

    it("kurları 20 dakikada bir yeniler", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => LIVE_RATE_PAYLOAD,
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<ExchangeRatesTicker />);

        await act(async () => {
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(19 * 60 * 1000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(60 * 1000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
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
        global.fetch = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/settings/user/profile") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ fullName: "Can Sarı", email: "can.sari@example.com", avatarUrl: null }),
                } as Response);
            }
            return Promise.resolve({
                ok: true,
                json: async () => LIVE_RATE_PAYLOAD,
            } as Response);
        }) as unknown as typeof fetch;

        render(<Topbar />);

        expect(screen.getByText("Bağlı")).toBeTruthy();
        expect(screen.getByText("15 Uyarı")).toBeTruthy();
        await waitFor(() => expect(screen.getByRole("link", { name: "Profil ve ayarlar" })).toBeTruthy());
        expect(screen.getByText("CS")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Profil ve ayarlar" }).getAttribute("href")).toBe("/dashboard/settings?tab=kullanici");
        await waitFor(() => expect(screen.getByLabelText("Live-Rates döviz kurları")).toBeTruthy());
    });
});
