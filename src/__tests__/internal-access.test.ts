import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Permission } from "@/lib/auth/permissions";

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: async () => ({
        auth: {
            getUser: (...args: unknown[]) => mockGetUser(...args),
        },
    }),
}));

import {
    getInternalAccessContext,
    hasInternalOperatorAccess,
    parseInternalOperatorEmails,
    requireInternalOperator,
} from "@/lib/auth/internal-access";

const originalInternalEmails = process.env.INTERNAL_OPERATOR_EMAILS;
const originalAdminEmails = process.env.ADMIN_EMAILS;

beforeEach(() => {
    process.env.INTERNAL_OPERATOR_EMAILS = "ops@example.com";
    process.env.ADMIN_EMAILS = "";
    mockGetUser.mockReset();
});

afterEach(() => {
    process.env.INTERNAL_OPERATOR_EMAILS = originalInternalEmails;
    process.env.ADMIN_EMAILS = originalAdminEmails;
});

describe("internal operator allowlist", () => {
    it("e-postaları trim, lowercase ve dedupe eder", () => {
        expect(Array.from(parseInternalOperatorEmails(" OPS@example.com,ops@example.com, Other@Example.com ")))
            .toEqual(["ops@example.com", "other@example.com"]);
    });

    it("allowlist eşleşmesini case-insensitive yapar ve view_settings ister", () => {
        const allowed = new Set<Permission>(["view_settings"]);
        const denied = new Set<Permission>(["view_dashboard"]);

        expect(hasInternalOperatorAccess("OPS@EXAMPLE.COM", allowed, "ops@example.com")).toBe(true);
        expect(hasInternalOperatorAccess("ops@example.com", denied, "ops@example.com")).toBe(false);
    });

    it("allowlist boşsa fail-closed çalışır", () => {
        expect(hasInternalOperatorAccess(
            "ops@example.com",
            new Set<Permission>(["view_settings"]),
            "",
        )).toBe(false);
    });
});

describe("internal operator server context and guard", () => {
    it("allowlistteki admini internal operator kabul eder", async () => {
        mockGetUser.mockResolvedValue({
            data: {
                user: {
                    id: "user-1",
                    email: "OPS@example.com",
                    app_metadata: { roles: ["admin"] },
                },
            },
        });

        const access = await getInternalAccessContext();

        expect(access.authenticated).toBe(true);
        expect(access.roles).toEqual(["admin"]);
        expect(access.permissions.has("view_settings")).toBe(true);
        expect(access.internalOperator).toBe(true);
        expect(await requireInternalOperator()).toBeNull();
    });

    it("allowlistte olsa da view_settings olmayan kullanıcıyı reddeder", async () => {
        mockGetUser.mockResolvedValue({
            data: {
                user: {
                    id: "user-1",
                    email: "ops@example.com",
                    app_metadata: { roles: ["viewer"] },
                },
            },
        });

        const response = await requireInternalOperator();

        expect(response?.status).toBe(403);
        expect(await response?.json()).toEqual({ error: "Yetkiniz yok." });
    });

    it("müşteri adminini allowlist dışında olduğu için reddeder", async () => {
        mockGetUser.mockResolvedValue({
            data: {
                user: {
                    id: "customer-admin",
                    email: "customer@example.com",
                    app_metadata: { roles: ["admin"] },
                },
            },
        });

        const response = await requireInternalOperator();

        expect(response?.status).toBe(403);
    });

    it("oturumsuz isteği 401 ile reddeder", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });

        const response = await requireInternalOperator();

        expect(response?.status).toBe(401);
        expect(await response?.json()).toEqual({ error: "Yetkisiz." });
    });
});
