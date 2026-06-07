import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

const mockRequirePermission = vi.fn();
const mockGetProductTypeWithFields = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));
vi.mock("@/lib/supabase/product-types", () => ({
    dbGetProductTypeWithFields: (...args: unknown[]) => mockGetProductTypeWithFields(...args),
}));

import { GET } from "@/app/api/import/templates/route";

const TYPE_UUID = "00000000-0000-4000-8000-000000000001";

function req(kind?: string, extra?: Record<string, string>) {
    const url = new URL("http://localhost/api/import/templates");
    if (kind) url.searchParams.set("kind", kind);
    for (const [k, v] of Object.entries(extra ?? {})) url.searchParams.set(k, v);
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

    // ── Faz B — tip-özel şablon ──────────────────────────────────────────────
    it("kind=product_type + geçerli typeId → teknik kolonlu XLSX (Meta'da product_type_id)", async () => {
        mockGetProductTypeWithFields.mockResolvedValueOnce({
            id: TYPE_UUID, name: "Vana", is_active: true,
            fields: [
                { field_key: "dn", field_type: "number", label_tr: "DN", unit: "mm", options: null, required: true },
                { field_key: "pn_class", field_type: "select", label_tr: "PN", unit: null, options: ["PN16", "PN25"], required: false },
            ],
        });
        const res = await GET(req("product_type", { typeId: TYPE_UUID }));
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("spreadsheetml.sheet");
        const wb = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
        expect(wb.SheetNames).toContain("Urunler");
        expect(wb.SheetNames).toContain("Meta");
        // veri sheet'inde teknik kolon başlıkları var
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Urunler, { header: 1 });
        const headerRow = (XLSX.utils.sheet_to_json(wb.Sheets.Urunler, { header: 1 })[0] ?? []) as string[];
        expect(headerRow).toContain("dn");
        expect(headerRow).toContain("pn_class");
        expect(headerRow).toContain("urun_tipi");
        void rows;
        const meta = XLSX.utils.sheet_to_json<Record<string, string>>(wb.Sheets.Meta);
        expect(meta).toEqual(expect.arrayContaining([
            expect.objectContaining({ key: "product_type_id", value: TYPE_UUID }),
            expect.objectContaining({ key: "product_type_name", value: "Vana" }),
        ]));
    });

    it("kind=product_type + geçersiz typeId → 400", async () => {
        const res = await GET(req("product_type", { typeId: "not-a-uuid" }));
        expect(res.status).toBe(400);
        expect(mockGetProductTypeWithFields).not.toHaveBeenCalled();
    });

    it("kind=product_type + bulunmayan tip → 404", async () => {
        mockGetProductTypeWithFields.mockResolvedValueOnce(null);
        const res = await GET(req("product_type", { typeId: TYPE_UUID }));
        expect(res.status).toBe(404);
    });
});
