/**
 * RBAC R3 (Faz 4 tamamlama) — quotes + purchase-orders GET route'larında
 * end-to-end finansal redaction + quote archive (donmuş PDF) yetki gate'i.
 *
 * Diskriminatif: AYNI mock'lu veri, FARKLI perm setleri → farklı response.
 * - quotes = sales-financial (view_sales_prices), CAMELCASE alanlar (mapper'lı).
 * - purchase-orders = purchase-financial (view_purchase_costs), SNAKE_CASE (raw row).
 * - quote archive = donmuş HTML; seçici redaction yok → view_sales_prices yoksa 403.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { Permission } from "@/lib/auth/permissions";

const mockDbListQuotes = vi.fn();
const mockDbGetQuote = vi.fn();
const mockDbFindOrderByQuoteId = vi.fn();
const mockMapQuoteSummary = vi.fn();
const mockMapQuoteDetail = vi.fn();
const mockDbListPurchaseOrders = vi.fn();
const mockDbGetPurchaseOrderById = vi.fn();
const mockDbGetQuoteArchive = vi.fn();
const mockDbGetArchiveSignedUrl = vi.fn();
const mockDbArchiveObjectExists = vi.fn();
const mockRequirePermission = vi.fn();
const mockGetPerms = vi.fn();

vi.mock("next/cache", () => ({
    unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
    revalidateTag: vi.fn(),
}));
vi.mock("@/lib/supabase/quotes", () => ({
    dbListQuotes:      (...a: unknown[]) => mockDbListQuotes(...a),
    dbGetQuote:        (...a: unknown[]) => mockDbGetQuote(...a),
    dbCreateQuote:     vi.fn(),
    dbUpdateQuote:     vi.fn(),
    dbDeleteQuote:     vi.fn(),
    dbListQuoteChain:  vi.fn(),
}));
vi.mock("@/lib/supabase/orders", () => ({
    dbFindOrderByQuoteId: (...a: unknown[]) => mockDbFindOrderByQuoteId(...a),
}));
vi.mock("@/lib/api-mappers", () => ({
    mapQuoteSummary: (...a: unknown[]) => mockMapQuoteSummary(...a),
    mapQuoteDetail:  (...a: unknown[]) => mockMapQuoteDetail(...a),
}));
vi.mock("@/lib/supabase/purchase-orders", () => ({
    dbListPurchaseOrders:    (...a: unknown[]) => mockDbListPurchaseOrders(...a),
    dbGetPurchaseOrderById:  (...a: unknown[]) => mockDbGetPurchaseOrderById(...a),
    dbCreatePurchaseOrder:   vi.fn(),
    dbPatchPurchaseOrder:    vi.fn(),
    validatePoLines:         vi.fn(),
    isValidPoCurrency:       vi.fn(),
}));
vi.mock("@/lib/supabase/quote-pdf-archives", () => ({
    dbGetQuoteArchive:     (...a: unknown[]) => mockDbGetQuoteArchive(...a),
    dbGetArchiveSignedUrl: (...a: unknown[]) => mockDbGetArchiveSignedUrl(...a),
    dbArchiveObjectExists: (...a: unknown[]) => mockDbArchiveObjectExists(...a),
}));
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission:         (...a: unknown[]) => mockRequirePermission(...a),
    getCurrentUserPermissions: (...a: unknown[]) => mockGetPerms(...a),
}));

import { GET as quotesListGet } from "@/app/api/quotes/route";
import { GET as quoteDetailGet } from "@/app/api/quotes/[id]/route";
import { GET as poListGet } from "@/app/api/purchase-orders/route";
import { GET as poDetailGet } from "@/app/api/purchase-orders/[id]/route";
import { GET as archiveGet } from "@/app/api/quotes/[id]/archive/route";

const P = (...perms: Permission[]) => new Set<Permission>(perms);
const idCtx = (id = "q1") => ({ params: Promise.resolve({ id }) });
const getReq = (url = "http://localhost/api/x") => new NextRequest(url, { method: "GET" });

beforeEach(() => {
    vi.clearAllMocks();
    mockRequirePermission.mockResolvedValue(null); // guard izinli (read-guard testi burada değil)
    // quotes
    mockDbListQuotes.mockResolvedValue([{ id: "q1" }]);
    mockMapQuoteSummary.mockReturnValue({ id: "q1", quoteNumber: "TKL-1", grandTotal: 5000, status: "sent" });
    mockDbGetQuote.mockResolvedValue({ id: "q1", revision_no: 1 });
    mockMapQuoteDetail.mockReturnValue({
        id: "q1", status: "draft", revisionNo: 1, rootQuoteId: null,
        subtotal: 4000, vatTotal: 800, grandTotal: 4800, discountAmount: 200,
        lines: [{ id: "l1", unitPrice: 2000, lineTotal: 4000, quantity: 2, productName: "Vana" }],
    });
    // PO
    mockDbListPurchaseOrders.mockResolvedValue([
        { id: "po1", po_number: "PO-1", subtotal: 1000, vat_total: 200, grand_total: 1200 },
    ]);
    mockDbGetPurchaseOrderById.mockResolvedValue({
        id: "po1", po_number: "PO-1", subtotal: 1000, vat_total: 200, grand_total: 1200,
        lines: [{ id: "l1", unit_price: 500, line_total: 1000, quantity: 2 }],
    });
    // archive
    mockDbGetQuoteArchive.mockResolvedValue({ file_path: "quotes/q1/r1.html" });
    mockDbArchiveObjectExists.mockResolvedValue(true);
    mockDbGetArchiveSignedUrl.mockResolvedValue("https://signed.example/q1");
});

// ── quotes list ────────────────────────────────────────────────────────────────
describe("GET /api/quotes — sales-financial redaction (CAMELCASE)", () => {
    it("sales (view_sales_prices) → grandTotal görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices"));
        const data = await (await quotesListGet(getReq("http://localhost/api/quotes"))).json();
        expect(data[0].grandTotal).toBe(5000);
        expect(data[0].quoteNumber).toBe("TKL-1");
    });
    it("production/viewer (yetki yok) → grandTotal null, quoteNumber korunur", async () => {
        mockGetPerms.mockResolvedValue(P());
        const data = await (await quotesListGet(getReq("http://localhost/api/quotes"))).json();
        expect(data[0].grandTotal).toBeNull();
        expect(data[0].quoteNumber).toBe("TKL-1");
    });
});

// ── quotes detail ───────────────────────────────────────────────────────────────
describe("GET /api/quotes/[id] — sales-financial redaction (CAMELCASE detail)", () => {
    it("sales → tüm finansal alanlar görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices"));
        const data = await (await quoteDetailGet(getReq(), idCtx())).json();
        expect(data.grandTotal).toBe(4800);
        expect(data.lines[0].unitPrice).toBe(2000);
    });
    it("viewer → header + satır fiyatları null, quantity/productName korunur", async () => {
        mockGetPerms.mockResolvedValue(P());
        const data = await (await quoteDetailGet(getReq(), idCtx())).json();
        expect(data.subtotal).toBeNull();
        expect(data.vatTotal).toBeNull();
        expect(data.grandTotal).toBeNull();
        expect(data.discountAmount).toBeNull();
        expect(data.lines[0].unitPrice).toBeNull();
        expect(data.lines[0].lineTotal).toBeNull();
        expect(data.lines[0].quantity).toBe(2);
        expect(data.lines[0].productName).toBe("Vana");
    });
});

// ── PO list + detail ────────────────────────────────────────────────────────────
describe("GET /api/purchase-orders — purchase-financial redaction (SNAKE_CASE)", () => {
    it("purchasing (view_purchase_costs) → maliyet görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_purchase_costs"));
        const data = await (await poListGet(getReq("http://localhost/api/purchase-orders"))).json();
        expect(data[0].grand_total).toBe(1200);
    });
    it("sales (sadece view_sales_prices) → PO maliyeti null (ayrı sınıf)", async () => {
        mockGetPerms.mockResolvedValue(P("view_sales_prices"));
        const data = await (await poListGet(getReq("http://localhost/api/purchase-orders"))).json();
        expect(data[0].subtotal).toBeNull();
        expect(data[0].vat_total).toBeNull();
        expect(data[0].grand_total).toBeNull();
        expect(data[0].po_number).toBe("PO-1");
    });
});

describe("GET /api/purchase-orders/[id] — detail redaction", () => {
    it("purchasing → satır maliyetleri görünür", async () => {
        mockGetPerms.mockResolvedValue(P("view_purchase_costs"));
        const data = await (await poDetailGet(getReq(), idCtx("po1"))).json();
        expect(data.lines[0].unit_price).toBe(500);
    });
    it("viewer → header + satır unit_price/line_total null, quantity korunur", async () => {
        mockGetPerms.mockResolvedValue(P());
        const data = await (await poDetailGet(getReq(), idCtx("po1"))).json();
        expect(data.grand_total).toBeNull();
        expect(data.lines[0].unit_price).toBeNull();
        expect(data.lines[0].line_total).toBeNull();
        expect(data.lines[0].quantity).toBe(2);
    });
});

// ── quote archive gate ──────────────────────────────────────────────────────────
describe("GET /api/quotes/[id]/archive — donmuş PDF view_sales_prices gate", () => {
    it("view_sales_prices yoksa → 403, veri katmanına HİÇ gidilmez", async () => {
        mockRequirePermission.mockResolvedValue(
            NextResponse.json({ error: "forbidden" }, { status: 403 }),
        );
        const res = await archiveGet(getReq(), idCtx());
        expect(res.status).toBe(403);
        expect(mockDbGetQuote).not.toHaveBeenCalled();
        expect(mockDbGetArchiveSignedUrl).not.toHaveBeenCalled();
    });
    it("guard view_sales_prices ile çağrılır + izinliyse signed URL döner", async () => {
        mockRequirePermission.mockResolvedValue(null);
        const res = await archiveGet(getReq(), idCtx());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.url).toBe("https://signed.example/q1");
        // guard doğru permission ile çağrıldı
        expect(mockRequirePermission).toHaveBeenCalledWith(expect.anything(), "view_sales_prices");
    });
});
