/**
 * 088 — Teklif gönderilince stok rezervasyonu (bekleyen sipariş) yaşam döngüsü.
 * Servis: send→bağlı sipariş+rezerve+shortage; reject/expire/revise→bağlı sipariş iptal.
 * + Migration 088 source-regression.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const QID = "00000000-0000-4000-8000-000000000001";

const mockDbGetQuote = vi.fn();
const mockDbUpdateStatus = vi.fn();
const mockListExpired = vi.fn();
const mockCreateRevision = vi.fn();
const mockSendReserve = vi.fn();
const mockCancelLinked = vi.fn();
const mockAccept = vi.fn();

vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: vi.fn().mockResolvedValue(null),
    requireRole: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/lib/supabase/quotes", () => ({
    dbGetQuote: (...a: unknown[]) => mockDbGetQuote(...a),
    dbUpdateQuoteStatus: (...a: unknown[]) => mockDbUpdateStatus(...a),
    dbListExpiredQuotes: (...a: unknown[]) => mockListExpired(...a),
    dbCreateQuoteRevision: (...a: unknown[]) => mockCreateRevision(...a),
    dbSendQuoteCreatePendingOrder: (...a: unknown[]) => mockSendReserve(...a),
    dbCancelQuoteLinkedOrder: (...a: unknown[]) => mockCancelLinked(...a),
    dbAcceptQuoteAndCreateOrder: (...a: unknown[]) => mockAccept(...a),
}));
// Arşiv hook'unu (send) hafifletmek için bağımlılıkları başarı döndür.
const mockGetArchive = vi.fn();
const mockObjectStatus = vi.fn();
vi.mock("@/lib/supabase/quote-pdf-archives", () => ({
    dbGetQuoteArchive: (...a: unknown[]) => mockGetArchive(...a),
    dbCreateQuoteArchive: vi.fn().mockResolvedValue({ id: "a1" }),
    dbArchiveObjectStatus: (...a: unknown[]) => mockObjectStatus(...a),
    dbDeleteQuoteArchive: vi.fn(),
}));
vi.mock("@/lib/supabase/company-settings", () => ({ dbGetCompanySettings: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/quote-archive-html", () => ({
    buildQuoteDataFromDetail: vi.fn(() => ({})),
    renderQuoteArchiveHtml: vi.fn(() => "<html>x</html>"),
}));

import { serviceTransitionQuote, serviceExpireQuotes, serviceCreateQuoteRevision } from "@/lib/services/quote-service";

const stubQuote = (over: Record<string, unknown> = {}) => ({
    id: QID, quote_number: "TKL-2026-001", status: "draft",
    customer_name: "Acme", customer_address: "Adres", currency: "USD",
    grand_total: 100, quote_date: "2026-06-01", valid_until: "2026-12-31",
    created_at: "2026-06-01T10:00:00Z", revision_no: 1, vat_rate: 20,
    subtotal: 100, vat_total: 20, discount_amount: 0, lines: [],
    ...over,
});

beforeEach(() => {
    [mockDbGetQuote, mockDbUpdateStatus, mockListExpired, mockCreateRevision, mockSendReserve, mockCancelLinked, mockAccept, mockGetArchive, mockObjectStatus].forEach(m => m.mockReset());
    mockDbUpdateStatus.mockResolvedValue(true);
    mockGetArchive.mockResolvedValue(null);          // arşiv yok → üret (no-op stub)
    mockObjectStatus.mockResolvedValue("present");
    mockSendReserve.mockResolvedValue({ order_id: "o1", order_number: "ORD-1", already: false, shortages: [], total_reserved: 5, total_requested: 5 });
    mockCancelLinked.mockResolvedValue(undefined);
});

describe("serviceTransitionQuote sent → bağlı sipariş + rezervasyon (088)", () => {
    it("başarılı send → dbSendQuoteCreatePendingOrder çağrılır, reservedOrderNumber döner", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "draft" }));
        const r = await serviceTransitionQuote(QID, "sent");
        expect(r.success).toBe(true);
        expect(mockSendReserve).toHaveBeenCalledWith(QID, null);
        expect(r.reservedOrderNumber).toBe("ORD-1");
        expect(r.reservationWarning).toBeFalsy();
        expect(r.shortages).toBeUndefined();   // shortage yoksa taşınmaz
    });

    it("stok kısmi → shortages sonuçta taşınır (UI uyarısı)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "draft" }));
        mockSendReserve.mockResolvedValue({
            order_id: "o1", order_number: "ORD-2", already: false,
            shortages: [{ product_name: "Vana", requested: 10, reserved: 4, shortage: 6 }],
            total_reserved: 4, total_requested: 10,
        });
        const r = await serviceTransitionQuote(QID, "sent");
        expect(r.success).toBe(true);
        expect(r.shortages).toHaveLength(1);
        expect(r.shortages![0].shortage).toBe(6);
        expect(r.reservedOrderNumber).toBe("ORD-2");
    });

    it("rezervasyon RPC patlarsa send YİNE başarılı + reservationWarning=true (sessiz değil)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "draft" }));
        mockSendReserve.mockRejectedValue(new Error("rpc down"));
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const r = await serviceTransitionQuote(QID, "sent");
        expect(r.success).toBe(true);
        expect(r.reservationWarning).toBe(true);
        errSpy.mockRestore();
    });
});

describe("serviceTransitionQuote rejected → bağlı sipariş iptal (rezerv release)", () => {
    it("reddetme → dbCancelQuoteLinkedOrder çağrılır; rezervasyon yaratılmaz", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "sent" }));
        const r = await serviceTransitionQuote(QID, "rejected");
        expect(r.success).toBe(true);
        expect(mockCancelLinked).toHaveBeenCalledWith(QID);
        expect(mockSendReserve).not.toHaveBeenCalled();
    });

    it("iptal RPC patlarsa reddetme YİNE başarılı (best-effort)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "sent" }));
        mockCancelLinked.mockRejectedValue(new Error("cancel down"));
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        const r = await serviceTransitionQuote(QID, "rejected");
        expect(r.success).toBe(true);
        errSpy.mockRestore();
    });
});

describe("serviceExpireQuotes → her expired teklifin bağlı siparişi iptal", () => {
    it("expired teklif → dbCancelQuoteLinkedOrder çağrılır", async () => {
        mockListExpired.mockResolvedValue([{ id: QID, status: "sent" }]);
        const r = await serviceExpireQuotes();
        expect(r.expired).toBe(1);
        expect(mockCancelLinked).toHaveBeenCalledWith(QID);
    });

    it("status eşzamanlı değişti (update false) → cancel ÇAĞRILMAZ", async () => {
        mockListExpired.mockResolvedValue([{ id: QID, status: "sent" }]);
        mockDbUpdateStatus.mockResolvedValue(false);
        const r = await serviceExpireQuotes();
        expect(r.expired).toBe(0);
        expect(mockCancelLinked).not.toHaveBeenCalled();
    });
});

describe("serviceCreateQuoteRevision → kaynak siparişi iptal (supersede)", () => {
    it("revize → kaynak için dbCancelQuoteLinkedOrder çağrılır", async () => {
        mockCreateRevision.mockResolvedValue("new-quote-id");
        mockDbGetQuote.mockResolvedValue(stubQuote({ id: "new-quote-id", quote_number: "TKL-2026-001-R2" }));
        const r = await serviceCreateQuoteRevision(QID);
        expect(r.success).toBe(true);
        expect(mockCancelLinked).toHaveBeenCalledWith(QID);
    });
});

// ── Migration 088 source-regression ──────────────────────────
describe("Migration 088 — quote send reservation", () => {
    const SQL = readFileSync(join(process.cwd(), "supabase/migrations/088_quote_send_reservation.sql"), "utf8");

    it("send_quote_and_create_pending_order: pending_approval + allocate_order_lines", () => {
        expect(SQL).toMatch(/create or replace function send_quote_and_create_pending_order/);
        expect(SQL).toMatch(/'pending_approval'/);
        expect(SQL).toMatch(/allocate_order_lines\(v_order_id\)/);
    });

    it("send RPC zero-stock'ta RAISE ETMEZ (lenient) — submit_order'daki guard YOK", () => {
        // 'Hiçbir satır için yeterli stok yok' submit_order_for_approval'da var; burada OLMAMALI.
        expect(SQL).not.toMatch(/Hiçbir satır için yeterli stok yok/);
    });

    it("arşiv LENIENT: v_pdf NULL'da RAISE YOK (accept'te var, send'te yok)", () => {
        // send bloğunda PDF RAISE olmamalı; accept (legacy) bloğunda olmalı → en az 1 ama send'inkinden değil.
        expect(SQL).toMatch(/Quote has no PDF archive/);   // accept legacy yolunda
        // send fonksiyonunun gövdesinde 'no PDF archive' geçmemeli:
        const sendBody = SQL.slice(SQL.indexOf("function send_quote_and_create_pending_order"), SQL.indexOf("function accept_quote_and_create_order"));
        expect(sendBody).not.toMatch(/no PDF archive/);
    });

    it("accept revize: approve_order reuse (pending→approved) + legacy create fallback", () => {
        expect(SQL).toMatch(/perform approve_order\(v_existing\.id\)/);
        expect(SQL).toMatch(/'draft', 'unallocated'/);   // legacy fallback hâlâ draft yaratır
    });

    it("cancel_quote_linked_order: cancel_order reuse + no_order no-op", () => {
        expect(SQL).toMatch(/create or replace function cancel_quote_linked_order/);
        expect(SQL).toMatch(/cancel_order\(v_order_id\)/);
        expect(SQL).toMatch(/'no_order', true/);
    });

    it("service_role grant + ROLLBACK", () => {
        expect(SQL).toMatch(/grant execute on function send_quote_and_create_pending_order/);
        expect(SQL).toMatch(/grant execute on function cancel_quote_linked_order/);
        expect(SQL).toMatch(/ROLLBACK/);
    });
});

// ── UI source-regression (teklif detay) ──────────────────────
describe("Teklif detay UI — gönder rezervasyon notu + shortage toast", () => {
    const PAGE = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/[id]/page.tsx"), "utf8");

    it("gönder onayında 'stok rezerve edilecek' bilgi notu", () => {
        expect(PAGE).toMatch(/bekleyen sipariş<\/strong> oluşturulur/);
        expect(PAGE).toMatch(/stok <strong>rezerve edilir/);
        expect(PAGE).toMatch(/role="note"/);
    });

    it("send sonucu shortage/rezervasyon uyarısı toast'ları", () => {
        expect(PAGE).toMatch(/data\.reservationWarning/);
        expect(PAGE).toMatch(/data\.shortages/);
        expect(PAGE).toMatch(/reservedOrderNumber/);
    });
});
