// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import UserAvatarLink from "@/components/layout/UserAvatarLink";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string; children: ReactNode; [key: string]: unknown }) => (
        <a href={href} {...props}>{children}</a>
    ),
}));

const originalFetch = global.fetch;

afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.restoreAllMocks();
});

describe("UserAvatarLink", () => {
    it("profil API başarılıysa ad-soyad baş harflerini ve profil linkini gösterir", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ fullName: "Mirza Sarıbıyık", email: "mirza@example.com", avatarUrl: null }),
        }) as unknown as typeof fetch;

        render(<UserAvatarLink />);

        await waitFor(() => expect(screen.getByText("MS")).toBeTruthy());
        expect(screen.getByRole("link", { name: "Profil ve ayarlar" }).getAttribute("href")).toBe("/dashboard/settings?tab=kullanici");
    });

    it("fullName yoksa e-posta prefix'inden fallback gösterir", async () => {
        global.fetch = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ fullName: "", email: "cenk.sari@example.com", avatarUrl: null }),
        }) as unknown as typeof fetch;

        render(<UserAvatarLink />);

        await waitFor(() => expect(screen.getByText("CS")).toBeTruthy());
    });

    it("profil API hata verirse topbar kırılmaz ve fallback avatar gösterir", async () => {
        global.fetch = vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }) as unknown as typeof fetch;

        render(<UserAvatarLink />);

        await waitFor(() => expect(global.fetch).toHaveBeenCalledWith("/api/settings/user/profile"));
        expect(screen.getByText("?")).toBeTruthy();
        expect(screen.getByRole("link", { name: "Profil ve ayarlar" }).getAttribute("href")).toBe("/dashboard/settings?tab=kullanici");
    });
});
