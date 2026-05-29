/**
 * Teklif V7 — Revizyon zinciri (migration 074).
 *
 * ⚠️ Migration testleri DRİFT-GUARD (SQL string varlığı), create_quote_revision
 * mantığı DB-side PL/pgSQL → davranış DEĞİL; gerçek doğrulama manuel smoke.
 * Service/route testleri davranışsal (RPC/service mock'lu).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── Service behavior (RPC mock) ──────────────────────────────────────────────

const mockDbCreateQuoteRevision = vi.fn();
const mockDbGetQuote = vi.fn();

vi.mock("@/lib/supabase/quotes", () => ({
    dbCreateQuoteRevision: (...a: unknown[]) => mockDbCreateQuoteRevision(...a),
    dbGetQuote:           (...a: unknown[]) => mockDbGetQuote(...a),
    dbUpdateQuoteStatus:  vi.fn(),
    dbListExpiredQuotes:  vi.fn(),
    dbListQuoteChain:     vi.fn(),
}));
vi.mock("@/lib/supabase/products", () => ({ dbGetProductById: vi.fn() }));
vi.mock("@/lib/supabase/customers", () => ({ dbGetCustomerById: vi.fn() }));
vi.mock("@/lib/supabase/orders", () => ({ dbFindOrderByQuoteId: vi.fn() }));
vi.mock("@/lib/services/order-service", () => ({ serviceCreateOrder: vi.fn() }));

import { serviceCreateQuoteRevision } from "@/lib/services/quote-service";

const SRC_ID = "src-quote-uuid";
const NEW_ID = "new-rev-uuid";

beforeEach(() => {
    vi.clearAllMocks();
    mockDbCreateQuoteRevision.mockResolvedValue(NEW_ID);
    mockDbGetQuote.mockResolvedValue({ id: NEW_ID, quote_number: "TKL-2026-001-R2" });
});

describe("serviceCreateQuoteRevision", () => {
    it("başarı → newQuoteId + newQuoteNumber döner", async () => {
        const r = await serviceCreateQuoteRevision(SRC_ID);
        expect(r.success).toBe(true);
        expect(r.newQuoteId).toBe(NEW_ID);
        expect(r.newQuoteNumber).toBe("TKL-2026-001-R2");
    });

    it("RPC 42501 (revize edilemez durum) → invalidStatus", async () => {
        mockDbCreateQuoteRevision.mockRejectedValue(Object.assign(new Error("Bu durumdaki teklif revize edilemez"), { code: "42501" }));
        const r = await serviceCreateQuoteRevision(SRC_ID);
        expect(r.success).toBe(false);
        expect(r.invalidStatus).toBe(true);
    });

    it("RPC P0002 (kaynak yok) → notFound", async () => {
        mockDbCreateQuoteRevision.mockRejectedValue(Object.assign(new Error("yok"), { code: "P0002" }));
        const r = await serviceCreateQuoteRevision(SRC_ID);
        expect(r.success).toBe(false);
        expect(r.notFound).toBe(true);
    });

    it("beklenmeyen hata → throw (route handleApiError'a düşer)", async () => {
        mockDbCreateQuoteRevision.mockRejectedValue(new Error("db down"));
        await expect(serviceCreateQuoteRevision(SRC_ID)).rejects.toThrow("db down");
    });
});

// ── Migration 074 source-regex (drift-guard) ─────────────────────────────────

const M74 = readFileSync(join(process.cwd(), "supabase/migrations/074_quotes_revision.sql"), "utf8");

describe("Migration 074 (drift-guard)", () => {
    it("kolonlar: revision_no default 1 + root_quote_id FK + index", () => {
        expect(M74).toMatch(/add column if not exists revision_no\s+int\s+not null default 1/);
        expect(M74).toMatch(/add column if not exists root_quote_id uuid references quotes\(id\) on delete set null/);
        expect(M74).toMatch(/create index if not exists idx_quotes_root/);
    });
    it("status CHECK +revised (idempotent drop+add)", () => {
        expect(M74).toMatch(/drop constraint if exists quotes_status_check/);
        expect(M74).toMatch(/check \(status in \('draft','sent','accepted','rejected','expired','revised'\)\)/);
    });
    it("create_quote_revision: guard 42501 + FOR UPDATE + root coalesce + max+1 + suffix -R + source→revised", () => {
        expect(M74).toMatch(/create or replace function create_quote_revision/);
        expect(M74).toMatch(/not in \('sent','rejected','expired'\)/);
        expect(M74).toMatch(/errcode = '42501'/);
        expect(M74).toMatch(/for update/i);
        expect(M74).toMatch(/coalesce\(v_src\.root_quote_id, v_src\.id\)/);
        expect(M74).toMatch(/max\(revision_no\) \+ 1/);
        expect(M74).toMatch(/'-R' \|\| v_rev/);
        expect(M74).toMatch(/update quotes set status = 'revised'/);
        // valid_until=NULL (re-expire önlemi) + V7-A1 DEFINER YOK
        expect(M74).toMatch(/current_date, null,/);
        expect(M74).not.toMatch(/SECURITY DEFINER(?! YOK)/i);
    });
    it("idempotent", () => {
        expect(M74).toMatch(/add column if not exists/);
        expect(M74).toMatch(/exception when duplicate_object then null/);
    });
});

// ── UI/util source-regex ─────────────────────────────────────────────────────

describe("Revizyon UI/util (source-regex)", () => {
    it("getQuoteReviseEligible: sent/rejected/expired true", () => {
        const src = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/_utils/quote-display.ts"), "utf8");
        expect(src).toMatch(/getQuoteReviseEligible/);
        expect(src).toMatch(/status === "sent" \|\| status === "rejected" \|\| status === "expired"/);
    });
    it("page.tsx: Revize Et butonu + handleRevise + router.push(newQuoteId) + rozetler", () => {
        const p = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/[id]/page.tsx"), "utf8");
        expect(p).toMatch(/getQuoteReviseEligible\(status\)/);
        expect(p).toMatch(/\/revise`,\s*\{ method: "POST" \}/);
        expect(p).toMatch(/router\.push\(`\/dashboard\/quotes\/\$\{data\.newQuoteId\}`\)/);
        expect(p).toMatch(/quote\.revisedBy/);
        expect(p).toMatch(/quote\.revisionOf/);
    });
    it("STATUS_META + QUOTE_TRANSITIONS revised", () => {
        const list = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/page.tsx"), "utf8");
        expect(list).toMatch(/revised:\s*\{ label: "Revize Edildi"/);
        const svc = readFileSync(join(process.cwd(), "src/lib/services/quote-service.ts"), "utf8");
        expect(svc).toMatch(/revised:\s*\[\]/);
    });
    it("QuoteStatus union + mapper revisionNo/rootQuoteId", () => {
        const types = readFileSync(join(process.cwd(), "src/lib/database.types.ts"), "utf8");
        expect(types).toMatch(/"expired" \| "revised"/);
        expect(types).toMatch(/revision_no: number/);
        const m = readFileSync(join(process.cwd(), "src/lib/api-mappers.ts"), "utf8");
        expect(m).toMatch(/revisionNo: Number\(row\.revision_no/);
    });

    // Regression (advisor): revizyon draft'ı edit→save update_quote_with_lines (071)
    // üzerinden geçer; revision_no/root_quote_id o UPDATE'in kolon listesinde OLMAMALI
    // (omission ile korunur — yazılırsa revizyon meta sessizce ezilir, zincir/rozet bozulur).
    it("071 update_quote_with_lines revision_no/root_quote_id YAZMAZ (omission koruması)", () => {
        const m71 = readFileSync(join(process.cwd(), "supabase/migrations/071_quotes_rpc_discount.sql"), "utf8");
        expect(m71).not.toMatch(/revision_no/);
        expect(m71).not.toMatch(/root_quote_id/);
    });
});
