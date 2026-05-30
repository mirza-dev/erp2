/**
 * Faz 6 (V7) — serviceAcceptQuoteToOrder.
 * status guard, valid_until, arşiv recover/generate (V7-A5), RPC hata kodu → HTTP.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDbGetQuote          = vi.fn();
const mockDbAccept            = vi.fn();
const mockDbGetArchive        = vi.fn();
const mockDbCreateArchive     = vi.fn();
const mockDbObjectStatus      = vi.fn();
const mockDbDeleteArchive     = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbGetQuote:                 (...a: unknown[]) => mockDbGetQuote(...a),
    dbAcceptQuoteAndCreateOrder:(...a: unknown[]) => mockDbAccept(...a),
    dbUpdateQuoteStatus:        vi.fn(),
    dbListExpiredQuotes:        vi.fn(),
    dbCreateQuoteRevision:      vi.fn(),
}));

// serviceArchiveQuotePdf aynı modülde — DB deps'ini mock'la (var olan arşiv → no-op).
vi.mock("@/lib/supabase/quote-pdf-archives", () => ({
    dbGetQuoteArchive:    (...a: unknown[]) => mockDbGetArchive(...a),
    dbCreateQuoteArchive: (...a: unknown[]) => mockDbCreateArchive(...a),
    dbArchiveObjectStatus:(...a: unknown[]) => mockDbObjectStatus(...a),
    dbDeleteQuoteArchive: (...a: unknown[]) => mockDbDeleteArchive(...a),
}));
vi.mock("@/lib/supabase/products", () => ({ dbGetProductById: vi.fn() }));
vi.mock("@/lib/supabase/customers", () => ({ dbGetCustomerById: vi.fn() }));
vi.mock("@/lib/supabase/orders", () => ({ dbFindOrderByQuoteId: vi.fn() }));
vi.mock("@/lib/supabase/company-settings", () => ({ dbGetCompanySettings: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/services/order-service", () => ({ serviceCreateOrder: vi.fn() }));
vi.mock("@/lib/quote-archive-html", () => ({
    buildQuoteDataFromDetail: vi.fn(() => ({})),
    renderQuoteArchiveHtml:   vi.fn(async () => "<html></html>"),
}));

import { serviceAcceptQuoteToOrder } from "@/lib/services/quote-service";

const QID = "00000000-0000-4000-8000-000000000001";

const stub = (status: string, extra: Record<string, unknown> = {}) => ({
    id: QID, quote_number: "TKL-2026-001", status,
    customer_name: "Acme", currency: "USD", valid_until: null,
    revision_no: 1, lines: [], ...extra,
});

beforeEach(() => {
    vi.clearAllMocks();
    // Varsayılan: arşiv mevcut + obje present (recover no-op) + RPC başarılı.
    mockDbGetArchive.mockResolvedValue({ id: "arch-1", file_path: "x/r1.html" });
    mockDbObjectStatus.mockResolvedValue("present");
    mockDbAccept.mockResolvedValue({ order_id: "ord-1", order_number: "SIP-2026-001", already: false });
});

describe("serviceAcceptQuoteToOrder — status guard", () => {
    it("teklif yok → notFound", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(false);
        expect(r.notFound).toBe(true);
        expect(mockDbAccept).not.toHaveBeenCalled();
    });

    it.each(["draft", "rejected", "expired", "revised"])("%s → invalidStatus (RPC çağrılmaz)", async (st) => {
        mockDbGetQuote.mockResolvedValue(stub(st));
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(false);
        expect(r.invalidStatus).toBe(true);
        expect(mockDbAccept).not.toHaveBeenCalled();
    });

    it("sent → başarılı accept + sipariş", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(true);
        expect(r.orderId).toBe("ord-1");
        expect(r.orderNumber).toBe("SIP-2026-001");
        expect(r.already).toBe(false);
    });

    it("accepted + mevcut sipariş → already:true (RPC idempotent)", async () => {
        mockDbGetQuote.mockResolvedValue(stub("accepted"));
        mockDbAccept.mockResolvedValue({ order_id: "ord-1", order_number: "SIP-2026-001", already: true });
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(true);
        expect(r.already).toBe(true);
    });
});

describe("serviceAcceptQuoteToOrder — valid_until", () => {
    it("geçmiş valid_until → expired (RPC çağrılmaz)", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent", { valid_until: "2020-01-01" }));
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(false);
        expect(r.expired).toBe(true);
        expect(mockDbAccept).not.toHaveBeenCalled();
    });

    it("gelecek valid_until → geçer", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent", { valid_until: "2099-01-01" }));
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(true);
    });
});

describe("serviceAcceptQuoteToOrder — arşiv recover/generate (V7-A5)", () => {
    it("arşiv yok → serviceArchiveQuotePdf üretir, sonra accept başarılı", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbGetArchive.mockResolvedValueOnce(null);   // recover lookup
        mockDbCreateArchive.mockResolvedValueOnce({ id: "arch-new" });
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(mockDbCreateArchive).toHaveBeenCalled();
        expect(r.success).toBe(true);
    });

    it("arşiv üretimi throw → archiveFailed (RPC çağrılmaz)", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbGetArchive.mockResolvedValue(null);       // hiç arşiv yok
        mockDbCreateArchive.mockRejectedValue(new Error("storage down"));
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(false);
        expect(r.archiveFailed).toBe(true);
        expect(mockDbAccept).not.toHaveBeenCalled();
    });

    // Bulgu #1 (P2): DB arşiv satırı VAR ama storage objesi KESİN yok ("missing").
    // Accept, stale satırı silip yeniden üretmeden sipariş açmamalı.
    it("phantom (obje status=missing) → stale sil + yeniden üret, sonra accept", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbGetArchive.mockResolvedValue({ id: "stale-1", file_path: "x/r1.html" });
        mockDbObjectStatus.mockResolvedValue("missing");   // KESİN yok
        mockDbDeleteArchive.mockResolvedValue(undefined);
        mockDbCreateArchive.mockResolvedValue({ id: "arch-new" });
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(mockDbDeleteArchive).toHaveBeenCalledWith("stale-1", "x/r1.html");
        expect(mockDbCreateArchive).toHaveBeenCalled();  // yeniden üretildi
        expect(r.success).toBe(true);
        expect(mockDbAccept).toHaveBeenCalled();
    });

    // Bulgu #2 (advisor): obje status=unknown (geçici .list() hatası) → İKİ kural:
    // (a) SAĞLAM arşivi YIKMA (sil/üret YOK — fail-safe), (b) BAŞARI DÖNME — accept
    // fail-closed → archiveFailed (502, retryable). RPC çağrılmaz.
    it("storage belirsiz (status=unknown) → arşiv KORUNUR + accept fail-closed (502)", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbGetArchive.mockResolvedValue({ id: "ok-1", file_path: "x/r1.html" });
        mockDbObjectStatus.mockResolvedValue("unknown");   // list hatası
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(mockDbDeleteArchive).not.toHaveBeenCalled();   // yıkma yok
        expect(mockDbCreateArchive).not.toHaveBeenCalled();   // üret yok
        expect(r.success).toBe(false);
        expect(r.archiveFailed).toBe(true);                   // 502 fail-closed
        expect(mockDbAccept).not.toHaveBeenCalled();
    });

    it("obje status=present → idempotent existing, accept başarılı", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbGetArchive.mockResolvedValue({ id: "ok-1", file_path: "x/r1.html" });
        mockDbObjectStatus.mockResolvedValue("present");
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(mockDbDeleteArchive).not.toHaveBeenCalled();
        expect(mockDbCreateArchive).not.toHaveBeenCalled();
        expect(r.success).toBe(true);
        expect(mockDbAccept).toHaveBeenCalled();
    });
});

describe("serviceAcceptQuoteToOrder — RPC hata kodu eşleme", () => {
    const cases: Array<[string, keyof Awaited<ReturnType<typeof serviceAcceptQuoteToOrder>>]> = [
        ["P0002", "notFound"],
        ["42501", "invalidStatus"],
        ["23502", "unprocessable"],
        ["22003", "unprocessable"],
    ];
    it.each(cases)("RPC %s → %s", async (code, flag) => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbAccept.mockRejectedValue(Object.assign(new Error("rpc"), { code }));
        const r = await serviceAcceptQuoteToOrder(QID, "u1");
        expect(r.success).toBe(false);
        expect(r[flag]).toBe(true);
    });

    it("bilinmeyen RPC hatası → throw (propagate)", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbAccept.mockRejectedValue(Object.assign(new Error("boom"), { code: "XX999" }));
        await expect(serviceAcceptQuoteToOrder(QID, "u1")).rejects.toThrow(/boom/);
    });

    // 078 Bulgu: 23514 (jenerik check_violation) artık MAP EDİLMEZ → throw (500).
    // order_lines'ın qty>0/unit_price>=0/discount check'leri hep 23514 üretir;
    // "arşiv bulunamadı" diye yanlış etiketlenmemeli.
    it("RPC 23514 (check_violation) → MAP EDİLMEZ, throw (honest 500)", async () => {
        mockDbGetQuote.mockResolvedValue(stub("sent"));
        mockDbAccept.mockRejectedValue(Object.assign(new Error("check fail"), { code: "23514" }));
        await expect(serviceAcceptQuoteToOrder(QID, "u1")).rejects.toThrow(/check fail/);
    });
});
