/**
 * POST /api/quotes/preview-pdf — Önizle/Yazdır, e-postadaki ile BİREBİR aynı
 * react-pdf belgesini üretir (not sayfalar arası gerçek bölünür). Salt-önizleme.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mockRender = vi.fn();
vi.mock("@/lib/quote-pdf", () => ({
    renderQuotePdfBuffer: (...a: unknown[]) => mockRender(...a),
    quotePdfFilename: (no: string) => `Teklif-${no || "Belge"}.pdf`,
}));

const mockRequirePermission = vi.fn();
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
}));

import { POST } from "@/app/api/quotes/preview-pdf/route";

function makeReq(body: unknown) {
    return new NextRequest("http://localhost/api/quotes/preview-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
}

const baseData = (over: Record<string, unknown> = {}) => ({
    quoteNo: "TKL-2026-001", currency: "USD", vatRate: 20,
    rows: [{ code: "K1", lead: "", desc: "Vana", qty: "1", price: "100", hs: "", kg: "", size: "", note: "kısa not" }],
    subtotal: 100, discountAmount: 0, vatTotal: 20, grandTotal: 120, totalKg: 0,
    notes: "", deliveryMethod: "", paymentMethod: "", signatures: [], status: "draft",
    sellerName: "PMT", sellerTel: "", sellerEmail: "", sellerAddr: "", sellerTaxId: "",
    sellerWeb: "", logoSrc: null, custCompany: "X", custContact: "", custPhone: "",
    custEmail: "", custAddress: "", quoteDate: "2026-06-16", validUntil: "", salesRep: "",
    salesPhone: "", salesEmail: "",
    ...over,
});

beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(null);          // yetki var
    mockRender.mockResolvedValue(Buffer.from("%PDF-1.7 fake"));
});

describe("POST /api/quotes/preview-pdf", () => {
    it("geçerli QuoteData → 200 + application/pdf (render edilir)", async () => {
        const res = await POST(makeReq(baseData()));
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toBe("application/pdf");
        expect(res.headers.get("Content-Disposition")).toContain("Teklif-TKL-2026-001.pdf");
        expect(mockRender).toHaveBeenCalledTimes(1);
    });

    it("RBAC: view_quotes yoksa → 403, render çağrılmaz", async () => {
        mockRequirePermission.mockResolvedValue(NextResponse.json({ error: "Yetkiniz yok." }, { status: 403 }));
        const res = await POST(makeReq(baseData()));
        expect(res.status).toBe(403);
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "view_quotes");
        expect(mockRender).not.toHaveBeenCalled();
    });

    it("satır notu 800 karakteri aşarsa → 422, render çağrılmaz", async () => {
        const data = baseData({ rows: [{ code: "K1", desc: "x", qty: "1", price: "1", note: "a".repeat(801), lead: "", hs: "", kg: "", size: "" }] });
        const res = await POST(makeReq(data));
        expect(res.status).toBe(422);
        expect(mockRender).not.toHaveBeenCalled();
    });

    it("bozuk JSON → 400", async () => {
        const req = new NextRequest("http://localhost/api/quotes/preview-pdf", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{bozuk",
        });
        const res = await POST(req);
        expect(res.status).toBe(400);
        expect(mockRender).not.toHaveBeenCalled();
    });
});

// ── Önizleme sayfası source-lock ────────────────────────────────────────────
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("Önizleme sayfası — Yazdır/PDF react-pdf'e bağlı + fallback", () => {
    const SRC = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/preview/page.tsx"), "utf8");
    it("'Yazdır/PDF' /api/quotes/preview-pdf POST eder", () => {
        expect(SRC).toMatch(/fetch\("\/api\/quotes\/preview-pdf"/);
        expect(SRC).toMatch(/onClick=\{handlePrintPdf\}/);
    });
    it("blob yeni sekmede açılır (senkron window.open + URL ataması)", () => {
        expect(SRC).toMatch(/window\.open\(""/);
        expect(SRC).toMatch(/URL\.createObjectURL\(blob\)/);
    });
    it("demo/hata → window.print() fallback", () => {
        expect(SRC).toMatch(/catch[\s\S]{0,240}window\.print\(\)/);
    });
});
