/**
 * Ayarlar → Dosyalar (şirket dosya arşivi, mig. 091) — /api/settings/files* route'ları.
 *
 * Sözleşme:
 *  - GET: view_settings; { files, usedBytes, limitBytes } — usedBytes server'da toplanır
 *  - POST: manage_settings; multipart file+display_name+category; uzantı allowlist;
 *    25MB sınırı; uploaded_by = session görünen adı (full_name || email)
 *  - DELETE: manage_settings; soft-delete; bulunamazsa 404
 *  - download: view_settings; imzalı URL; ?download=1 attachment; SVG HER ZAMAN attachment
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const FILE_ID = "00000000-0000-4000-8000-000000000011";

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
    requirePermissionFor: (...a: unknown[]) => mockRequirePermission(...a),
    resolveAuthContext: async () => {
        const { data: { user } } = await mockGetUser();
        return { user: user ?? null, userId: user?.id ?? null, roles: ["admin"], perms: new Set() };
    },
}));

const mockList = vi.fn();
const mockCreate = vi.fn();
const mockSoftDelete = vi.fn();
const mockGet = vi.fn();
const mockSignedUrl = vi.fn();
vi.mock("@/lib/supabase/company-files", () => ({
    dbListCompanyFiles: (...a: unknown[]) => mockList(...a),
    dbCreateCompanyFile: (...a: unknown[]) => mockCreate(...a),
    dbSoftDeleteCompanyFile: (...a: unknown[]) => mockSoftDelete(...a),
    dbGetCompanyFile: (...a: unknown[]) => mockGet(...a),
    dbGetCompanyFileSignedUrl: (...a: unknown[]) => mockSignedUrl(...a),
}));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({ auth: { getUser: () => mockGetUser() } }),
}));

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined, getAll: () => [] }),
}));

import { GET as listGET, POST } from "@/app/api/settings/files/route";
import { DELETE } from "@/app/api/settings/files/[id]/route";
import { GET as downloadGET } from "@/app/api/settings/files/[id]/download/route";

function formReq(fd: FormData): NextRequest {
    return new NextRequest("http://localhost/api/settings/files", { method: "POST", body: fd });
}

function makeFile(name: string, opts?: { size?: number; type?: string }): File {
    const size = opts?.size ?? 64;
    return new File([new Uint8Array(size)], name, { type: opts?.type ?? "application/pdf" });
}

beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockReturnValue(null); // yetkili
    mockGetUser.mockResolvedValue({ data: { user: { email: "ali@pmt.com", user_metadata: { full_name: "Ali Veli" } } } });
    mockCreate.mockResolvedValue({ id: FILE_ID, display_name: "Sözleşme.pdf" });
    mockSoftDelete.mockResolvedValue(true);
});

describe("GET /api/settings/files", () => {
    it("view_settings guard'ı + dosya listesi + usedBytes/limitBytes döner", async () => {
        mockList.mockResolvedValue([
            { id: "a", file_size: 1000 },
            { id: "b", file_size: 2500 },
        ]);
        const res = await listGET(new NextRequest("http://localhost/api/settings/files"));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.files).toHaveLength(2);
        expect(body.usedBytes).toBe(3500);
        expect(body.limitBytes).toBe(5120 * 1024 * 1024);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "view_settings");
    });

    it("guard response dönerse o döner, DB'ye gidilmez", async () => {
        mockRequirePermission.mockReturnValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const res = await listGET(new NextRequest("http://localhost/api/settings/files"));
        expect(res.status).toBe(403);
        expect(mockList).not.toHaveBeenCalled();
    });
});

describe("POST /api/settings/files", () => {
    it("geçerli istek → 201; uzantı dosya adından, uploaded_by full_name snapshot", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("orijinal-ad.PDF"));
        fd.append("display_name", "Bayilik Sözleşmesi");
        fd.append("category", "sozlesme");
        const res = await POST(formReq(fd));
        expect(res.status).toBe(201);
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
            baseName: "Bayilik Sözleşmesi",
            ext: "pdf",
            category: "sozlesme",
            uploadedBy: "Ali Veli",
        }));
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_settings");
    });

    it("full_name yoksa uploaded_by = email", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { email: "ali@pmt.com", user_metadata: {} } } });
        const fd = new FormData();
        fd.append("file", makeFile("x.pdf"));
        fd.append("display_name", "Not");
        fd.append("category", "diger");
        await POST(formReq(fd));
        expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ uploadedBy: "ali@pmt.com" }));
    });

    it("ad boş veya 200+ karakter → 400, servis çağrılmaz", async () => {
        for (const bad of ["   ", "x".repeat(201)]) {
            const fd = new FormData();
            fd.append("file", makeFile("x.pdf"));
            fd.append("display_name", bad);
            fd.append("category", "diger");
            expect((await POST(formReq(fd))).status).toBe(400);
        }
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("geçersiz kategori → 400", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("x.pdf"));
        fd.append("display_name", "Not");
        fd.append("category", "olmayan-kategori");
        expect((await POST(formReq(fd))).status).toBe(400);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("allowlist dışı uzantı (exe) → 400", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("zararli.exe", { type: "application/octet-stream" }));
        fd.append("display_name", "Zararlı");
        fd.append("category", "diger");
        const res = await POST(formReq(fd));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("Desteklenmeyen");
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("25MB üstü → 400", async () => {
        const fd = new FormData();
        fd.append("file", makeFile("buyuk.pdf", { size: 25 * 1024 * 1024 + 1 }));
        fd.append("display_name", "Büyük");
        fd.append("category", "diger");
        const res = await POST(formReq(fd));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toContain("25 MB");
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("RBAC guard response dönerse servis çağrılmaz", async () => {
        mockRequirePermission.mockReturnValue(NextResponse.json({ error: "forbidden" }, { status: 403 }));
        const fd = new FormData();
        fd.append("file", makeFile("x.pdf"));
        fd.append("display_name", "Not");
        fd.append("category", "diger");
        expect((await POST(formReq(fd))).status).toBe(403);
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe("DELETE /api/settings/files/[id]", () => {
    const delReq = () => new NextRequest(`http://localhost/api/settings/files/${FILE_ID}`, { method: "DELETE" });
    const params = { params: Promise.resolve({ id: FILE_ID }) };

    it("soft-delete → 200 ok; manage_settings guard'ı", async () => {
        const res = await DELETE(delReq(), params);
        expect(res.status).toBe(200);
        expect(mockSoftDelete).toHaveBeenCalledWith(FILE_ID);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "manage_settings");
    });

    it("bulunamadı/zaten silinmiş → 404", async () => {
        mockSoftDelete.mockResolvedValue(false);
        expect((await DELETE(delReq(), params)).status).toBe(404);
    });

    it("geçersiz uuid → 400", async () => {
        const res = await DELETE(
            new NextRequest("http://localhost/api/settings/files/abc", { method: "DELETE" }),
            { params: Promise.resolve({ id: "abc" }) },
        );
        expect(res.status).toBe(400);
        expect(mockSoftDelete).not.toHaveBeenCalled();
    });
});

describe("GET /api/settings/files/[id]/download", () => {
    const params = { params: Promise.resolve({ id: FILE_ID }) };
    const req = (qs = "") => new NextRequest(`http://localhost/api/settings/files/${FILE_ID}/download${qs}`);

    beforeEach(() => {
        mockGet.mockResolvedValue({
            id: FILE_ID, file_path: `company/${FILE_ID}.pdf`,
            display_name: "Sözleşme.pdf", mime_type: "application/pdf",
        });
        mockSignedUrl.mockResolvedValue("https://signed.example/url");
    });

    it("inline önizleme: download opsiyonu YOK", async () => {
        const res = await downloadGET(req(), params);
        expect(res.status).toBe(200);
        expect((await res.json()).url).toBe("https://signed.example/url");
        expect(mockSignedUrl).toHaveBeenCalledWith(`company/${FILE_ID}.pdf`, undefined);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "view_settings");
    });

    it("?download=1 → attachment disposition (display_name ile)", async () => {
        await downloadGET(req("?download=1"), params);
        expect(mockSignedUrl).toHaveBeenCalledWith(`company/${FILE_ID}.pdf`, { download: "Sözleşme.pdf" });
    });

    it("SVG her zaman attachment'a zorlanır (inline render stored-XSS — 046 precedent)", async () => {
        mockGet.mockResolvedValue({
            id: FILE_ID, file_path: `company/${FILE_ID}.svg`,
            display_name: "Logo.svg", mime_type: "image/svg+xml",
        });
        await downloadGET(req(), params); // download istenmedi ama SVG
        expect(mockSignedUrl).toHaveBeenCalledWith(`company/${FILE_ID}.svg`, { download: "Logo.svg" });
    });

    it("dosya yoksa 404; imzalı URL üretilemezse 502", async () => {
        mockGet.mockResolvedValue(null);
        expect((await downloadGET(req(), params)).status).toBe(404);

        mockGet.mockResolvedValue({ id: FILE_ID, file_path: "p", display_name: "x.pdf", mime_type: "application/pdf" });
        mockSignedUrl.mockResolvedValue(null);
        expect((await downloadGET(req(), params)).status).toBe(502);
    });
});
