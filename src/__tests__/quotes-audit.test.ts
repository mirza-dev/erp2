/**
 * Faz 8c — Quotes audit katmanı (helper seviyesi).
 * dbCreateQuote/dbUpdateQuote/dbCreateQuoteRevision mutation sonrası audit_log
 * yazar (product-types/vendors paterni; source:"ui", actor'sız, best-effort).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const auditInserts: Array<{ table: string; payload: Record<string, unknown> }> = [];
const mockRpc = vi.fn();

const QUOTE = { id: "q-1", quote_number: "TKL-2026-007", status: "draft", grand_total: 120, quote_line_items: [] };

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        rpc: (name: string, args: unknown) => mockRpc(name, args),
        from: (table: string) => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: QUOTE, error: null }) }) }),
            insert: (payload: Record<string, unknown>) => {
                auditInserts.push({ table, payload });
                return { select: () => ({ single: async () => ({ data: null, error: null }) }) };
            },
        }),
    }),
}));

beforeEach(() => {
    auditInserts.length = 0;
    mockRpc.mockReset();
});

describe("Faz 8c — quotes helper audit_log", () => {
    it("dbCreateQuote → audit_log 'quote_created' (entity_type quote, source ui)", async () => {
        mockRpc.mockResolvedValueOnce({ data: "q-1", error: null });
        const { dbCreateQuote } = await import("@/lib/supabase/quotes");
        await dbCreateQuote({ customer_name: "ACME", currency: "TRY", vat_rate: 20, subtotal: 100, vat_total: 20, grand_total: 120, lines: [] });

        const audit = auditInserts.find(a => a.table === "audit_log");
        expect(audit).toBeTruthy();
        expect(audit!.payload).toMatchObject({
            action: "quote_created", entity_type: "quote", entity_id: "q-1", source: "ui",
        });
        expect((audit!.payload.after_state as Record<string, unknown>).quote_number).toBe("TKL-2026-007");
    });

    it("dbUpdateQuote → audit_log 'quote_updated'", async () => {
        mockRpc.mockResolvedValueOnce({ data: null, error: null });
        const { dbUpdateQuote } = await import("@/lib/supabase/quotes");
        await dbUpdateQuote("q-1", { customer_name: "ACME", currency: "TRY", vat_rate: 20, subtotal: 100, vat_total: 20, grand_total: 120, lines: [] });

        const audit = auditInserts.find(a => a.table === "audit_log");
        expect(audit!.payload).toMatchObject({ action: "quote_updated", entity_type: "quote", entity_id: "q-1", source: "ui" });
    });

    it("dbCreateQuoteRevision → audit_log 'quote_revised' (after_state.new_quote_id)", async () => {
        mockRpc.mockResolvedValueOnce({ data: "rev-2", error: null });
        const { dbCreateQuoteRevision } = await import("@/lib/supabase/quotes");
        const newId = await dbCreateQuoteRevision("q-1");
        expect(newId).toBe("rev-2");

        const audit = auditInserts.find(a => a.table === "audit_log");
        expect(audit!.payload).toMatchObject({ action: "quote_revised", entity_type: "quote", entity_id: "q-1", source: "ui" });
        expect((audit!.payload.after_state as Record<string, unknown>).new_quote_id).toBe("rev-2");
    });
});
