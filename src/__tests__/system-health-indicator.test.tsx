// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SystemHealthIndicator from "@/components/layout/SystemHealthIndicator";
import { SwrTestWrapper } from "./helpers/swr-test-wrapper";

const originalFetch = global.fetch;

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("SystemHealthIndicator", () => {
    it("/api/health ok dönerse Bağlı gösterir", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok" }),
        }) as unknown as typeof fetch;

        render(<SystemHealthIndicator />, { wrapper: SwrTestWrapper });

        await waitFor(() => expect(screen.getByText("Bağlı")).toBeTruthy());
        expect(screen.getByLabelText("Sistem durumu: Bağlı")).toBeTruthy();
        expect(global.fetch).toHaveBeenCalledWith("/api/health");
    });

    it("degraded response, non-OK veya fetch hatasında Sorun var gösterir", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "degraded" }),
        }) as unknown as typeof fetch;

        render(<SystemHealthIndicator />, { wrapper: SwrTestWrapper });
        await waitFor(() => expect(screen.getByText("Sorun var")).toBeTruthy());

        cleanup();
        global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;
        render(<SystemHealthIndicator />, { wrapper: SwrTestWrapper });
        await waitFor(() => expect(screen.getByText("Sorun var")).toBeTruthy());

        cleanup();
        global.fetch = vi.fn().mockRejectedValue(new Error("network")) as unknown as typeof fetch;
        render(<SystemHealthIndicator />, { wrapper: SwrTestWrapper });
        await waitFor(() => expect(screen.getByText("Sorun var")).toBeTruthy());
    });

    it("health bilgisini 5 dakikada bir yeniler", async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ status: "ok" }),
        });
        global.fetch = fetchMock as unknown as typeof fetch;

        render(<SystemHealthIndicator />, { wrapper: SwrTestWrapper });

        await act(async () => {
            await Promise.resolve();
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync((5 * 60 * 1000) - 1);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
