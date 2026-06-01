// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Permission } from "@/lib/auth/permissions";
import SettingsPage from "@/app/dashboard/settings/page";

const router = {
    push: vi.fn(),
    replace: vi.fn(),
};
let searchParams = new URLSearchParams();
let mockedPerms: Set<Permission> | null = null;

vi.mock("next/navigation", () => ({
    useRouter: () => router,
    useSearchParams: () => searchParams,
}));

vi.mock("@/lib/auth/use-permissions", () => ({
    usePermissions: () => ({
        perms: mockedPerms,
        loading: mockedPerms === null,
        has: (perm: Permission) => mockedPerms === null || mockedPerms.has(perm),
        canViewSalesPrices: true,
        canViewPurchaseCosts: true,
        canViewFinancialSummary: true,
    }),
}));

vi.mock("@/components/ui/Toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/ui/DemoBanner", () => ({
    default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/settings/ResetDemoSection", () => ({
    default: () => <div data-testid="reset-demo-section" />,
}));

const originalFetch = global.fetch;

beforeEach(() => {
    router.push.mockClear();
    router.replace.mockClear();
    searchParams = new URLSearchParams();
    mockedPerms = new Set<Permission>(["view_dashboard"]);
    global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ fullName: "Can Sarı", email: "can.sari@example.com", avatarUrl: null }),
    }) as unknown as typeof fetch;
});

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe("SettingsPage tab access", () => {
    it("yetkisiz kullanıcı sistem tablarını görmez, yalnız Profil ve Bildirimler görünür", async () => {
        render(<SettingsPage />);

        expect(screen.getByRole("button", { name: "Profil" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Bildirimler" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Firma Profili" })).toBeNull();
        expect(screen.queryByRole("button", { name: "API Anahtarları" })).toBeNull();
        expect(screen.queryByTestId("reset-demo-section")).toBeNull();
        await waitFor(() => expect(screen.getByText("Profil Bilgileri")).toBeTruthy());
    });

    it("admin/yetkili kullanıcı tüm mevcut tabları görür", () => {
        mockedPerms = new Set<Permission>(["view_dashboard", "view_settings"]);

        render(<SettingsPage />);

        expect(screen.getByRole("button", { name: "Firma Profili" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Profil" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Bildirimler" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "API Anahtarları" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Yapay Zeka" })).toBeTruthy();
        expect(screen.getByTestId("reset-demo-section")).toBeTruthy();
    });

    it("yetkisiz ?tab=firma query'sini kişisel profile fallback eder", async () => {
        searchParams = new URLSearchParams("tab=firma");

        render(<SettingsPage />);

        await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard/settings?tab=kullanici"));
        expect(screen.getByRole("button", { name: "Profil" })).toBeTruthy();
        expect(screen.queryByRole("button", { name: "Firma Profili" })).toBeNull();
    });

    it("?tab=kullanici doğrudan profil tabını açar", async () => {
        searchParams = new URLSearchParams("tab=kullanici");

        render(<SettingsPage />);

        await waitFor(() => expect(screen.getByText("Profil Bilgileri")).toBeTruthy());
        expect(router.replace).not.toHaveBeenCalled();
    });
});
