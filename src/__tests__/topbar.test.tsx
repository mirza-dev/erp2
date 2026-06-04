// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import Topbar from "@/components/layout/Topbar";
import { getTopbarTitle } from "@/lib/topbar-title";

const mockState = vi.hoisted(() => ({
    pathname: "/dashboard",
    alertCount: 15,
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode; [key: string]: unknown }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => mockState.pathname,
}));

vi.mock("@/lib/data-context", () => ({
    useData: () => ({ activeAlertCount: mockState.alertCount }),
}));

const originalFetch = global.fetch;

const LIVE_RATE_PAYLOAD = {
    source: "LIVE_RATES",
    date: "2026-06-02",
    fetchedAt: "2026-06-02T12:00:00.000Z",
    rates: {
        USD: { buying: 40.1234, selling: 40.2876 },
        EUR: { buying: 46.2012, selling: 46.4148 },
    },
};

function mockTopbarFetch() {
    global.fetch = vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/settings/user/profile") {
            return Promise.resolve({
                ok: true,
                json: async () => ({ fullName: "Mirza Sarıbıyık", email: "mirza@example.com", avatarUrl: null }),
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
}

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    mockState.pathname = "/dashboard";
    mockState.alertCount = 15;
    vi.restoreAllMocks();
});

describe("getTopbarTitle", () => {
    it("liste ve ayar route'ları için doğru sayfa adını döndürür", () => {
        expect(getTopbarTitle("/dashboard")).toBe("Dashboard");
        expect(getTopbarTitle("/dashboard/orders")).toBe("Satış Siparişleri");
        expect(getTopbarTitle("/dashboard/import")).toBe("Veri Aktarım Merkezi");
        expect(getTopbarTitle("/dashboard/settings/product-types")).toBe("Teknik Şablonlar");
    });

    it("detay route'larında kayıt çekmeden statik parent başlık döndürür", () => {
        expect(getTopbarTitle("/dashboard/products/product-1")).toBe("Ürün Detayı");
        expect(getTopbarTitle("/dashboard/quotes/quote-1")).toBe("Teklif Detayı");
        expect(getTopbarTitle("/dashboard/orders/order-1")).toBe("Sipariş Detayı");
        expect(getTopbarTitle("/dashboard/orders/order-1/edit")).toBe("Sipariş Düzenle");
        expect(getTopbarTitle("/dashboard/purchase/orders/po-1/print")).toBe("Satın Alma Yazdır");
    });
});

describe("Topbar", () => {
    it("AI rozetini kaldırır ve route'a göre sayfa adını gösterir", async () => {
        mockState.pathname = "/dashboard/products/product-1";
        mockTopbarFetch();

        render(<Topbar />);

        expect(screen.getByText("KokpitERP")).toBeTruthy();
        expect(screen.queryByText("AI")).toBeNull();
        expect(screen.getByText("Ürün Detayı")).toBeTruthy();
        await waitFor(() => expect(screen.getByText("Bağlı")).toBeTruthy());
    });

    it("uyarı butonu yalnız alertCount > 0 iken görünür", () => {
        mockTopbarFetch();
        render(<Topbar />);

        expect(screen.getByText("15 Uyarı")).toBeTruthy();

        cleanup();
        mockState.alertCount = 0;
        render(<Topbar key="no-alerts" />);

        expect(screen.queryByText("15 Uyarı")).toBeNull();
        expect(screen.queryByText("0 Uyarı")).toBeNull();
    });

    it("avatar linki ve döviz göstergesi davranışını korur", async () => {
        mockTopbarFetch();

        render(<Topbar />);

        await waitFor(() => expect(screen.getByText("MS")).toBeTruthy());
        expect(screen.getByRole("link", { name: "Profil ve ayarlar" }).getAttribute("href")).toBe("/dashboard/settings?tab=kullanici");
        await waitFor(() => expect(screen.getByLabelText("Live-Rates döviz kurları")).toBeTruthy());
    });
});
