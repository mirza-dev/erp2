/**
 * Faz 4 (V7) — quote-pdf-archives helper testleri.
 *   dbGetQuoteArchive (eq+eq+maybeSingle), dbCreateQuoteArchive (orphan-safe),
 *   dbGetArchiveSignedUrl (createSignedUrl).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFrom = vi.fn();
const mockInsert = vi.fn();
const mockDelete = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();
const mockStorageUpload = vi.fn();
const mockStorageSigned = vi.fn();
const mockStorageList = vi.fn();
const mockStorageRemove = vi.fn();
const mockStorageDownload = vi.fn();

let _terminal: { data: unknown; error: unknown } = { data: null, error: null };
function setTerminal(v: { data: unknown; error: unknown }) { _terminal = v; }

const makeChain = () => {
    const c: Record<string, unknown> = {
        then: (resolve: (v: unknown) => unknown) => Promise.resolve(_terminal).then(resolve),
    };
    c.insert = (v: unknown) => { mockInsert(v); return c; };
    c.delete = () => { mockDelete(); return c; };
    c.select = (v?: unknown) => { mockSelect(v); return c; };
    c.eq = (k: unknown, v: unknown) => { mockEq(k, v); return c; };
    c.maybeSingle = () => mockMaybeSingle();
    c.single = () => mockSingle();
    return c;
};

const mockSupabase = {
    from: (table: string) => { mockFrom(table); return makeChain(); },
    storage: {
        from: (_bucket: string) => ({
            upload: (...a: unknown[]) => mockStorageUpload(...a),
            createSignedUrl: (...a: unknown[]) => mockStorageSigned(...a),
            list: (...a: unknown[]) => mockStorageList(...a),
            remove: (...a: unknown[]) => mockStorageRemove(...a),
            download: (...a: unknown[]) => mockStorageDownload(...a),
        }),
    },
};

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: () => mockSupabase }));

import { dbGetQuoteArchive, dbCreateQuoteArchive, dbGetArchiveSignedUrl, dbArchiveObjectExists, dbArchiveObjectStatus, dbDeleteQuoteArchive, dbDownloadArchiveHtml } from "@/lib/supabase/quote-pdf-archives";

const QID = "00000000-0000-4000-8000-000000000001";

beforeEach(() => {
    [mockFrom, mockInsert, mockDelete, mockSelect, mockEq, mockMaybeSingle, mockSingle, mockStorageUpload, mockStorageSigned, mockStorageList, mockStorageRemove, mockStorageDownload]
        .forEach((m) => m.mockReset());
    mockStorageRemove.mockResolvedValue({ data: [], error: null });
    setTerminal({ data: null, error: null });
});

describe("dbGetQuoteArchive", () => {
    it("quote_id + revision_no eq + maybeSingle ile sorgular; varsa döner", async () => {
        const row = { id: "a1", quote_id: QID, revision_no: 1, file_path: "quotes/x/r1.html" };
        mockMaybeSingle.mockResolvedValueOnce({ data: row, error: null });
        const r = await dbGetQuoteArchive(QID, 1);
        expect(r).toEqual(row);
        expect(mockFrom).toHaveBeenCalledWith("quote_pdf_archives");
        expect(mockEq).toHaveBeenCalledWith("quote_id", QID);
        expect(mockEq).toHaveBeenCalledWith("revision_no", 1);
    });

    it("yoksa null", async () => {
        mockMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
        expect(await dbGetQuoteArchive(QID, 2)).toBeNull();
    });

    it("DB hatası → throw", async () => {
        mockMaybeSingle.mockResolvedValueOnce({ data: null, error: { message: "db fail" } });
        await expect(dbGetQuoteArchive(QID, 1)).rejects.toThrow(/db fail/);
    });
});

describe("dbCreateQuoteArchive", () => {
    const base = { quoteId: QID, revisionNo: 1, html: "<html>x</html>", contentHash: "abc", byteSize: 14 };

    it("insert + upload başarılı → satır döner; file_path deterministik", async () => {
        const row = { id: "a1", quote_id: QID, revision_no: 1, file_path: `quotes/${QID}/r1.html` };
        mockSingle.mockResolvedValueOnce({ data: row, error: null });
        mockStorageUpload.mockResolvedValueOnce({ error: null });
        const r = await dbCreateQuoteArchive(base);
        expect(r).toEqual(row);
        expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
            quote_id: QID, revision_no: 1, file_path: `quotes/${QID}/r1.html`, content_hash: "abc", byte_size: 14,
        }));
        // P1 fix: bucket allowlist ['text/html'] ile eşleşmesi için charset parametresi YOK.
        expect(mockStorageUpload).toHaveBeenCalledWith(
            `quotes/${QID}/r1.html`, expect.anything(), expect.objectContaining({ upsert: false, contentType: "text/html" }),
        );
    });

    it("upload başarısız → DB satırı silinir (orphan-safe) + throw", async () => {
        mockSingle.mockResolvedValueOnce({ data: { id: "a1" }, error: null });
        mockStorageUpload.mockResolvedValueOnce({ error: { message: "upload boom" } });
        await expect(dbCreateQuoteArchive(base)).rejects.toThrow(/upload boom/);
        expect(mockDelete).toHaveBeenCalled();
        expect(mockEq).toHaveBeenCalledWith("id", "a1");
    });

    it("insert hatası (örn. UNIQUE ihlali) → throw, upload çağrılmaz", async () => {
        mockSingle.mockResolvedValueOnce({ data: null, error: { message: "duplicate key" } });
        await expect(dbCreateQuoteArchive(base)).rejects.toThrow(/duplicate key/);
        expect(mockStorageUpload).not.toHaveBeenCalled();
    });

    it("boş html / geçersiz revizyon → erken throw (DB çağrılmaz)", async () => {
        await expect(dbCreateQuoteArchive({ ...base, html: "", byteSize: 0 })).rejects.toThrow(/içeriği boş/);
        await expect(dbCreateQuoteArchive({ ...base, revisionNo: 0 })).rejects.toThrow(/revizyon/);
        expect(mockInsert).not.toHaveBeenCalled();
    });
});

describe("dbGetArchiveSignedUrl", () => {
    it("signed URL döner", async () => {
        mockStorageSigned.mockResolvedValueOnce({ data: { signedUrl: "https://signed/x" }, error: null });
        expect(await dbGetArchiveSignedUrl("quotes/x/r1.html")).toBe("https://signed/x");
        expect(mockStorageSigned).toHaveBeenCalledWith("quotes/x/r1.html", 3600);
    });

    it("hata → null", async () => {
        mockStorageSigned.mockResolvedValueOnce({ data: null, error: { message: "no" } });
        expect(await dbGetArchiveSignedUrl("quotes/x/r1.html")).toBeNull();
    });
});

describe("dbDownloadArchiveHtml", () => {
    it("obje var → HTML string döner (.text())", async () => {
        mockStorageDownload.mockResolvedValueOnce({ data: { text: async () => "<html>arşiv</html>" }, error: null });
        expect(await dbDownloadArchiveHtml("quotes/x/r1.html")).toBe("<html>arşiv</html>");
        expect(mockStorageDownload).toHaveBeenCalledWith("quotes/x/r1.html");
    });

    it("hata → null", async () => {
        mockStorageDownload.mockResolvedValueOnce({ data: null, error: { message: "yok" } });
        expect(await dbDownloadArchiveHtml("quotes/x/r1.html")).toBeNull();
    });
});

// ── Bulgu 4 / P3-2: dbArchiveObjectExists ─────────────────────────────────────
describe("dbArchiveObjectExists", () => {
    it("klasörü dosya adıyla list eder; dosya varsa true", async () => {
        mockStorageList.mockResolvedValueOnce({ data: [{ name: "r1.html" }], error: null });
        expect(await dbArchiveObjectExists("quotes/x/r1.html")).toBe(true);
        expect(mockStorageList).toHaveBeenCalledWith("quotes/x", { search: "r1.html" });
    });

    it("liste boş (phantom: DB satırı var, dosya yok) → false", async () => {
        mockStorageList.mockResolvedValueOnce({ data: [], error: null });
        expect(await dbArchiveObjectExists("quotes/x/r1.html")).toBe(false);
    });

    it("farklı dosya döner (search gevşek eşleşmesi) → ad birebir değilse false", async () => {
        mockStorageList.mockResolvedValueOnce({ data: [{ name: "r10.html" }], error: null });
        expect(await dbArchiveObjectExists("quotes/x/r1.html")).toBe(false);
    });

    it("storage hatası → false (defansif, kırık sekme yerine graceful 404)", async () => {
        mockStorageList.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
        expect(await dbArchiveObjectExists("quotes/x/r1.html")).toBe(false);
    });
});

// ── Faz 6 / Bulgular #1+#2 (advisor): dbArchiveObjectStatus (üç-durumlu) ───────
// present/missing/unknown ayrımı — "unknown" (list HATASI) ne yıkıcı aksiyon ne
// başarı sinyali olmalı (sağlam arşivi koru + arşivsiz siparişe izin verme).
describe("dbArchiveObjectStatus", () => {
    it("list OK + obje var → present", async () => {
        mockStorageList.mockResolvedValueOnce({ data: [{ name: "r1.html" }], error: null });
        expect(await dbArchiveObjectStatus("quotes/x/r1.html")).toBe("present");
        expect(mockStorageList).toHaveBeenCalledWith("quotes/x", { search: "r1.html" });
    });

    it("list OK + obje listede yok → missing (KESİN yok)", async () => {
        mockStorageList.mockResolvedValueOnce({ data: [], error: null });
        expect(await dbArchiveObjectStatus("quotes/x/r1.html")).toBe("missing");
    });

    it("list HATASI → unknown (belirsiz — ne yık ne başarı dön)", async () => {
        mockStorageList.mockResolvedValueOnce({ data: null, error: { message: "transient blip" } });
        expect(await dbArchiveObjectStatus("quotes/x/r1.html")).toBe("unknown");
    });

    it("gevşek eşleşme (r10.html ≠ r1.html) → missing", async () => {
        mockStorageList.mockResolvedValueOnce({ data: [{ name: "r10.html" }], error: null });
        expect(await dbArchiveObjectStatus("quotes/x/r1.html")).toBe("missing");
    });
});

// ── Faz 6 / P2: dbDeleteQuoteArchive (phantom recover) ────────────────────────
describe("dbDeleteQuoteArchive", () => {
    it("filePath verilince storage remove + DB satır delete (id ile)", async () => {
        setTerminal({ data: null, error: null });
        await dbDeleteQuoteArchive("arch-1", "quotes/x/r1.html");
        expect(mockStorageRemove).toHaveBeenCalledWith(["quotes/x/r1.html"]);
        expect(mockDelete).toHaveBeenCalled();
        expect(mockEq).toHaveBeenCalledWith("id", "arch-1");
    });

    it("filePath yoksa storage remove ÇAĞRILMAZ, yalnız DB delete", async () => {
        setTerminal({ data: null, error: null });
        await dbDeleteQuoteArchive("arch-1");
        expect(mockStorageRemove).not.toHaveBeenCalled();
        expect(mockEq).toHaveBeenCalledWith("id", "arch-1");
    });

    it("storage remove patlasa bile DB delete devam eder (best-effort)", async () => {
        mockStorageRemove.mockRejectedValueOnce(new Error("obje yok"));
        setTerminal({ data: null, error: null });
        await expect(dbDeleteQuoteArchive("arch-1", "quotes/x/r1.html")).resolves.toBeUndefined();
        expect(mockEq).toHaveBeenCalledWith("id", "arch-1");
    });

    it("DB delete hatası → throw", async () => {
        setTerminal({ data: null, error: { message: "db fail" } });
        await expect(dbDeleteQuoteArchive("arch-1")).rejects.toThrow(/db fail/);
    });
});
