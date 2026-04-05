/**
 * Regression guard: API routes must never return raw credential values.
 *
 * Covers:
 *   - GET /api/parasut/config  — masked identifiers + boolean for secret
 *   - GET /api/settings/api-keys-status — boolean-only response
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Simulate authenticated request (no demo_mode cookie)
vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined }),
}));

import { GET as parasutConfigGET } from "@/app/api/parasut/config/route";
import { GET as apiKeysStatusGET } from "@/app/api/settings/api-keys-status/route";

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
