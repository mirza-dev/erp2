/**
 * 2026-06-17 erp2-reviewer denetim bulguları regresyon kilidi:
 *   O2 — buildRfqSearchOrFilter: PostgREST .or() filtre enjeksiyonu engellenir.
 *   O1 — serviceSendRfq: tedarikçi e-postası HTML'i escape'lenir (stored-XSS sınıfı).
 *   D1 — dbCreateRfqArchive: yeniden gönderim idempotent (upsert), upload satırdan önce.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildRfqSearchOrFilter } from "@/lib/supabase/supplier-rfqs";

describe("O2 — buildRfqSearchOrFilter (filtre enjeksiyonu)", () => {
    it("normal arama iki ilike koşulu üretir, değer çift tırnaklı", () => {
        const f = buildRfqSearchOrFilter("vana");
        expect(f).toBe(`rfq_number.ilike."%vana%",title.ilike."%vana%"`);
    });

    it("virgül içeren payload ek koşul enjekte EDEMEZ (tırnak içinde kalır)", () => {
        const f = buildRfqSearchOrFilter("x,status.eq.cancelled");
        // Enjekte edilmeye çalışılan virgül/operatör tırnaklı değerin içinde kalmalı.
        expect(f).toBe(`rfq_number.ilike."%x,status.eq.cancelled%",title.ilike."%x,status.eq.cancelled%"`);
        // .or() ayracı olan virgül yalnız iki meşru koşul arasında bir kez (tırnak DIŞINDA).
        const outsideQuotes = f.replace(/"[^"]*"/g, "");
        expect(outsideQuotes.split(",").length).toBe(2); // tam 2 koşul
    });

    it("gömülü çift tırnak ve ters bölü kaçışlanır (tırnaktan kaçış yok)", () => {
        const f = buildRfqSearchOrFilter('a"b\\c');
        expect(f).toBe(`rfq_number.ilike."%a\\"b\\\\c%",title.ilike."%a\\"b\\\\c%"`);
    });

    it("baştaki/sondaki boşluk kırpılır", () => {
        expect(buildRfqSearchOrFilter("  vana  ")).toContain(`"%vana%"`);
    });
});

describe("O1 — serviceSendRfq tedarikçi e-postası HTML escape", () => {
    beforeEach(() => vi.resetModules());

    it("vendor_name / rfq_number HTML-escape'lenir, ham < > & gitmez", async () => {
        const captured: { html?: string } = {};

        vi.doMock("@/lib/supabase/supplier-rfqs", () => ({
            dbGetRfqById: vi.fn().mockResolvedValue({
                id: "r1",
                rfq_number: "RFQ-2026-0001 <b>",
                title: "Test",
                status: "draft",
                due_date: "2026-07-01",
                vendors: [{ vendor_id: "v1", vendor_name: "Acme <Industrial> & Co", vendor_email: "v@example.com" }],
            }),
            dbMarkRfqSent: vi.fn().mockResolvedValue(undefined),
        }));
        vi.doMock("@/lib/supabase/rfq-archives", () => ({ dbCreateRfqArchive: vi.fn().mockResolvedValue({}) }));
        vi.doMock("@/lib/rfq-archive-html", () => ({
            buildRfqDocData: vi.fn().mockReturnValue({}),
            renderRfqArchiveHtml: vi.fn().mockResolvedValue("<html></html>"),
        }));
        vi.doMock("@/lib/supabase/company-settings", () => ({ dbGetCompanySettings: vi.fn().mockResolvedValue(null) }));
        vi.doMock("@/lib/rfq-pdf", () => ({ renderRfqPdfBuffer: vi.fn().mockResolvedValue(Buffer.from("%PDF-")) }));
        vi.doMock("@/lib/services/email-service", () => ({
            sendDirectEmail: vi.fn().mockImplementation(async (args: { html: string }) => {
                captured.html = args.html;
                return { ok: true };
            }),
        }));

        const { serviceSendRfq } = await import("@/lib/services/rfq-service");
        const res = await serviceSendRfq("r1", "tester");

        expect(res.emailed).toBe(1);
        expect(captured.html).toContain("Acme &lt;Industrial&gt; &amp; Co");
        expect(captured.html).toContain("RFQ-2026-0001 &lt;b&gt;");
        // Ham (escape'siz) tehlikeli dizgeler gövdede OLMAMALI.
        expect(captured.html).not.toContain("Acme <Industrial>");
        expect(captured.html).not.toContain("RFQ-2026-0001 <b>");
    });
});

describe("D1 — dbCreateRfqArchive idempotent (upsert), upload önce", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.doUnmock("@/lib/supabase/rfq-archives"); // O1 testinin mock'unu temizle
    });

    it("upload satırdan ÖNCE çağrılır + upsert onConflict rfq_id,vendor_id ile", async () => {
        const order: string[] = [];
        const uploadFn = vi.fn().mockImplementation(async () => {
            order.push("upload");
            return { error: null };
        });
        const upsertFn = vi.fn().mockImplementation(() => {
            order.push("upsert");
            return { select: () => ({ single: () => Promise.resolve({ data: { id: "a1" }, error: null }) }) };
        });
        const insertFn = vi.fn(); // kullanılmamalı (idempotent değildi)

        vi.doMock("@/lib/supabase/service", () => ({
            createServiceClient: () => ({
                storage: { from: () => ({ upload: uploadFn }) },
                from: () => ({ upsert: upsertFn, insert: insertFn }),
            }),
        }));

        const { dbCreateRfqArchive } = await import("@/lib/supabase/rfq-archives");
        const row = await dbCreateRfqArchive({
            rfqId: "r1", vendorId: "v1", html: "<x/>", contentHash: "h", byteSize: 4, createdBy: "t",
        });

        expect(row).toEqual({ id: "a1" });
        expect(order).toEqual(["upload", "upsert"]); // dosya satırdan önce
        expect(insertFn).not.toHaveBeenCalled(); // ham insert kalmadı
        const conflictArg = upsertFn.mock.calls[0][1];
        expect(conflictArg).toEqual({ onConflict: "rfq_id,vendor_id" });
    });

    it("kaynak kilidi: insert-then-delete (orphan-cleanup) kalmadı, upsert var", () => {
        const src = readFileSync(join(process.cwd(), "src/lib/supabase/rfq-archives.ts"), "utf8");
        expect(src).toContain(".upsert(");
        expect(src).toContain('onConflict: "rfq_id,vendor_id"');
        expect(src).not.toMatch(/\.delete\(\)\.eq\("id"/); // eski orphan-temizliği yok
    });
});
