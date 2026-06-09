/**
 * Faz 4 (V7) — PDF arşiv: service (serviceArchiveQuotePdf + send hook), route,
 * migrations 075/076, UI Mod B linki, Phase 0 lock (QuoteDocument "use client" yok).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "crypto";

// ── Mocks ────────────────────────────────────────────────────
const mockDbGetQuote = vi.fn();
const mockDbUpdateStatus = vi.fn();
const mockGetArchive = vi.fn();
const mockCreateArchive = vi.fn();
const mockGetSignedUrl = vi.fn();
const mockObjectExists = vi.fn();
const mockObjectStatus = vi.fn();
const mockDeleteArchive = vi.fn();
const mockGetCompany = vi.fn();
const mockDownloadHtml = vi.fn();

// Faz 8a: RBAC guard — varsayılan izinli (mevcut testler davranışı korur).
const mockRequirePermission = vi.fn().mockResolvedValue(null);
vi.mock("@/lib/auth/role-guard", () => ({
    requirePermission: (...a: unknown[]) => mockRequirePermission(...a),
    requireRole: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/supabase/quotes", () => ({
    dbGetQuote: (...a: unknown[]) => mockDbGetQuote(...a),
    dbUpdateQuoteStatus: (...a: unknown[]) => mockDbUpdateStatus(...a),
    dbListExpiredQuotes: vi.fn(),
    dbCreateQuoteRevision: vi.fn(),
}));
vi.mock("@/lib/supabase/quote-pdf-archives", () => ({
    dbGetQuoteArchive: (...a: unknown[]) => mockGetArchive(...a),
    dbCreateQuoteArchive: (...a: unknown[]) => mockCreateArchive(...a),
    dbGetArchiveSignedUrl: (...a: unknown[]) => mockGetSignedUrl(...a),
    dbArchiveObjectExists: (...a: unknown[]) => mockObjectExists(...a),
    dbArchiveObjectStatus: (...a: unknown[]) => mockObjectStatus(...a),
    dbDeleteQuoteArchive: (...a: unknown[]) => mockDeleteArchive(...a),
    dbDownloadArchiveHtml: (...a: unknown[]) => mockDownloadHtml(...a),
}));
vi.mock("@/lib/supabase/company-settings", () => ({
    dbGetCompanySettings: (...a: unknown[]) => mockGetCompany(...a),
}));
const FROZEN_HTML = "<html>frozen-snapshot</html>";
vi.mock("@/lib/quote-archive-html", () => ({
    buildQuoteDataFromDetail: vi.fn(() => ({ fake: "data" })),
    renderQuoteArchiveHtml: vi.fn(() => FROZEN_HTML),
}));

import { serviceArchiveQuotePdf, serviceTransitionQuote } from "@/lib/services/quote-service";
import { GET as ARCHIVE_GET } from "@/app/api/quotes/[id]/archive/route";

const QID = "00000000-0000-4000-8000-000000000001";

// mapQuoteDetail (gerçek) için minimal QuoteWithLines benzeri stub.
const stubQuote = (over: Record<string, unknown> = {}) => ({
    id: QID,
    quote_number: "TKL-2026-001",
    status: "sent",
    customer_name: "Tüpraş",
    customer_address: "Test Mah. No:1, İstanbul",
    currency: "USD",
    grand_total: 5400,
    quote_date: "2026-05-30",
    valid_until: "2026-06-30",
    created_at: "2026-05-30T10:00:00Z",
    revision_no: 1,
    vat_rate: 20,
    subtotal: 4500,
    vat_total: 900,
    discount_amount: 0,
    lines: [],
    ...over,
});

beforeEach(() => {
    [mockDbGetQuote, mockDbUpdateStatus, mockGetArchive, mockCreateArchive, mockGetSignedUrl, mockObjectExists, mockObjectStatus, mockDeleteArchive, mockGetCompany, mockDownloadHtml]
        .forEach((m) => m.mockReset());
    mockDbUpdateStatus.mockResolvedValue(true);
    mockObjectExists.mockResolvedValue(true);       // GET route: varsayılan dosya var
    mockObjectStatus.mockResolvedValue("present");  // service: varsayılan obje present
    mockDeleteArchive.mockResolvedValue(undefined);
    mockGetCompany.mockResolvedValue(null);
    mockDownloadHtml.mockResolvedValue("<html>frozen-archive</html>");  // view modu: varsayılan HTML
});

// ── serviceArchiveQuotePdf ───────────────────────────────────
describe("serviceArchiveQuotePdf", () => {
    it("arşiv VARSA + storage obje VARSA idempotent: yeniden üretmez (existing:true)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue({ id: "a1", file_path: "quotes/x/r1.html" });
        const r = await serviceArchiveQuotePdf(QID);
        expect(r).toMatchObject({ archived: true, existing: true, revisionNo: 1 });
        expect(mockObjectStatus).toHaveBeenCalledWith("quotes/x/r1.html");
        expect(mockDeleteArchive).not.toHaveBeenCalled();
        expect(mockCreateArchive).not.toHaveBeenCalled();
    });

    it("Faz 6 P2 phantom: obje status=missing → stale sil + yeniden üret", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue({ id: "stale-1", file_path: "quotes/x/r1.html" });
        mockObjectStatus.mockResolvedValue("missing");   // KESİN yok
        mockCreateArchive.mockResolvedValue({ id: "a-new" });
        const r = await serviceArchiveQuotePdf(QID, "user-1");
        expect(mockDeleteArchive).toHaveBeenCalledWith("stale-1", "quotes/x/r1.html");
        expect(mockCreateArchive).toHaveBeenCalled();          // yeniden üretildi
        expect(r).toMatchObject({ archived: true, existing: false, revisionNo: 1 });
    });

    it("Faz 6 #2 fail-safe+fail-closed: status=unknown → arşiv KORUNUR + throw", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue({ id: "ok-1", file_path: "quotes/x/r1.html" });
        mockObjectStatus.mockResolvedValue("unknown");  // geçici .list() hatası
        await expect(serviceArchiveQuotePdf(QID)).rejects.toThrow(/doğrulanamadı/);
        expect(mockDeleteArchive).not.toHaveBeenCalled();  // yıkma yok (fail-safe)
        expect(mockCreateArchive).not.toHaveBeenCalled();  // üret yok (fail-closed)
    });

    it("arşiv YOKSA üretir: dbCreateQuoteArchive doğru argümanlarla (sha256 hash)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue(null);
        mockCreateArchive.mockResolvedValue({ id: "a1" });
        const r = await serviceArchiveQuotePdf(QID, "user-1");
        expect(r).toMatchObject({ archived: true, existing: false, revisionNo: 1 });
        const expectedHash = createHash("sha256").update(FROZEN_HTML).digest("hex");
        expect(mockCreateArchive).toHaveBeenCalledWith(expect.objectContaining({
            quoteId: QID,
            revisionNo: 1,
            html: FROZEN_HTML,
            contentHash: expectedHash,
            byteSize: Buffer.byteLength(FROZEN_HTML, "utf-8"),
            createdBy: "user-1",
        }));
    });

    it("teklif yoksa notFound (arşiv üretilmez)", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const r = await serviceArchiveQuotePdf(QID);
        expect(r).toMatchObject({ archived: false, notFound: true });
        expect(mockGetArchive).not.toHaveBeenCalled();
        expect(mockCreateArchive).not.toHaveBeenCalled();
    });

    it("revizyon: revision_no=2 → arşiv o revizyon için ayrı lookup + create", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ revision_no: 2 }));
        mockGetArchive.mockResolvedValue(null);
        mockCreateArchive.mockResolvedValue({ id: "a2" });
        const r = await serviceArchiveQuotePdf(QID);
        expect(r.revisionNo).toBe(2);
        expect(mockGetArchive).toHaveBeenCalledWith(QID, 2);
        expect(mockCreateArchive).toHaveBeenCalledWith(expect.objectContaining({ revisionNo: 2 }));
    });

    it("concurrency: create UNIQUE ihlali → re-read existing + OBJE present → idempotent", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        // precheck null (yarış kaybedilmeden önce), create fail, re-read'de kazanan satır
        mockGetArchive.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "a-winner", file_path: "quotes/x/r1.html" });
        mockCreateArchive.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));
        mockObjectStatus.mockResolvedValue("present");   // kazanan upload'ı bitirmiş
        const r = await serviceArchiveQuotePdf(QID);
        expect(r).toMatchObject({ archived: true, existing: true, revisionNo: 1 });
    });

    // Bulgu #1 (P2): re-read'de satır VAR ama OBJE present DEĞİL (kazanan henüz
    // upload etmedi / upload fail edip silmek üzere) → başarı DÖNME, throw (accept
    // 502 → retry, self-heal). Aksi halde accept arşivsiz referansa kayardı.
    it("concurrency: create fail + re-read satır var ama obje missing → throw (başarı dönmez)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "a-winner", file_path: "quotes/x/r1.html" });
        mockCreateArchive.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));
        mockObjectStatus.mockResolvedValue("missing");   // kazanan henüz/hiç upload etmedi
        await expect(serviceArchiveQuotePdf(QID)).rejects.toThrow(/duplicate key/);
        expect(mockCreateArchive).toHaveBeenCalledTimes(1);  // yeniden üretmeye çalışmaz (UNIQUE slot dolu)
    });

    it("concurrency: create fail + re-read hâlâ null (gerçek hata) → rethrow", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
        mockCreateArchive.mockRejectedValue(new Error("storage down"));
        await expect(serviceArchiveQuotePdf(QID)).rejects.toThrow(/storage down/);
    });
});

// ── send hook (serviceTransitionQuote → sent) ────────────────
describe("send hook: draft→sent arşivi tetikler (non-fatal)", () => {
    it("başarılı send → arşiv üretilir, archiveWarning yok", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "draft" }));
        mockGetArchive.mockResolvedValue(null);
        mockCreateArchive.mockResolvedValue({ id: "a1" });
        const r = await serviceTransitionQuote(QID, "sent");
        expect(r.success).toBe(true);
        expect(r.archiveWarning).toBeFalsy();
        expect(mockCreateArchive).toHaveBeenCalled();
    });

    it("arşivleme PATLASA da send başarılı + archiveWarning=true (görünür, non-fatal)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "draft" }));
        mockGetArchive.mockRejectedValue(new Error("storage down"));
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        const r = await serviceTransitionQuote(QID, "sent");
        expect(r.success).toBe(true);
        expect(r.archiveWarning).toBe(true);
        errSpy.mockRestore();
    });

    // Arşiv hook'u yalnız target==="sent" dalında çalışır. accepted Faz 6'da /accept
    // (RPC 077) atomik yoluna taşındı → QuoteTransition'dan çıkarıldı; bu testi geçerli
    // bir non-sent geçişle (sent→rejected) yapıyoruz: success path'e ulaşır + arşiv
    // tetiklenmediğini doğrular (eski accepted çağrısı invalid-transition dalına düşüp
    // yanlış sebeple geçiyordu).
    it("rejected geçişinde arşiv tetiklenmez (arşiv yalnız sent geçişinde)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote({ status: "sent" }));
        mockGetArchive.mockResolvedValue(null);
        mockCreateArchive.mockResolvedValue({ id: "a1" });
        const r = await serviceTransitionQuote(QID, "rejected");
        expect(r.success).toBe(true);
        expect(mockCreateArchive).not.toHaveBeenCalled();
    });
});

// ── GET /api/quotes/[id]/archive ─────────────────────────────
describe("GET /api/quotes/[id]/archive", () => {
    // Route req.nextUrl.searchParams okur (?view=1). Gerçek NextURL benzeri stub geç.
    const call = (view = false) => ARCHIVE_GET(
        { nextUrl: new URL(`http://localhost/api/quotes/${QID}/archive${view ? "?view=1" : ""}`) } as never,
        { params: Promise.resolve({ id: QID }) },
    );

    it("arşiv var → 200 {url, expires_in, revision_no}; file_path/content_hash SIZMAZ", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue({ id: "a1", file_path: "quotes/x/r1.html", content_hash: "secret-hash" });
        mockGetSignedUrl.mockResolvedValue("https://signed/x");
        const res = await call();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body).toEqual({ url: "https://signed/x", expires_in: 3600, revision_no: 1 });
        expect(JSON.stringify(body)).not.toContain("quotes/x/r1.html");
        expect(JSON.stringify(body)).not.toContain("secret-hash");
    });

    it("teklif yok → 404", async () => {
        mockDbGetQuote.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(404);
    });

    it("arşiv yok → 404", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue(null);
        const res = await call();
        expect(res.status).toBe(404);
    });

    // Bulgu 4 / P3-2: phantom satır (DB var, dosya yok) → graceful 404, signed URL ÜRETİLMEZ.
    it("phantom (DB satırı var, storage dosyası yok) → 404, signed URL üretilmez", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue({ id: "a1", file_path: "quotes/x/r1.html" });
        mockObjectExists.mockResolvedValue(false);
        const res = await call();
        expect(res.status).toBe(404);
        expect(mockGetSignedUrl).not.toHaveBeenCalled();
    });

    // ?view=1: HTML'i text/html; charset=utf-8 ile DOĞRUDAN stream eder (Supabase signed
    // URL'i HTML'i render etmediği + mojibake yaptığı için kendi origin'imizden servis).
    it("?view=1 → 200 text/html; charset=utf-8, HTML gövdesi stream edilir, signed URL üretilmez", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue({ id: "a1", file_path: "quotes/x/r1.html", content_hash: "secret" });
        mockDownloadHtml.mockResolvedValue("<!doctype html><html>ARŞİV</html>");
        const res = await call(true);
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
        const text = await res.text();
        expect(text).toContain("<!doctype html>");
        expect(text).toContain("ARŞİV");
        expect(mockGetSignedUrl).not.toHaveBeenCalled();   // view modu signed URL kullanmaz
    });

    it("?view=1 + download null → 404 HTML hata sayfası (text/html)", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue({ id: "a1", file_path: "quotes/x/r1.html" });
        mockDownloadHtml.mockResolvedValue(null);
        const res = await call(true);
        expect(res.status).toBe(404);
        expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    });

    it("?view=1 + arşiv yok → 404 ham JSON DEĞİL, dostça HTML hata sayfası", async () => {
        mockDbGetQuote.mockResolvedValue(stubQuote());
        mockGetArchive.mockResolvedValue(null);
        const res = await call(true);
        expect(res.status).toBe(404);
        expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
        expect(await res.text()).toContain("arşiv bulunamadı");
    });

    it("?view=1 + view_sales_prices yok → 403 dostça HTML (ham JSON guard yerine)", async () => {
        mockRequirePermission.mockResolvedValueOnce({ status: 403 });   // guard truthy
        const res = await call(true);
        expect(res.status).toBe(403);
        expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    });
});

// ── Migrations 075 / 076 ─────────────────────────────────────
const read = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");
const SQL075 = read("075_quote_pdf_archives.sql");
const SQL076 = read("076_quote_pdfs_bucket.sql");

describe("Migration 075 — quote_pdf_archives", () => {
    it("tablo + kolonlar idempotent", () => {
        expect(SQL075).toMatch(/CREATE TABLE IF NOT EXISTS quote_pdf_archives/i);
        expect(SQL075).toMatch(/quote_id\s+uuid NOT NULL REFERENCES quotes\(id\) ON DELETE CASCADE/i);
        expect(SQL075).toMatch(/revision_no\s+int NOT NULL/i);
        expect(SQL075).toMatch(/content_hash\s+text NOT NULL/i);
    });
    it("V3-A5 UNIQUE(quote_id, revision_no) immutability backstop", () => {
        expect(SQL075).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uniq_quote_archive_rev[\s\S]{0,80}quote_pdf_archives\(quote_id, revision_no\)/i);
    });
    it("RLS enable + service_role policy", () => {
        expect(SQL075).toMatch(/ALTER TABLE quote_pdf_archives ENABLE ROW LEVEL SECURITY/i);
        expect(SQL075).toMatch(/auth\.role\(\) = 'service_role'/);
    });
    it("ROLLBACK bloğu mevcut", () => {
        expect(SQL075).toMatch(/-- ROLLBACK:/);
        expect(SQL075).toMatch(/DROP TABLE IF EXISTS quote_pdf_archives/i);
    });
});

describe("Migration 076 — quote-pdfs bucket", () => {
    it("private bucket (public=false) idempotent", () => {
        expect(SQL076).toMatch(/INSERT INTO storage\.buckets[\s\S]{0,120}'quote-pdfs'/i);
        expect(SQL076).toMatch(/'quote-pdfs',\s*'quote-pdfs',\s*false/i);
        expect(SQL076).toMatch(/ON CONFLICT \(id\) DO NOTHING/i);
    });
    it("storage.objects service_role policy + ROLLBACK", () => {
        expect(SQL076).toMatch(/bucket_id = 'quote-pdfs' AND auth\.role\(\) = 'service_role'/);
        expect(SQL076).toMatch(/-- ROLLBACK:/);
    });
});

// ── UI Mod B + Phase 0 lock (source-regex) ───────────────────
const detailPage = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/[id]/page.tsx"), "utf8",
);
const quoteDoc = readFileSync(
    join(process.cwd(), "src/app/dashboard/quotes/components/QuoteDocument.tsx"), "utf8",
);

describe("UI Mod B arşiv linki (detay sayfası)", () => {
    it("handleViewArchive senkron window.open(?view=1) — fetch yok (popup-blocker güvenli + HTML render)", () => {
        expect(detailPage).toMatch(/handleViewArchive/);
        // view=1 route'u HTML'i text/html ile stream eder; senkron açılır (fetch+sonra-open değil).
        expect(detailPage).toMatch(/window\.open\(`\/api\/quotes\/\$\{params\.id\}\/archive\?view=1`/);
    });
    it("Arşiv butonu yalnız gönderilmiş statüde (status !== 'draft')", () => {
        expect(detailPage).toMatch(/status !== "draft"[\s\S]{0,700}Arşivlenmiş Teklif/);
    });
});

const transitionRoute = readFileSync(
    join(process.cwd(), "src/app/api/quotes/[id]/route.ts"), "utf8",
);

describe("archiveWarning wiring (send arşiv fail görünür)", () => {
    it("route sent success response'una archiveWarning ekler", () => {
        expect(transitionRoute).toMatch(/archiveWarning:\s*result\.archiveWarning/);
    });
    it("UI: data.archiveWarning → warning toast (success yerine)", () => {
        expect(detailPage).toMatch(/data\.archiveWarning/);
        expect(detailPage).toMatch(/arşiv oluşturulamadı/i);
    });
    // Bulgu 3 (2. review tur): yanıltıcı "otomatik denenecek" vaadi kaldırıldı
    // (gerçek recover yalnız Faz 6 accept'te — reject/expire'da hiç denenmez).
    it("UI: archive-fail toast yanıltıcı 'otomatik denenecek' vaadi İÇERMEZ", () => {
        expect(detailPage).not.toMatch(/otomatik denenecek/i);
    });
});

describe("Phase 0 lock: QuoteDocument server-render edilebilir", () => {
    it("QuoteDocument 'use client' İÇERMEZ (client-reference proxy riski yok)", () => {
        expect(quoteDoc).not.toMatch(/^["']use client["'];/m);
    });
    it("PAGE_CSS + PRINT_CSS export edilir (wrapper kullanır)", () => {
        expect(quoteDoc).toMatch(/export const PAGE_CSS/);
        expect(quoteDoc).toMatch(/export const PRINT_CSS/);
    });
    it("V3-B6: içerikli satır gate'i (isRealRow) fiyat/toplam hücrelerinde", () => {
        expect(quoteDoc).toMatch(/const isRealRow =/);
        expect(quoteDoc).toMatch(/isRealRow \? `\$\{sym\} \$\{fmt\(price\)\}` : "—"/);
    });
});
