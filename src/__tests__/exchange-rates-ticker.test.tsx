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

vi.mock("next/navigation", () => ({
    usePathname: () => "/dashboard",
}));

vi.mock("@/lib/data-context", () => ({
    useData: () => ({ activeAlertCount: 15 }),
}));

// Topbar artık ThemeToggle render eder (useTheme + useToast ister) — çıplak render
// için stub'lanır; tema davranışı theme-system.test.ts'te kapsanır.
vi.mock("@/lib/theme/use-theme", () => ({
    useTheme: () => ({ theme: "dark", resolved: "dark", setTheme: vi.fn(), toggle: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
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
    it("Live-Rates response'unda USD/EUR alış-satış kurlarını düz metin gösterir (kaynak rozeti yok, aria-label'da)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => LIVE_RATE_PAYLOAD,
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<ExchangeRatesTicker />);

        await waitFor(() => expect(screen.getByLabelText("Amerikan Doları ($ USD)")).toBeTruthy());
        expect(screen.getByLabelText("Euro (€ EUR)")).toBeTruthy();
        expect(screen.getByText("$")).toBeTruthy();
        expect(screen.getByText("USD")).toBeTruthy();
        expect(screen.getByText("€")).toBeTruthy();
        expect(screen.getByText("EUR")).toBeTruthy();
        // Tasarım RateChip: Alış/Satış iki satır, 2 ondalık (satış yeşil).
        expect(screen.getAllByText("Alış")).toHaveLength(2);
        expect(screen.getAllByText("Satış")).toHaveLength(2);
        expect(screen.getByText("40,12")).toBeTruthy();
        expect(screen.getByText("40,29")).toBeTruthy();
        expect(screen.getByText("46,20")).toBeTruthy();
        expect(screen.getByText("46,41")).toBeTruthy();
        // Sakin düz: görünür LIVE/TCMB çip rozeti kaldırıldı; kaynak aria-label + tooltip'te.
        expect(screen.queryByText("LIVE")).toBeNull();
        expect(screen.getByLabelText("Live-Rates döviz kurları")).toBeTruthy();
        expect(fetchMock).toHaveBeenCalledWith("/api/exchange-rates");
    });

    it("TCMB fallback response'unda kaynağı aria-label'da taşır (görünür rozet yok)", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => TCMB_RATE_PAYLOAD,
        }) as unknown as typeof fetch;

        render(<ExchangeRatesTicker />);

        await waitFor(() => expect(screen.getByLabelText("TCMB döviz kurları")).toBeTruthy());
        expect(screen.queryByText("TCMB")).toBeNull();
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

    it("üst barın mevcut Bağlı ve avatar davranışını korur (uyarı butonu kaldırıldı)", async () => {
        global.fetch = vi.fn((input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/settings/user/profile") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ fullName: "Can Sarı", email: "can.sari@example.com", avatarUrl: null }),
                } as Response);
            }
            if (url === "/api/health") {
                return Promise.resolve({
                    ok: true,
                    json: async () => ({ status: "ok" }),
                } as Response);
            }
            return Promise.resolve({
                ok: true,
                json: async () => LIVE_RATE_PAYLOAD,
            } as Response);
        }) as unknown as typeof fetch;

        render(<Topbar />);

        await waitFor(() => expect(screen.getByText("Bağlı")).toBeTruthy());
        expect(screen.getByText("Dashboard")).toBeTruthy();
        expect(screen.queryByText("15 Uyarı")).toBeNull();
        await waitFor(() => expect(screen.getByRole("link", { name: "Profil ve ayarlar" })).toBeTruthy());
        expect(screen.getByText("CS")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Profil ve ayarlar" }).getAttribute("href")).toBe("/dashboard/settings?tab=kullanici");
        await waitFor(() => expect(screen.getByLabelText("Live-Rates döviz kurları")).toBeTruthy());
    });
});
