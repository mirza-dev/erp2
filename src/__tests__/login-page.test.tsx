// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LoginPage from "@/app/login/page";

const { mockSignInWithPassword, mockClearDemoMode, router } = vi.hoisted(() => ({
    mockSignInWithPassword: vi.fn(),
    mockClearDemoMode: vi.fn(),
    router: {
        push: vi.fn(),
        refresh: vi.fn(),
    },
}));

vi.mock("next/navigation", () => ({
    useRouter: () => router,
}));

vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({
        auth: {
            signInWithPassword: mockSignInWithPassword,
        },
    }),
}));

vi.mock("@/lib/demo-utils", () => ({
    clearDemoMode: mockClearDemoMode,
}));

beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ error: null });
});

afterEach(() => cleanup());

function fillCredentials() {
    fireEvent.change(screen.getByLabelText("E-posta"), {
        target: { value: "user@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Şifre"), {
        target: { value: "secret-pass" },
    });
}

describe("LoginPage", () => {
    it("markayı panel dışında gösterir ve demo erişimini login'de render etmez", () => {
        const { container } = render(<LoginPage />);
        const brand = container.querySelector(".login-brand");
        const panel = container.querySelector(".login-panel");

        expect(brand).toBeTruthy();
        expect(panel).toBeTruthy();
        expect(within(brand as HTMLElement).getByText("Roven")).toBeTruthy();
        expect(within(panel as HTMLElement).queryByText("Roven")).toBeNull();
        expect(screen.queryByText(/demo/i)).toBeNull();
        expect(container.querySelector(".login-brand-geometry")).toBeTruthy();
        expect((screen.getByLabelText("E-posta") as HTMLInputElement).autocomplete).toBe("email");
        expect((screen.getByLabelText("Şifre") as HTMLInputElement).autocomplete).toBe("current-password");
    });

    it("şifre göster/gizle kontrolü input tipini erişilebilir biçimde değiştirir", () => {
        render(<LoginPage />);
        const password = screen.getByLabelText("Şifre") as HTMLInputElement;

        expect(password.type).toBe("password");
        fireEvent.click(screen.getByRole("button", { name: "Parolayı göster" }));
        expect(password.type).toBe("text");
        fireEvent.click(screen.getByRole("button", { name: "Parolayı gizle" }));
        expect(password.type).toBe("password");
    });

    it("submit sürerken CTA'yı disabled ve loading metniyle gösterir", async () => {
        mockSignInWithPassword.mockImplementation(() => new Promise(() => undefined));
        render(<LoginPage />);
        fillCredentials();

        fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

        await waitFor(() => {
            const button = screen.getByRole("button", { name: "Giriş yapılıyor…" });
            expect((button as HTMLButtonElement).disabled).toBe(true);
        });
    });

    it("hatalı kimlik bilgisinde erişilebilir hata mesajı gösterir", async () => {
        mockSignInWithPassword.mockResolvedValue({ error: { message: "Invalid credentials" } });
        render(<LoginPage />);
        fillCredentials();

        fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("E-posta veya şifre hatalı.");
        expect(alert.getAttribute("aria-live")).toBe("polite");
        expect(mockClearDemoMode).not.toHaveBeenCalled();
        expect(router.push).not.toHaveBeenCalled();
    });

    it("başarılı girişte auth payload'ını, demo temizliğini ve yönlendirmeyi korur", async () => {
        render(<LoginPage />);
        fillCredentials();

        fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

        await waitFor(() => {
            expect(mockSignInWithPassword).toHaveBeenCalledWith({
                email: "user@example.com",
                password: "secret-pass",
            });
            expect(mockClearDemoMode).toHaveBeenCalledTimes(1);
            expect(router.push).toHaveBeenCalledWith("/dashboard");
            expect(router.refresh).toHaveBeenCalledTimes(1);
        });
    });
});
