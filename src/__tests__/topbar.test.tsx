// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactNode } from "react";
import Topbar from "@/components/layout/Topbar";
import { getTopbarTitle } from "@/lib/topbar-title";

const mockState = vi.hoisted(() => ({
    pathname: "/dashboard",
}));

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode; [key: string]: unknown }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => mockState.pathname,
}));

// ThemeToggle, useTheme + useToast bağlamı ister — Topbar'ı çıplak render ettiğimiz
// için stub'larız (tema mantığı theme-system.test.ts'te ayrıca kapsanır).
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

        expect(screen.getByText("Roven")).toBeTruthy();
        expect(screen.queryByText("AI")).toBeNull();
        expect(screen.getByText("Ürün Detayı")).toBeTruthy();
        await waitFor(() => expect(screen.getByText("Bağlı")).toBeTruthy());
    });

    it("uyarı butonu artık topbar'da render edilmez (Sidebar'a taşındı)", () => {
        mockTopbarFetch();
        render(<Topbar />);

        // Uyarı erişimi Sidebar'daki "Uyarılar" sayacında — topbar'da hiçbir
        // "N Uyarı" çipi olmamalı + /dashboard/alerts linki bulunmamalı.
        expect(screen.queryByText(/Uyarı/)).toBeNull();
        expect(screen.queryByRole("link", { name: /aktif uyarı/i })).toBeNull();
        const alertLinks = screen.queryAllByRole("link").filter(
            (el) => el.getAttribute("href") === "/dashboard/alerts",
        );
        expect(alertLinks).toHaveLength(0);
    });

    it("avatar linki ve döviz göstergesi davranışını korur", async () => {
        mockTopbarFetch();

        render(<Topbar />);

        await waitFor(() => expect(screen.getByText("MS")).toBeTruthy());
        expect(screen.getByRole("link", { name: "Profil ve ayarlar" }).getAttribute("href")).toBe("/dashboard/settings?tab=kullanici");
        await waitFor(() => expect(screen.getByLabelText("Live-Rates döviz kurları")).toBeTruthy());
    });
});

describe("Topbar — Sakin düz tasarım (kaynak regresyonu)", () => {
    const TOPBAR_SRC = readFileSync(join(process.cwd(), "src/components/layout/Topbar.tsx"), "utf8");
    const TICKER_SRC = readFileSync(join(process.cwd(), "src/components/layout/ExchangeRatesTicker.tsx"), "utf8");
    const HEALTH_SRC = readFileSync(join(process.cwd(), "src/components/layout/SystemHealthIndicator.tsx"), "utf8");

    it("Topbar uyarı bağımlılıklarını taşımaz (AlertTriangle / useData / activeAlertCount yok)", () => {
        expect(TOPBAR_SRC).not.toMatch(/AlertTriangle/);
        expect(TOPBAR_SRC).not.toMatch(/useData/);
        expect(TOPBAR_SRC).not.toMatch(/activeAlertCount/);
        expect(TOPBAR_SRC).not.toMatch(/\/dashboard\/alerts/);
    });

    it("Topbar başlığı sola taşır (page-context pill yok, divider var)", () => {
        expect(TOPBAR_SRC).not.toMatch(/topbar-page-context/);
        expect(TOPBAR_SRC).toMatch(/topbar-divider/);
        expect(TOPBAR_SRC).toMatch(/topbar-page-title/);
    });

    it("ExchangeRatesTicker düzleşir (çip-içinde-çip kalkar: rateStyle box / sourceStyle badge / A-S etiketi yok)", () => {
        // Per-kur dolu pill (background var-bg-tertiary) ve accent kaynak rozeti kaldırıldı.
        expect(TICKER_SRC).not.toMatch(/var\(--bg-tertiary\)/);
        expect(TICKER_SRC).not.toMatch(/sourceStyle/);
        expect(TICKER_SRC).not.toMatch(/labelStyle/);
        expect(TICKER_SRC).not.toMatch(/A\/S/);
        // Ayraç ticker'a ait (null ticker'da sarkmaz).
        expect(TICKER_SRC).toMatch(/borderRight/);
    });

    it("SystemHealthIndicator dolu pill yerine nokta kullanır (lucide ikon / border+bg pill yok)", () => {
        expect(HEALTH_SRC).not.toMatch(/lucide-react/);
        expect(HEALTH_SRC).not.toMatch(/var\(--success-bg\)/);
        expect(HEALTH_SRC).not.toMatch(/var\(--danger-bg\)/);
        expect(HEALTH_SRC).toMatch(/borderRadius: "50%"/);
        expect(HEALTH_SRC).toMatch(/pulse-dot/);
    });
});
