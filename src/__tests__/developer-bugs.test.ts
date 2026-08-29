/**
 * Developer Console §11 — bug takibi.
 *
 * Ayrımın kendisi test ediliyor: **error** sistemin ürettiği teknik olaydır,
 * **bug** geliştiricinin takip ettiği problemdir. İkisi ayrı tablodur ve
 * aralarındaki bağ iki yönlü kurulabilmelidir (hata detayından "Bug Oluştur",
 * bug kaydından "bağlı hatalar").
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockResolveAuthContext = vi.fn();
vi.mock("@/lib/auth/role-guard", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/auth/role-guard")>();
    return { ...actual, resolveAuthContext: () => mockResolveAuthContext() };
});

const mockListBugs = vi.fn();
const mockGetBug = vi.fn();
const mockCreateBug = vi.fn();
const mockUpdateBug = vi.fn();
const mockLinkErrors = vi.fn();
const mockUnlinkError = vi.fn();

vi.mock("@/lib/supabase/developer-bugs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/supabase/developer-bugs")>();
    return {
        ...actual,
        dbListBugs: (...a: unknown[]) => mockListBugs(...a),
        dbGetBug: (...a: unknown[]) => mockGetBug(...a),
        dbCreateBug: (...a: unknown[]) => mockCreateBug(...a),
        dbUpdateBug: (...a: unknown[]) => mockUpdateBug(...a),
        dbLinkBugErrors: (...a: unknown[]) => mockLinkErrors(...a),
        dbUnlinkBugError: (...a: unknown[]) => mockUnlinkError(...a),
    };
});

import { permissionsForRoles } from "@/lib/auth/permissions";
import {
    BUG_PRIORITIES,
    BUG_PRIORITY_LABELS,
    BUG_STATUSES,
    BUG_STATUS_LABELS,
    isBugPriority,
    isBugStatus,
} from "@/lib/telemetry/console-types";
import { GET as listGET, POST as listPOST } from "@/app/api/developer/bugs/route";
import { GET as idGET, PATCH as idPATCH } from "@/app/api/developer/bugs/[id]/route";
import type { NextRequest } from "next/server";

const DEV_EMAIL = "gelistirici@firma.com";
const ORIGINAL_ALLOWLIST = process.env.INTERNAL_OPERATOR_EMAILS;
const BUG_ID = "3f2a1b4c-5d6e-4f70-8a9b-0c1d2e3f4a5b";
const GROUP_ID = "9b1e2c3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

const BUG = {
    id: BUG_ID,
    title: "Teklif kabul akışı 500 veriyor",
    description: null,
    status: "open" as const,
    priority: "high" as const,
    developer_notes: null,
    created_by: "u1",
    assigned_to: null,
    created_at: "2026-08-30T10:00:00Z",
    updated_at: "2026-08-30T10:00:00Z",
    closed_at: null,
    relatedErrors: [],
};

function jsonReq(body: unknown, method = "POST", url = "http://localhost/api/developer/bugs"): NextRequest {
    const request = new Request(url, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    Object.defineProperty(request, "nextUrl", { value: new URL(url) });
    return request as unknown as NextRequest;
}

function getReq(url = "http://localhost/api/developer/bugs"): NextRequest {
    const request = new Request(url);
    Object.defineProperty(request, "nextUrl", { value: new URL(url) });
    return request as unknown as NextRequest;
}

const params = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
    for (const m of [mockListBugs, mockGetBug, mockCreateBug, mockUpdateBug, mockLinkErrors, mockUnlinkError]) {
        m.mockReset();
    }
    mockListBugs.mockResolvedValue([BUG]);
    mockGetBug.mockResolvedValue(BUG);
    mockCreateBug.mockResolvedValue(BUG);
    mockUpdateBug.mockResolvedValue(BUG);
    mockLinkErrors.mockResolvedValue(undefined);
    mockUnlinkError.mockResolvedValue(undefined);

    process.env.INTERNAL_OPERATOR_EMAILS = DEV_EMAIL;
    mockResolveAuthContext.mockResolvedValue({
        user: { id: "u1", email: DEV_EMAIL, app_metadata: { roles: ["admin"] } },
        userId: "u1",
        roles: ["admin"],
        perms: permissionsForRoles(["admin"]),
    });
});

afterEach(() => {
    if (ORIGINAL_ALLOWLIST === undefined) delete process.env.INTERNAL_OPERATOR_EMAILS;
    else process.env.INTERNAL_OPERATOR_EMAILS = ORIGINAL_ALLOWLIST;
});

describe("sabitler — şartnamedeki durum ve öncelik kümeleri", () => {
    it("altı durum desteklenir", () => {
        expect(BUG_STATUSES).toEqual(
            ["open", "investigating", "in_progress", "fixed", "closed", "ignored"],
        );
        for (const s of BUG_STATUSES) expect(BUG_STATUS_LABELS[s]).toBeTruthy();
    });

    it("dört öncelik desteklenir", () => {
        expect(BUG_PRIORITIES).toEqual(["low", "medium", "high", "critical"]);
        for (const p of BUG_PRIORITIES) expect(BUG_PRIORITY_LABELS[p]).toBeTruthy();
    });

    it("allowlist doğrulayıcıları uydurma değeri reddeder", () => {
        expect(isBugStatus("open")).toBe(true);
        expect(isBugStatus("yeni")).toBe(false);
        expect(isBugPriority("critical")).toBe(true);
        expect(isBugPriority("acil")).toBe(false);
    });
});

describe("POST /api/developer/bugs — oluşturma", () => {
    it("bug oluşturulur ve 201 döner", async () => {
        const res = await listPOST(jsonReq({ title: "Yeni bug", priority: "high" }));
        expect(res.status).toBe(201);
        expect(mockCreateBug).toHaveBeenCalledTimes(1);
        expect(mockCreateBug.mock.calls[0][0]).toMatchObject({
            title: "Yeni bug", priority: "high", status: "open", createdBy: "u1",
        });
    });

    it("hata grubu ile İLİŞKİLENDİRİLEBİLİR (hata detayındaki 'Bug Oluştur')", async () => {
        await listPOST(jsonReq({ title: "Bağlı bug", errorGroupIds: [GROUP_ID] }));
        expect(mockCreateBug.mock.calls[0][0].errorGroupIds).toEqual([GROUP_ID]);
    });

    it("başlık zorunlu", async () => {
        expect((await listPOST(jsonReq({}))).status).toBe(400);
        expect((await listPOST(jsonReq({ title: "   " }))).status).toBe(400);
        expect(mockCreateBug).not.toHaveBeenCalled();
    });

    it("aşırı uzun başlık/metin reddedilir", async () => {
        expect((await listPOST(jsonReq({ title: "x".repeat(201) }))).status).toBe(400);
        expect((await listPOST(jsonReq({
            title: "ok", description: "y".repeat(8_001),
        }))).status).toBe(400);
    });

    it("geçersiz hata grubu kimliği reddedilir — uydurma id DB'ye gitmez", async () => {
        const res = await listPOST(jsonReq({ title: "ok", errorGroupIds: ["'; drop table --"] }));
        expect(res.status).toBe(400);
        expect(mockCreateBug).not.toHaveBeenCalled();
    });

    it("geçersiz öncelik/durum sessizce varsayılana düşer (istek kırılmaz)", async () => {
        await listPOST(jsonReq({ title: "ok", priority: "acil", status: "yeni" }));
        expect(mockCreateBug.mock.calls[0][0]).toMatchObject({ priority: "medium", status: "open" });
    });

    it("bozuk JSON 400", async () => {
        const bad = new Request("http://localhost/api/developer/bugs", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{bozuk",
        });
        Object.defineProperty(bad, "nextUrl", { value: new URL("http://localhost/api/developer/bugs") });
        expect((await listPOST(bad as unknown as NextRequest)).status).toBe(400);
    });
});

describe("GET /api/developer/bugs — listeleme ve filtre", () => {
    it("liste döner", async () => {
        const res = await listGET(getReq());
        expect(res.status).toBe(200);
        expect(await res.json()).toHaveLength(1);
    });

    it("durum ve öncelik filtreleri geçirilir", async () => {
        await listGET(getReq("http://localhost/api/developer/bugs?status=fixed&priority=critical"));
        expect(mockListBugs.mock.calls[0][0]).toMatchObject({ status: "fixed", priority: "critical" });
    });

    it("tanınmayan filtre değeri null'a düşer — ham girdi sorguya gitmez", async () => {
        await listGET(getReq("http://localhost/api/developer/bugs?status=uydurma&priority=acil"));
        expect(mockListBugs.mock.calls[0][0]).toMatchObject({ status: null, priority: null });
    });
});

describe("PATCH /api/developer/bugs/[id] — durum değişimi", () => {
    it("durum güncellenir", async () => {
        const res = await idPATCH(
            jsonReq({ status: "in_progress" }, "PATCH", `http://localhost/api/developer/bugs/${BUG_ID}`),
            params(BUG_ID),
        );
        expect(res.status).toBe(200);
        expect(mockUpdateBug).toHaveBeenCalledWith(BUG_ID, { status: "in_progress" });
    });

    it("altı durumun HEPSİ kabul edilir", async () => {
        for (const status of BUG_STATUSES) {
            mockUpdateBug.mockClear();
            const res = await idPATCH(
                jsonReq({ status }, "PATCH", `http://localhost/api/developer/bugs/${BUG_ID}`),
                params(BUG_ID),
            );
            expect(res.status, `${status} reddedildi`).toBe(200);
        }
    });

    it("geçersiz durum 400 — DB'ye ulaşmaz", async () => {
        const res = await idPATCH(
            jsonReq({ status: "havada" }, "PATCH", `http://localhost/api/developer/bugs/${BUG_ID}`),
            params(BUG_ID),
        );
        expect(res.status).toBe(400);
        expect(mockUpdateBug).not.toHaveBeenCalled();
    });

    it("hata bağı eklenir ve kaldırılır", async () => {
        await idPATCH(
            jsonReq(
                { linkErrorGroupIds: [GROUP_ID], unlinkErrorGroupId: GROUP_ID },
                "PATCH", `http://localhost/api/developer/bugs/${BUG_ID}`,
            ),
            params(BUG_ID),
        );
        expect(mockLinkErrors).toHaveBeenCalledWith(BUG_ID, [GROUP_ID]);
        expect(mockUnlinkError).toHaveBeenCalledWith(BUG_ID, GROUP_ID);
    });

    it("geçersiz uuid 400 — route parametresi sorguya gitmeden doğrulanır", async () => {
        const res = await idPATCH(
            jsonReq({ status: "open" }, "PATCH", "http://localhost/api/developer/bugs/abc"),
            params("abc"),
        );
        expect(res.status).toBe(400);
        expect(mockUpdateBug).not.toHaveBeenCalled();
    });

    it("bulunamayan bug 404", async () => {
        mockUpdateBug.mockResolvedValue(null);
        const res = await idPATCH(
            jsonReq({ status: "open" }, "PATCH", `http://localhost/api/developer/bugs/${BUG_ID}`),
            params(BUG_ID),
        );
        expect(res.status).toBe(404);
    });
});

describe("GET /api/developer/bugs/[id] — detay", () => {
    it("bağlı hatalarla döner", async () => {
        mockGetBug.mockResolvedValue({ ...BUG, relatedErrors: [{ id: GROUP_ID, title: "X" }] });
        const res = await idGET(getReq(), params(BUG_ID));
        expect(res.status).toBe(200);
        expect((await res.json()).relatedErrors).toHaveLength(1);
    });

    it("bulunamayan bug 404", async () => {
        mockGetBug.mockResolvedValue(null);
        expect((await idGET(getReq(), params(BUG_ID))).status).toBe(404);
    });
});

describe("yetki — bug uçları da internalOperator ister", () => {
    it("allowlist dışındaki admin 403", async () => {
        mockResolveAuthContext.mockResolvedValue({
            user: { id: "u2", email: "baska@firma.com", app_metadata: { roles: ["admin"] } },
            userId: "u2", roles: ["admin"], perms: permissionsForRoles(["admin"]),
        });
        expect((await listGET(getReq())).status).toBe(403);
        expect((await listPOST(jsonReq({ title: "x" }))).status).toBe(403);
        expect((await idPATCH(
            jsonReq({ status: "open" }, "PATCH", `http://localhost/api/developer/bugs/${BUG_ID}`),
            params(BUG_ID),
        )).status).toBe(403);
        expect(mockCreateBug).not.toHaveBeenCalled();
        expect(mockUpdateBug).not.toHaveBeenCalled();
    });
});
