/**
 * Regression guard: API routes must never return raw credential values.
 *
 * Covers:
 *   - GET /api/parasut/config  — masked identifiers + boolean for secret
 *   - GET /api/settings/api-keys-status — boolean-only response
 *   - GET /api/settings/company — must not leak parasut_oauth token fields
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Simulate authenticated request (no demo_mode cookie)
vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined }),
}));

import { GET as parasutConfigGET } from "@/app/api/parasut/config/route";
import { GET as apiKeysStatusGET } from "@/app/api/settings/api-keys-status/route";

const mockDbGetCompanySettings = vi.fn();
vi.mock("@/lib/supabase/company-settings", () => ({
    dbGetCompanySettings:    (...args: unknown[]) => mockDbGetCompanySettings(...args),
    dbUpdateCompanySettings: vi.fn(),
}));
vi.mock("next/cache", () => ({
    unstable_cache: (_fn: unknown) => _fn,
    revalidateTag: vi.fn(),
}));

import { GET as companySettingsGET } from "@/app/api/settings/company/route";

const COMPANY_ID = "pmt-endustriyel-9471";
const CLIENT_ID = "cl_k9x2m4nw8qabcdef";
const CLIENT_SECRET = "cs_xK9mW2pQrTv3nLhBfZeYuD";

describe("GET /api/parasut/config — no secret leak", () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        saved.PARASUT_COMPANY_ID = process.env.PARASUT_COMPANY_ID;
        saved.PARASUT_CLIENT_ID = process.env.PARASUT_CLIENT_ID;
        saved.PARASUT_CLIENT_SECRET = process.env.PARASUT_CLIENT_SECRET;
        process.env.PARASUT_COMPANY_ID = COMPANY_ID;
        process.env.PARASUT_CLIENT_ID = CLIENT_ID;
        process.env.PARASUT_CLIENT_SECRET = CLIENT_SECRET;
    });

    afterEach(() => {
        process.env.PARASUT_COMPANY_ID = saved.PARASUT_COMPANY_ID;
        process.env.PARASUT_CLIENT_ID = saved.PARASUT_CLIENT_ID;
        process.env.PARASUT_CLIENT_SECRET = saved.PARASUT_CLIENT_SECRET;
    });

    it("full credential strings are absent from the response body", async () => {
        const res = await parasutConfigGET();
        const body = JSON.stringify(await res.json());
        expect(body).not.toContain(COMPANY_ID);
        expect(body).not.toContain(CLIENT_ID);
        expect(body).not.toContain(CLIENT_SECRET);
    });

    it("clientSecretConfigured is true when env var is set", async () => {
        const res = await parasutConfigGET();
        const data = await res.json();
        expect(data.clientSecretConfigured).toBe(true);
    });

    it("clientSecretConfigured is false when env var is absent", async () => {
        delete process.env.PARASUT_CLIENT_SECRET;
        const res = await parasutConfigGET();
        const data = await res.json();
        expect(data.clientSecretConfigured).toBe(false);
    });

    it("companyId shows only first 4 chars + 8 bullet placeholders", async () => {
        const res = await parasutConfigGET();
        const data = await res.json();
        expect(data.companyId).toBe("pmt-" + "•".repeat(8));
    });

    it("companyId is null when env var is not set", async () => {
        delete process.env.PARASUT_COMPANY_ID;
        const res = await parasutConfigGET();
        const data = await res.json();
        expect(data.companyId).toBeNull();
    });
});

describe("GET /api/settings/api-keys-status — no secret leak", () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        saved.PARASUT_CLIENT_SECRET = process.env.PARASUT_CLIENT_SECRET;
        saved.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
        saved.VERCEL_API_KEY = process.env.VERCEL_API_KEY;
        process.env.PARASUT_CLIENT_SECRET = CLIENT_SECRET;
        process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test";
        process.env.VERCEL_API_KEY = "";
    });

    afterEach(() => {
        process.env.PARASUT_CLIENT_SECRET = saved.PARASUT_CLIENT_SECRET;
        process.env.ANTHROPIC_API_KEY = saved.ANTHROPIC_API_KEY;
        process.env.VERCEL_API_KEY = saved.VERCEL_API_KEY;
    });

    it("response contains no key-like substrings", async () => {
        const res = await apiKeysStatusGET();
        const body = JSON.stringify(await res.json());
        expect(body).not.toMatch(/sk_|cs_|cl_|pmt-|sk-ant/);
    });

    it("returns boolean flags matching env var presence", async () => {
        const res = await apiKeysStatusGET();
        const data = await res.json();
        expect(data.parasut).toBe(true);
        expect(data.claude).toBe(true);
        expect(data.vercel).toBe(false);
    });
});

describe("GET /api/settings/company — no oauth token leak", () => {
    // Mock içine kasıtlı olarak token alanları ekleniyor.
    // Route bu alanları allowlist dışında bırakmalı — sızmalarına izin vermemeli.
    const POISONED_SETTINGS = {
        id: "company-uuid-1",
        name: "PMT Endüstriyel",
        tax_office: "Ankara",
        tax_no: "1234567890",
        address: "Test Cad. No:1",
        phone: "+90 312 000 00 00",
        email: "info@pmt.com",
        website: "https://pmt.com",
        logo_url: null,
        currency: "TRY",
        updated_at: "2026-01-01T00:00:00Z",
        // Token alanları — route bunları dışarı vermemeli:
        access_token:    "tok_super_secret_access",
        refresh_token:   "tok_super_secret_refresh",
        refresh_lock_until: "2099-01-01T00:00:00Z",
        refresh_lock_owner: "owner-uuid",
        singleton_key:   "default",
        token_version:   42,
        parasut_oauth:   { nested: "secret" },
    };

    beforeEach(() => {
        mockDbGetCompanySettings.mockResolvedValue(POISONED_SETTINGS);
    });

    it("strips access_token and refresh_token from response", async () => {
        const res = await companySettingsGET();
        const body = JSON.stringify(await res.json());
        expect(body).not.toContain("access_token");
        expect(body).not.toContain("refresh_token");
        expect(body).not.toContain("tok_super_secret");
    });

    it("strips refresh_lock, singleton_key, token_version, parasut_oauth", async () => {
        const res = await companySettingsGET();
        const body = JSON.stringify(await res.json());
        expect(body).not.toContain("refresh_lock");
        expect(body).not.toContain("singleton_key");
        expect(body).not.toContain("token_version");
        expect(body).not.toContain("parasut_oauth");
    });

    it("still returns the standard company fields correctly", async () => {
        const res = await companySettingsGET();
        const data = await res.json();
        expect(data.name).toBe("PMT Endüstriyel");
        expect(data.tax_no).toBe("1234567890");
        expect(data.currency).toBe("TRY");
        expect(data).not.toHaveProperty("access_token");
        expect(data).not.toHaveProperty("refresh_token");
    });

    it("returns empty object when settings are null", async () => {
        mockDbGetCompanySettings.mockResolvedValue(null);
        const res = await companySettingsGET();
        const data = await res.json();
        expect(data).toEqual({});
    });
});
