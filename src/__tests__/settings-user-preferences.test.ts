/**
 * Settings — Notification Preferences API tests
 *
 * GET /api/settings/user/preferences — DB satırı yoksa default true döner
 * PATCH /api/settings/user/preferences — upsert + bilinmeyen type filter
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: mockGetUser },
    }),
}));

const mockDbListUserPrefs = vi.fn();
const mockDbUpsertUserPrefs = vi.fn();
vi.mock("@/lib/supabase/user-preferences", () => ({
    dbListUserPrefs: (...a: unknown[]) => mockDbListUserPrefs(...a),
    dbUpsertUserPrefs: (...a: unknown[]) => mockDbUpsertUserPrefs(...a),
}));

import { GET, PATCH } from "@/app/api/settings/user/preferences/route";

beforeEach(() => {
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: { id: "u-1" } } });
});

function makePatchReq(body: unknown): NextRequest {
    return new NextRequest("http://localhost/api/settings/user/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("GET /api/settings/user/preferences", () => {
    it("user yok → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await GET();
        expect(res.status).toBe(401);
    });

    it("auth'lu → dbListUserPrefs sonucu döner", async () => {
        const fakePrefs = [
            { type: "stock_critical", emailEnabled: true, browserEnabled: true },
            { type: "order_pending", emailEnabled: false, browserEnabled: true },
        ];
        mockDbListUserPrefs.mockResolvedValue(fakePrefs);
        const res = await GET();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual(fakePrefs);
        expect(mockDbListUserPrefs).toHaveBeenCalledWith("u-1");
    });
});

describe("PATCH /api/settings/user/preferences", () => {
    it("user yok → 401", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });
        const res = await PATCH(makePatchReq({ prefs: [] }));
        expect(res.status).toBe(401);
    });

    it("prefs dizi değil → 400", async () => {
        const res = await PATCH(makePatchReq({ prefs: "invalid" }));
        expect(res.status).toBe(400);
    });

    it("happy path → upsert çağrılır + güncel liste döner", async () => {
        const inputPrefs = [
            { type: "stock_critical", emailEnabled: false, browserEnabled: true },
            { type: "order_new", emailEnabled: true, browserEnabled: false },
        ];
        mockDbUpsertUserPrefs.mockResolvedValue(undefined);
        mockDbListUserPrefs.mockResolvedValue(inputPrefs);

        const res = await PATCH(makePatchReq({ prefs: inputPrefs }));
        expect(res.status).toBe(200);
        expect(mockDbUpsertUserPrefs).toHaveBeenCalledWith("u-1", inputPrefs);
        const body = await res.json();
        expect(body).toEqual(inputPrefs);
    });

    it("emailEnabled boolean değil → 400", async () => {
        const res = await PATCH(makePatchReq({
            prefs: [
                { type: "order_new", emailEnabled: "yes", browserEnabled: false },
            ],
        }));
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toContain("emailEnabled");
    });

    it("browserEnabled number → 400 (strict boolean kontratı)", async () => {
        const res = await PATCH(makePatchReq({
            prefs: [
                { type: "order_new", emailEnabled: true, browserEnabled: 1 },
            ],
        }));
        expect(res.status).toBe(400);
    });

    it("malformed type değerleri filter (null, boş string, undefined type) — boolean valid", async () => {
        mockDbUpsertUserPrefs.mockResolvedValue(undefined);
        mockDbListUserPrefs.mockResolvedValue([]);

        await PATCH(makePatchReq({
            prefs: [
                { type: "stock_critical", emailEnabled: true, browserEnabled: true },
                null,                                            // null → atlandı
                { type: "", emailEnabled: true, browserEnabled: true },  // boş type → filter
                { emailEnabled: true, browserEnabled: false },           // type yok → filter
            ],
        }));

        expect(mockDbUpsertUserPrefs).toHaveBeenCalledWith("u-1", [
            { type: "stock_critical", emailEnabled: true, browserEnabled: true },
        ]);
    });
});
