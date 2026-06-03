import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

const mockRequirePermission = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

import { GET } from "@/app/api/import/templates/route";

function req(kind?: string) {
    const url = new URL("http://localhost/api/import/templates");
    if (kind) url.searchParams.set("kind", kind);
    return new NextRequest(url, { method: "GET" });
}

describe("GET /api/import/templates", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequirePermission.mockResolvedValue(null);
    });

    it("desteklenen tüm kind değerleri için okunabilir XLSX döner", async () => {
        for (const kind of ["product", "customer", "vendor", "stock_count", "stock_movement", "vendor_product_relation"]) {
            const res = await GET(req(kind));
            expect(res.status).toBe(200);
            expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
            expect(res.headers.get("Content-Disposition")).toContain(`${kind}-template.xlsx`);

            const workbook = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
            expect(workbook.SheetNames).toContain("Meta");
            const meta = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets.Meta);
            expect(meta).toEqual(expect.arrayContaining([
                expect.objectContaining({ key: "template_kind", value: kind }),
                expect.objectContaining({ key: "template_version", value: expect.stringMatching(/^2026-/) }),
            ]));
        }
    });

    it("yanlış kind için 400 döner", async () => {
        const res = await GET(req("bad-kind"));
        expect(res.status).toBe(400);
        await expect(res.json()).resolves.toMatchObject({ error: expect.stringMatching(/Geçersiz/) });
    });

    it("view_import permission guard çalışır", async () => {
        const forbidden = Response.json({ error: "Forbidden" }, { status: 403 });
        mockRequirePermission.mockResolvedValueOnce(forbidden);
        const res = await GET(req("product"));
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.any(NextRequest), "view_import");
    });
});
