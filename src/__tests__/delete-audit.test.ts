/**
 * RBAC Faz 6 — actor'lı silme-öncesi-snapshot / silme-sonrası audit testi.
 *
 * `dbDeleteCustomer` / `dbHardDeleteOrder` / `dbDeleteQuote`:
 *   - before-snapshot DELETE'ten ÖNCE çekilir (satır silinince yok olur),
 *   - audit yalnız DELETE BAŞARILI olunca yazılır (FK restrict → delete throw
 *     ederse YALAN "*_deleted" audit'i KALMAZ — kritik hesap-verebilirlik garantisi),
 *   - actor + before_state + doğru action/entity_type taşır,
 *   - satır yoksa audit YAZILMAZ (idempotent),
 *   - actor null/undefined → null.
 * Gerçek helper gövdeleri çalışır (importActual değil, doğrudan import).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Ordered call recorder + configurable existing row + delete error.
let existingRow: unknown = null;
let deleteError: { message: string } | null = null;
let calls: string[] = [];
let auditInserts: Record<string, unknown>[] = [];

function makeChain(table: string) {
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = () => chain;
    chain.maybeSingle = async () => ({ data: existingRow, error: null });
    chain.insert = async (v: Record<string, unknown>) => {
        if (table === "audit_log") {
            calls.push("audit_insert");
            auditInserts.push(v);
        }
        return { error: null };
    };
    chain.delete = () => {
        (chain as { _deleting?: boolean })._deleting = true;
        return chain;
    };
    // Yalnız delete yolunda await edilen chain → then() tetiklenir.
    chain.then = (resolve: (v: { error: { message: string } | null }) => unknown) => {
        if ((chain as { _deleting?: boolean })._deleting) calls.push("delete");
        return resolve({ error: deleteError });
    };
    return chain;
}

const mockSupabase = { from: (table: string) => makeChain(table) };

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => mockSupabase,
}));

import { dbDeleteCustomer } from "@/lib/supabase/customers";
import { dbHardDeleteOrder } from "@/lib/supabase/orders";
import { dbDeleteQuote } from "@/lib/supabase/quotes";

beforeEach(() => {
    existingRow = null;
    deleteError = null;
    calls = [];
    auditInserts = [];
});

const ID = "00000000-0000-4000-8000-000000000001";
const ACTOR = "11111111-2222-4333-8444-555555555555";

describe("Faz 6 — dbDeleteCustomer audit", () => {
    it("satır varsa: snapshot çekilir → DELETE → audit (sırayla) + actor/before_state/action", async () => {
        existingRow = { id: ID, name: "Acme", is_active: true };
        await dbDeleteCustomer(ID, ACTOR);
        expect(calls).toEqual(["delete", "audit_insert"]);
        expect(auditInserts).toHaveLength(1);
        expect(auditInserts[0]).toMatchObject({
            actor: ACTOR,
            action: "customer_deleted",
            entity_type: "customer",
            entity_id: ID,
            before_state: existingRow,
            source: "ui",
        });
    });
    it("satır yoksa: audit YAZILMAZ, delete yine çalışır", async () => {
        existingRow = null;
        await dbDeleteCustomer(ID, ACTOR);
        expect(calls).toEqual(["delete"]);
        expect(auditInserts).toHaveLength(0);
    });
    it("DELETE FK restrict ile başarısız → throw + YALAN audit YAZILMAZ", async () => {
        existingRow = { id: ID, name: "Acme" };
        deleteError = { message: "violates foreign key constraint" };
        await expect(dbDeleteCustomer(ID, ACTOR)).rejects.toThrow(/foreign key/);
        expect(auditInserts).toHaveLength(0);
        expect(calls).toEqual(["delete"]);
    });
    it("actor null geçilebilir", async () => {
        existingRow = { id: ID, name: "Acme" };
        await dbDeleteCustomer(ID, null);
        expect(auditInserts[0]).toMatchObject({ actor: null, action: "customer_deleted" });
    });
});

describe("Faz 6 — dbHardDeleteOrder audit", () => {
    it("satır varsa: snapshot → DELETE → audit (sırayla) + sales_order action", async () => {
        existingRow = { id: ID, order_number: "ORD-1", commercial_status: "cancelled" };
        await dbHardDeleteOrder(ID, ACTOR);
        expect(calls).toEqual(["delete", "audit_insert"]);
        expect(auditInserts[0]).toMatchObject({
            actor: ACTOR,
            action: "order_hard_deleted",
            entity_type: "sales_order",
            entity_id: ID,
            before_state: existingRow,
            source: "ui",
        });
    });
    it("satır yoksa: audit YAZILMAZ", async () => {
        existingRow = null;
        await dbHardDeleteOrder(ID, ACTOR);
        expect(calls).toEqual(["delete"]);
        expect(auditInserts).toHaveLength(0);
    });
    it("DELETE FK restrict (shipment/invoice) ile başarısız → throw + YALAN audit YAZILMAZ", async () => {
        existingRow = { id: ID, order_number: "ORD-1" };
        deleteError = { message: "violates foreign key constraint \"shipments_order_id_fkey\"" };
        await expect(dbHardDeleteOrder(ID, ACTOR)).rejects.toThrow(/foreign key/);
        expect(auditInserts).toHaveLength(0);
    });
});

describe("Faz 6 — dbDeleteQuote audit", () => {
    it("satır varsa: snapshot → DELETE → audit (sırayla) + quote action", async () => {
        existingRow = { id: ID, quote_number: "TKL-1", status: "draft" };
        await dbDeleteQuote(ID, ACTOR);
        expect(calls).toEqual(["delete", "audit_insert"]);
        expect(auditInserts[0]).toMatchObject({
            actor: ACTOR,
            action: "quote_deleted",
            entity_type: "quote",
            entity_id: ID,
            before_state: existingRow,
            source: "ui",
        });
    });
    it("actor opsiyonel (verilmezse undefined→null)", async () => {
        existingRow = { id: ID, quote_number: "TKL-1" };
        await dbDeleteQuote(ID);
        expect(auditInserts[0]).toMatchObject({ actor: null, action: "quote_deleted" });
    });
});
