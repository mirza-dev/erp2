// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import LoginPage from "@/app/login/page";

const { mockSignInWithPassword, mockSignInWithOAuth, mockResetPasswordForEmail, mockClearDemoMode, router } = vi.hoisted(() => ({
    mockSignInWithPassword: vi.fn(),
    mockSignInWithOAuth: vi.fn(),
    mockResetPasswordForEmail: vi.fn(),
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
            signInWithOAuth: mockSignInWithOAuth,
            resetPasswordForEmail: mockResetPasswordForEmail,
        },
    }),
}));

vi.mock("@/lib/demo-utils", () => ({
    clearDemoMode: mockClearDemoMode,
}));

// ThemeProvider 'system' effect'inde window.matchMedia çağırır — jsdom default'ta yok.
function stubMatchMedia(matches = false) {
    Object.defineProperty(window, "matchMedia", {
        writable: true,
        configurable: true,
        value: vi.fn().mockImplementation((query: string) => ({
            matches,
            media: query,
            onchange: null,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
            addListener: vi.fn(),
            removeListener: vi.fn(),
            dispatchEvent: vi.fn(),
        })),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockSignInWithPassword.mockResolvedValue({ error: null });
    mockSignInWithOAuth.mockResolvedValue({ error: null });
    mockResetPasswordForEmail.mockResolvedValue({ error: null });
    stubMatchMedia(false);
    // her testte temiz data-theme
    document.documentElement.removeAttribute("data-theme");
    try {
        window.localStorage.clear();
    } catch {
        /* ignore */
    }
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

describe("LoginPage (Monolith)", () => {
    it("markayı form dışında gösterir, hexagon grafiğini render eder, demo erişimini göstermez", () => {
        const { container } = render(<LoginPage />);
        const brand = container.querySelector(".mono-brand");
        const panel = container.querySelector(".login-panel");

        expect(brand).toBeTruthy();
        expect(panel).toBeTruthy();
        expect(within(brand as HTMLElement).getByText("Roven")).toBeTruthy();
        expect(within(panel as HTMLElement).queryByText("Roven")).toBeNull();
        expect(screen.queryByText(/demo/i)).toBeNull();
        expect(container.querySelector(".monolith-hex")).toBeTruthy();
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

    it("boş alanlarla submit edilince inline doğrulama gösterir ve auth çağırmaz", () => {
        render(<LoginPage />);
        fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

        expect(screen.getByText("E-posta adresi gerekli.")).toBeTruthy();
        expect(screen.getByText("Şifre gerekli.")).toBeTruthy();
        expect(mockSignInWithPassword).not.toHaveBeenCalled();
    });

    it("hatalı kimlik bilgisinde erişilebilir hata mesajı gösterir, yönlendirmez", async () => {
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

    it("EN diline geçince metinleri İngilizce gösterir", () => {
        render(<LoginPage />);
        expect(screen.getByRole("button", { name: "Giriş Yap" })).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "EN" }));

        expect(screen.getByRole("button", { name: "Sign In" })).toBeTruthy();
        expect(screen.getByLabelText("Email")).toBeTruthy();
    });

    it("tema butonu data-theme'i değiştirir", () => {
        render(<LoginPage />);
        const themeBtn = screen.getByRole("button", { name: "Temayı değiştir" });
        const before = document.documentElement.getAttribute("data-theme");

        fireEvent.click(themeBtn);

        const after = document.documentElement.getAttribute("data-theme");
        expect(after).toBeTruthy();
        expect(after).not.toBe(before);
    });

    it("Google butonu Supabase OAuth akışını tetikler", async () => {
        render(<LoginPage />);
        fireEvent.click(screen.getByRole("button", { name: "Google ile devam et" }));

        await waitFor(() => {
            expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1);
            const arg = mockSignInWithOAuth.mock.calls[0][0];
            expect(arg.provider).toBe("google");
            expect(arg.options.redirectTo).toContain("/auth/callback");
        });
    });

    it("Şifremi unuttum dolu e-postada resetPasswordForEmail çağırır ve bildirim gösterir", async () => {
        render(<LoginPage />);
        fireEvent.change(screen.getByLabelText("E-posta"), {
            target: { value: "user@example.com" },
        });
        fireEvent.click(screen.getByRole("button", { name: "Şifremi unuttum" }));

        await waitFor(() => {
            expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
                "user@example.com",
                expect.objectContaining({ redirectTo: expect.stringContaining("/login") }),
            );
        });
        const status = await screen.findByRole("status");
        expect(status.textContent).toMatch(/gönderildi/i);
    });

    it("Şifremi unuttum geçersiz e-postada hata gösterir, reset çağırmaz", () => {
        render(<LoginPage />);
        fireEvent.click(screen.getByRole("button", { name: "Şifremi unuttum" }));

        expect(screen.getByText("Geçerli bir e-posta girin.")).toBeTruthy();
        expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
    });

    it("?error=unauthorized ile gelince 'yetkili değil' mesajı gösterir", async () => {
        const orig = window.location.search;
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, search: "?error=unauthorized" },
        });
        render(<LoginPage />);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/yetkili değil/i);
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, search: orig },
        });
    });

    it("?error=unauthorized&attempted=<email> e-postalı 'ekli değil' mesajı gösterir", async () => {
        const orig = window.location.search;
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, search: "?error=unauthorized&attempted=yeni%40gmail.com" },
        });
        render(<LoginPage />);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain("yeni@gmail.com");
        expect(alert.textContent).toMatch(/ekli değil/i);
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, search: orig },
        });
    });

    it("?error=oauth&reason=pkce yapılandırma mesajı gösterir", async () => {
        const orig = window.location.search;
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, search: "?error=oauth&reason=pkce" },
        });
        render(<LoginPage />);
        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toMatch(/dönüş adresi/i);
        Object.defineProperty(window, "location", {
            configurable: true,
            value: { ...window.location, search: orig },
        });
    });

    it("beni-hatırla işaretsizken girişte roven_remember=0 yazılır (sign-in öncesi)", async () => {
        mockSignInWithPassword.mockResolvedValue({ error: null });
        render(<LoginPage />);

        fireEvent.click(screen.getByRole("checkbox", { name: /beni hatırla/i }));
        fireEvent.change(screen.getByLabelText("E-posta"), { target: { value: "a@b.com" } });
        fireEvent.change(screen.getByLabelText("Şifre"), { target: { value: "secret" } });
        fireEvent.click(screen.getByRole("button", { name: "Giriş Yap" }));

        await waitFor(() => expect(mockSignInWithPassword).toHaveBeenCalled());
        expect(document.cookie).toContain("roven_remember=0");
    });

    it("beni-hatırla işaretliyken (varsayılan) Google akışı roven_remember=1 yazar", async () => {
        mockSignInWithOAuth.mockResolvedValue({ error: null });
        render(<LoginPage />);

        fireEvent.click(screen.getByRole("button", { name: "Google ile devam et" }));

        await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalled());
        expect(document.cookie).toContain("roven_remember=1");
    });
});
