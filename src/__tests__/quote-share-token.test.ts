/**
 * quote-share-token — müşteri teklif linki HMAC token'ı (imza/süre fail-closed)
 * + /api/quotes/shared/[token] public route davranışı.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import {
    createQuoteShareToken,
    verifyQuoteShareToken,
    resolveQuoteShareSecret,
    QUOTE_SHARE_TTL_SECONDS,
} from "@/lib/quote-share-token";

const SECRET = "unit-test-secret";

const { mockGetArchive, mockDownload } = vi.hoisted(() => ({
    mockGetArchive: vi.fn(),
    mockDownload: vi.fn(),
}));
vi.mock("@/lib/supabase/quote-pdf-archives", () => ({
    dbGetQuoteArchive:     (...a: unknown[]) => mockGetArchive(...a),
    dbDownloadArchiveHtml: (...a: unknown[]) => mockDownload(...a),
}));

describe("createQuoteShareToken / verifyQuoteShareToken", () => {
    it("round-trip: üretilen token doğrulanır, payload döner", () => {
        const t = createQuoteShareToken({ quoteId: "q-1", revisionNo: 2 }, SECRET);
        const p = verifyQuoteShareToken(t, SECRET);
        expect(p).not.toBeNull();
        expect(p!.q).toBe("q-1");
        expect(p!.r).toBe(2);
        expect(p!.exp).toBeGreaterThan(Date.now() / 1000);
    });

    it("varsayılan TTL 30 gün", () => {
        const now = Date.now();
        const t = createQuoteShareToken({ quoteId: "q-1", revisionNo: 1 }, SECRET, now);
        const p = verifyQuoteShareToken(t, SECRET, now)!;
        expect(p.exp).toBe(Math.floor(now / 1000) + QUOTE_SHARE_TTL_SECONDS);
        expect(QUOTE_SHARE_TTL_SECONDS).toBe(30 * 24 * 3600);
    });

    it("yanlış secret → null (imza reddi)", () => {
        const t = createQuoteShareToken({ quoteId: "q-1", revisionNo: 1 }, SECRET);
        expect(verifyQuoteShareToken(t, "baska-secret")).toBeNull();
    });

    it("payload kurcalanırsa → null", () => {
        const t = createQuoteShareToken({ quoteId: "q-1", revisionNo: 1 }, SECRET);
        const [, sig] = t.split(".");
        const forged = Buffer.from(JSON.stringify({ q: "q-2", r: 1, exp: 9999999999 })).toString("base64url");
        expect(verifyQuoteShareToken(`${forged}.${sig}`, SECRET)).toBeNull();
    });

    it("süresi dolmuş token → null", () => {
        const past = Date.now() - 60 * 24 * 3600 * 1000;
        const t = createQuoteShareToken({ quoteId: "q-1", revisionNo: 1 }, SECRET, past);
        expect(verifyQuoteShareToken(t, SECRET)).toBeNull();
        // ama üretildiği anda geçerliydi
        expect(verifyQuoteShareToken(t, SECRET, past)).not.toBeNull();
    });

    it("bozuk format/boş parçalar → null (throw yok)", () => {
        expect(verifyQuoteShareToken("", SECRET)).toBeNull();
        expect(verifyQuoteShareToken("tek-parca", SECRET)).toBeNull();
        expect(verifyQuoteShareToken("a.b.c", SECRET)).toBeNull();
        expect(verifyQuoteShareToken("!!!.???", SECRET)).toBeNull();
    });
});

describe("resolveQuoteShareSecret", () => {
    const OLD = { share: process.env.QUOTE_SHARE_SECRET, cron: process.env.CRON_SECRET };
    afterEach(() => {
        if (OLD.share === undefined) delete process.env.QUOTE_SHARE_SECRET;
        else process.env.QUOTE_SHARE_SECRET = OLD.share;
        if (OLD.cron === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = OLD.cron;
    });

    it("QUOTE_SHARE_SECRET öncelikli; yoksa CRON_SECRET'tan TÜRETİLİR (eşit DEĞİL); ikisi de yoksa null", () => {
        process.env.QUOTE_SHARE_SECRET = "direct";
        expect(resolveQuoteShareSecret()).toBe("direct");

        delete process.env.QUOTE_SHARE_SECRET;
        process.env.CRON_SECRET = "cron-secret";
        const derived = resolveQuoteShareSecret();
        expect(derived).toBeTruthy();
        expect(derived).not.toBe("cron-secret");   // token sızarsa cron yetkisi sızmasın

        delete process.env.CRON_SECRET;
        expect(resolveQuoteShareSecret()).toBeNull();
    });
});

describe("GET /api/quotes/shared/[token] — public arşiv görüntüleme", () => {
    async function callRoute(token: string) {
        const { GET } = await import("@/app/api/quotes/shared/[token]/route");
        const req = new Request("http://x/api/quotes/shared/" + token);
        return GET(req as never, { params: Promise.resolve({ token }) });
    }

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.QUOTE_SHARE_SECRET = "route-secret";
        mockGetArchive.mockResolvedValue({ id: "a1", file_path: "quotes/q-1/r1.html" });
        mockDownload.mockResolvedValue("<html>ARŞİV</html>");
    });
    afterEach(() => { delete process.env.QUOTE_SHARE_SECRET; });

    it("geçerli token → arşiv HTML'i text/html olarak servis edilir", async () => {
        const token = createQuoteShareToken({ quoteId: "q-1", revisionNo: 1 }, "route-secret");
        const res = await callRoute(token);
        expect(res.status).toBe(200);
        expect(res.headers.get("Content-Type")).toContain("text/html");
        expect(res.headers.get("X-Robots-Tag")).toBe("noindex");
        expect(await res.text()).toContain("ARŞİV");
        expect(mockGetArchive).toHaveBeenCalledWith("q-1", 1);
    });

    it("geçersiz/sahte token → 403 dostça HTML, DB'ye inilmez", async () => {
        const res = await callRoute("sahte.token");
        expect(res.status).toBe(403);
        expect(res.headers.get("Content-Type")).toContain("text/html");
        expect(mockGetArchive).not.toHaveBeenCalled();
    });

    it("arşiv satırı yok → 404; indirme başarısız → 502", async () => {
        const token = createQuoteShareToken({ quoteId: "q-1", revisionNo: 1 }, "route-secret");
        mockGetArchive.mockResolvedValue(null);
        expect((await callRoute(token)).status).toBe(404);

        mockGetArchive.mockResolvedValue({ id: "a1", file_path: "p" });
        mockDownload.mockResolvedValue(null);
        expect((await callRoute(token)).status).toBe(502);
    });

    it("secret yapılandırılmamışsa → 503 fail-closed", async () => {
        delete process.env.QUOTE_SHARE_SECRET;
        delete process.env.CRON_SECRET;
        const token = createQuoteShareToken({ quoteId: "q-1", revisionNo: 1 }, "her-neyse");
        expect((await callRoute(token)).status).toBe(503);
    });
});

describe("kaynak kilitleri", () => {
    it("proxy ALWAYS_PUBLIC '/api/quotes/shared' içerir (müşteri linki login'siz)", () => {
        const src = readFileSync("src/proxy.ts", "utf8");
        expect(src).toMatch(/ALWAYS_PUBLIC = \[[^\]]*"\/api\/quotes\/shared"/);
    });

    it("PDF eki dönemi (2026-06): e-posta yolu token kullanmaz ama altyapı DURUYOR", () => {
        // Route + token lib silinmedi (manuel paylaşım / ileride yeniden kullanım);
        // quote-service ise artık PDF eki gönderir, link üretmez.
        const src = readFileSync("src/lib/services/quote-service.ts", "utf8");
        expect(src).toContain("attachments:");
        expect(src).not.toContain("createQuoteShareToken");
    });

    it("arşiv HTML render'ı logoyu data-URI gömmeyi dener (mobil boş-logo fix'i)", () => {
        const src = readFileSync("src/lib/quote-archive-html.ts", "utf8");
        expect(src).toContain("inlineLogoAsDataUri");
        expect(src).toMatch(/host !== expected/);   // SSRF guard: yalnız kendi storage host'u
    });
});
