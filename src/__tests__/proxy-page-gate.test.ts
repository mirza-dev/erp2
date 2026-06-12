/**
 * RBAC Faz 2 — proxy.ts page-gate davranış testleri.
 *
 * Gerçek proxy() koşumu (getUser mock'lu). Güvenlik enforcement burada —
 * Sidebar filtre yalnız UX. Manuel URL girişi → /dashboard?forbidden redirect.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const mockGetUser = vi.fn();
vi.mock("@supabase/ssr", () => ({
    createServerClient: () => ({ auth: { getUser: mockGetUser } }),
}));

import { middleware } from "../proxy";

function req(pathname: string, cookie?: string): NextRequest {
    return new NextRequest(`http://localhost${pathname}`, cookie ? { headers: { cookie } } : undefined);
}
function authWithRoles(roles: string[]) {
    return { data: { user: { id: "u1", email: "x@pmt.com", app_metadata: { roles }, user_metadata: {} } } };
}

const originalInternalOperators = process.env.INTERNAL_OPERATOR_EMAILS;

beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.INTERNAL_OPERATOR_EMAILS;
});
afterEach(() => {
    if (originalInternalOperators === undefined) delete process.env.INTERNAL_OPERATOR_EMAILS;
    else process.env.INTERNAL_OPERATOR_EMAILS = originalInternalOperators;
});

describe("page-gate — authenticated", () => {
    it("admin → korumalı sayfa (parasut) 200", async () => {
        mockGetUser.mockResolvedValue(authWithRoles(["admin"]));
        const res = await middleware(req("/dashboard/parasut"));
        expect(res.status).toBe(200);
    });

    it("sales → /dashboard/quotes 200, /dashboard/parasut redirect+forbidden", async () => {
        mockGetUser.mockResolvedValue(authWithRoles(["sales"]));
        const ok = await middleware(req("/dashboard/quotes"));
        expect(ok.status).toBe(200);

        const blocked = await middleware(req("/dashboard/parasut"));
        expect(blocked.status).toBeGreaterThanOrEqual(300);
        expect(blocked.status).toBeLessThan(400);
        const loc = blocked.headers.get("location") ?? "";
        expect(loc).toContain("/dashboard");
        expect(loc).toContain("forbidden=");
        expect(decodeURIComponent(loc)).toContain("/dashboard/parasut");
    });

    it("provize viewer → /dashboard ve kişisel settings 200, yönetim alt sayfası forbidden", async () => {
        // Admin-created viewer (app_metadata.roles=['viewer']) — page-gate davranışı.
        mockGetUser.mockResolvedValue(authWithRoles(["viewer"]));
        expect((await middleware(req("/dashboard"))).status).toBe(200);
        expect((await middleware(req("/dashboard/settings"))).status).toBe(200);

        const blocked = await middleware(req("/dashboard/settings/users"));
        expect(blocked.status).toBeGreaterThanOrEqual(300);
        expect(blocked.status).toBeLessThan(400);
        expect(blocked.headers.get("location")).toContain("forbidden=");
    });

    it("provize EDİLMEMİŞ (rolsüz, self-signup) authd kullanıcı → /login?error=unauthorized", async () => {
        // app_metadata.roles HİÇ yok → davetiye kilidi reddeder (page-gate'e ulaşmaz).
        mockGetUser.mockResolvedValue({ data: { user: { id: "u2", email: "random@gmail.com", app_metadata: {}, user_metadata: {} } } });
        const res = await middleware(req("/dashboard"));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        const loc = res.headers.get("location") ?? "";
        expect(loc).toContain("/login");
        expect(loc).toContain("error=unauthorized");
    });

    it("/dashboard exact her role'de erişilir (redirect loop yok)", async () => {
        mockGetUser.mockResolvedValue(authWithRoles(["production"]));
        expect((await middleware(req("/dashboard"))).status).toBe(200);
    });

    it("çoklu rol union — sales+purchasing hem quotes hem vendors görür", async () => {
        mockGetUser.mockResolvedValue(authWithRoles(["sales", "purchasing"]));
        expect((await middleware(req("/dashboard/quotes"))).status).toBe(200);
        expect((await middleware(req("/dashboard/vendors"))).status).toBe(200);
        const blocked = await middleware(req("/dashboard/parasut"));
        expect(blocked.status).toBeGreaterThanOrEqual(300);
        expect(blocked.status).toBeLessThan(400);
    });

    it("e-posta teslimatları sayfası admin rolüyle değil yalnız internal allowlist ile açılır", async () => {
        mockGetUser.mockResolvedValue(authWithRoles(["admin"]));
        process.env.INTERNAL_OPERATOR_EMAILS = "operator@pmt.com";
        const blocked = await middleware(req("/dashboard/settings/email-deliveries"));
        expect(blocked.status).toBeGreaterThanOrEqual(300);
        expect(blocked.status).toBeLessThan(400);
        expect(decodeURIComponent(blocked.headers.get("location") ?? ""))
            .toContain("/dashboard/settings/email-deliveries");

        process.env.INTERNAL_OPERATOR_EMAILS = " X@PMT.COM ";
        expect((await middleware(req("/dashboard/settings/email-deliveries"))).status).toBe(200);
    });
});

describe("page-gate — demo (viewer muamelesi)", () => {
    beforeEach(() => mockGetUser.mockResolvedValue({ data: { user: null } }));

    it("demo → /dashboard/quotes 200 (viewer okuma)", async () => {
        const res = await middleware(req("/dashboard/quotes", "demo_mode=1"));
        expect(res.status).toBe(200);
    });

    it("demo → /dashboard/settings 200 (kişisel ayarlar viewer'a açık)", async () => {
        const res = await middleware(req("/dashboard/settings", "demo_mode=1"));
        expect(res.status).toBe(200);
    });

    it("demo → /dashboard/settings/users redirect+forbidden (yönetim alt sayfası kapalı)", async () => {
        const res = await middleware(req("/dashboard/settings/users", "demo_mode=1"));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
        expect(res.headers.get("location")).toContain("forbidden=");
    });

    it("demo → /dashboard/parasut redirect (viewer'a kapalı)", async () => {
        const res = await middleware(req("/dashboard/parasut", "demo_mode=1"));
        expect(res.status).toBeGreaterThanOrEqual(300);
        expect(res.status).toBeLessThan(400);
    });
});
