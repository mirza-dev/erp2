// @vitest-environment jsdom
/**
 * Kullanıcılar sayfası — davet modu UI'si (onboarding, 2026-09-16).
 *
 * Üç davranış: (1) e-posta yapılandırılmamışsa davet seçeneği DEVRE DIŞI ve
 * nedeni görünür + Sistem Durumu'na bağlantı (domain-rules §14.1 "sessizlik
 * olmaz"); (2) yapılandırılmışsa davet varsayılan, parola alanı gizli, gönderim
 * `mode:"invite"` ve parolasız; (3) hiç giriş yapmamış kullanıcı satırında
 * "Daveti yeniden gönder" — giriş yapmış olanda yok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false,
    DEMO_BLOCK_TOAST: "demo",
    DEMO_DISABLED_TOOLTIP: "demo",
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { email: "a@pmt.com" } } }) } }),
}));

import UsersPage from "@/app/dashboard/settings/users/page";

const USERS = [
    { id: "u-admin", email: "a@pmt.com", created_at: "2026-01-01", last_sign_in_at: "2026-09-01T00:00:00Z", roles: ["admin"] },
    { id: "u-new", email: "yeni@pmt.com", created_at: "2026-09-16", last_sign_in_at: null, roles: ["sales"] },
];

let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];
function mockFetch(inviteAvailable: boolean) {
    fetchCalls = [];
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
        fetchCalls.push({ url, init });
        if (url === "/api/admin/users" && (!init || !init.method || init.method === "GET")) {
            return { ok: true, status: 200, json: async () => ({ users: USERS, inviteAvailable }) };
        }
        return { ok: true, status: 201, json: async () => ({ id: "x", email: "yeni2@pmt.com", roles: ["viewer"], invited: inviteAvailable }) };
    }) as unknown as typeof fetch;
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

async function openForm() {
    render(<UsersPage />);
    await screen.findByText("yeni@pmt.com");
    fireEvent.click(screen.getByRole("button", { name: /Kullanıcı Ekle/ }));
}

describe("davet modu — e-posta YOK", () => {
    it("davet seçeneği devre dışı, nedeni görünür ve Sistem Durumu'na bağlanır; parola alanı zorunlu", async () => {
        mockFetch(false);
        await openForm();
        const invite = screen.getByRole("radio", { name: /Davet e-postası gönder/ }) as HTMLInputElement;
        expect(invite.disabled).toBe(true);
        const pwd = screen.getByRole("radio", { name: /Parolayı ben belirleyeyim/ }) as HTMLInputElement;
        expect(pwd.checked).toBe(true);
        expect(screen.getByRole("note").textContent).toContain("yapılandırılmamış");
        expect(screen.getByRole("link", { name: /Sistem Durumu/ }).getAttribute("href")).toBe("/dashboard/settings?tab=sistem");
        expect(screen.getByLabelText(/Şifre \(min\./)).toBeTruthy();
        expect(screen.getByRole("button", { name: "Oluştur" })).toBeTruthy();
        // Yeniden-gönder butonu da yok: gönderecek kanal yok.
        expect(screen.queryByRole("button", { name: /Daveti yeniden gönder/ })).toBeNull();
    });
});

describe("davet modu — e-posta VAR", () => {
    it("davet varsayılan; parola alanı gizli; gönderim mode:invite ve parolasız", async () => {
        mockFetch(true);
        await openForm();
        const invite = screen.getByRole("radio", { name: /Davet e-postası gönder/ }) as HTMLInputElement;
        expect(invite.disabled).toBe(false);
        expect(invite.checked).toBe(true);
        expect(screen.queryByLabelText(/Şifre \(min\./)).toBeNull();
        expect(screen.queryByRole("note")).toBeNull();

        fireEvent.change(screen.getByLabelText("E-posta"), { target: { value: "yeni2@pmt.com" } });
        fireEvent.click(screen.getByRole("button", { name: "Davet gönder" }));
        await waitFor(() => expect(fetchCalls.some(c => c.init?.method === "POST")).toBe(true));
        const post = fetchCalls.find(c => c.init?.method === "POST")!;
        const body = JSON.parse(String(post.init!.body));
        expect(body).toEqual({ email: "yeni2@pmt.com", roles: ["viewer"], mode: "invite" });
        expect("password" in body).toBe(false);
    });

    it("parola moduna geçince alan geri gelir ve gönderim parola taşır", async () => {
        mockFetch(true);
        await openForm();
        fireEvent.click(screen.getByRole("radio", { name: /Parolayı ben belirleyeyim/ }));
        const pwdField = screen.getByLabelText(/Şifre \(min\./);
        expect(pwdField).toBeTruthy();
        fireEvent.change(screen.getByLabelText("E-posta"), { target: { value: "p@pmt.com" } });
        fireEvent.change(pwdField, { target: { value: "mavi-liman-77-defter" } });
        fireEvent.click(screen.getByRole("button", { name: "Oluştur" }));
        await waitFor(() => expect(fetchCalls.some(c => c.init?.method === "POST")).toBe(true));
        const body = JSON.parse(String(fetchCalls.find(c => c.init?.method === "POST")!.init!.body));
        expect(body.mode).toBe("password");
        expect(body.password).toBe("mavi-liman-77-defter");
    });

    it("'Daveti yeniden gönder' yalnız hiç giriş yapmamış satırda; tıklayınca [id]/invite POST", async () => {
        mockFetch(true);
        render(<UsersPage />);
        await screen.findByText("yeni@pmt.com");
        const resend = screen.getAllByRole("button", { name: /Daveti yeniden gönder/ });
        expect(resend).toHaveLength(1); // admin giriş yapmış → onda yok
        fireEvent.click(resend[0]);
        await waitFor(() => expect(fetchCalls.some(c => c.url === "/api/admin/users/u-new/invite" && c.init?.method === "POST")).toBe(true));
    });
});
