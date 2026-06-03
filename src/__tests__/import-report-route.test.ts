import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as XLSX from "xlsx";

const mockRequirePermission = vi.fn();
const mockDbGetBatch = vi.fn();
const mockDbListDrafts = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...args: unknown[]) => mockRequirePermission(...args),
}));

vi.mock("@/lib/supabase/import", () => ({
    dbGetBatch: (...args: unknown[]) => mockDbGetBatch(...args),
    dbListDrafts: (...args: unknown[]) => mockDbListDrafts(...args),
}));

import { GET } from "@/app/api/import/[batchId]/report/route";

const PARAMS = { params: Promise.resolve({ batchId: "batch-1" }) };

function req(format?: string) {
    const url = new URL("http://localhost/api/import/batch-1/report");
    if (format) url.searchParams.set("format", format);
    return new NextRequest(url, { method: "GET" });
}

function draft(overrides: Record<string, unknown> = {}) {
    return {
        id: "draft-1",
        batch_id: "batch-1",
        entity_type: "product",
        status: "merged",
        matched_entity_id: "p-1",
        confidence: 0.9,
        match_status: "update",
        match_confidence: 0.92,
        sheet_name: "Urunler",
        row_number: 2,
        risk_flags: ["financial:price"],
        row_errors: [],
        field_approvals: { sku: "apply", price: "skip" },
        user_corrections: { name: "Vana" },
        ...overrides,
    };
}

describe("GET /api/import/[batchId]/report", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequirePermission.mockResolvedValue(null);
        mockDbGetBatch.mockResolvedValue({ id: "batch-1", file_name: "urunler.xlsx" });
        mockDbListDrafts.mockResolvedValue([draft()]);
    });

    it("CSV raporu satır durumları ve onaylarıyla döner", async () => {
        const res = await GET(req("csv"), PARAMS);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("text/csv");
        const csv = await res.text();
        expect(csv).toContain("sheet,entity_type,draft_status");
        expect(csv).toContain("Urunler");
        expect(csv).toContain("financial:price");
        expect(csv).toContain("price: skip");
    });

    it("XLSX raporu indirilebilir ve okunabilir", async () => {
        const res = await GET(req("xlsx"), PARAMS);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Disposition")).toContain("urunler-import-report.xlsx");
        const workbook = XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
        expect(workbook.SheetNames).toContain("Import Report");
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(workbook.Sheets["Import Report"]);
        expect(rows[0]).toMatchObject({ sheet: "Urunler", entity_type: "product", match_status: "update" });
    });

    it("geçersiz format 400 döner", async () => {
        const res = await GET(req("pdf"), PARAMS);
        expect(res.status).toBe(400);
    });

    it("batch bulunamazsa 404 döner", async () => {
        mockDbGetBatch.mockResolvedValueOnce(null);
        const res = await GET(req("csv"), PARAMS);
        expect(res.status).toBe(404);
    });
});
