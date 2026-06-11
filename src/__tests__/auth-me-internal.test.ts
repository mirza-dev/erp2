import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InternalAccessContext } from "@/lib/auth/internal-access";

const mockGetInternalAccessContext = vi.fn();

vi.mock("@/lib/auth/internal-access", () => ({
    getInternalAccessContext: (...args: unknown[]) => mockGetInternalAccessContext(...args),
}));

import { GET } from "@/app/api/auth/me/route";

beforeEach(() => {
    mockGetInternalAccessContext.mockReset();
});

describe("GET /api/auth/me internal operator signal", () => {
    it("server-derived internalOperator durumunu response'a ekler", async () => {
        mockGetInternalAccessContext.mockResolvedValue({
            authenticated: true,
            roles: ["admin"],
            permissions: new Set(["view_settings", "view_dashboard"]),
            internalOperator: true,
        } satisfies InternalAccessContext);

        const response = await GET();
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body).toEqual({
            roles: ["admin"],
            permissions: ["view_settings", "view_dashboard"],
            internalOperator: true,
        });
    });

    it("müşteri kullanıcısında internalOperator false döner", async () => {
        mockGetInternalAccessContext.mockResolvedValue({
            authenticated: true,
            roles: ["admin"],
            permissions: new Set(["view_settings"]),
            internalOperator: false,
        } satisfies InternalAccessContext);

        const response = await GET();
        const body = await response.json();

        expect(body.internalOperator).toBe(false);
    });
});
