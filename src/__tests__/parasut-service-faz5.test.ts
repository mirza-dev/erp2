/**
 * parasut-service — Faz 5 coverage
 * serviceEnsureParasutContact: idempotent, tax_number guard,
 * findByTax (1/multi/0), email fallback paths, race-condition guard.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ParasutError } from "@/lib/parasut-adapter";
import type { ParasutContact } from "@/lib/parasut-adapter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContact(id: string, tax: string | null, email: string | null): ParasutContact {
    return { id, attributes: { name: "Test", tax_number: tax, email } };
}

function makeCustomer(overrides: Partial<{
    id: string;
    name: string;
    email: string | null;
    tax_number: string | null;
    tax_office: string | null;
    parasut_contact_id: string | null;
}> = {}) {
    return {
        id:                 "cust-1",
        name:               "Test Müşteri",
        email:              "test@example.com",
        tax_number:         "1234567890",
        tax_office:         "Istanbul",
        parasut_contact_id: null,
        ...overrides,
    };
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock chain supports all Supabase query builder paths used by serviceEnsureParasutContact:
//
//   writeContactId (find path):
//     .update().eq("id")                                    → thenable {error}
//
//   claimOrSkip (create path):
//     .update().eq("id").is(null).or(...).select("id")     → Promise<{data,error}>
//
//   finishCreate (create path):
//     .update().eq("id").eq(owner).select("id")            → Promise<{data,error}>
//
//   releaseCreate (best-effort):
//     .update().eq("id").eq(owner)                         → thenable {error}
//
// .select() always routes through mockSelectFn so tests control results via
// mockSelectFn.mockResolvedValueOnce().

const mockSelectFn     = vi.fn().mockResolvedValue({ data: [{ id: "x" }], error: null });
const mockOrFn         = vi.fn().mockReturnValue({ select: mockSelectFn });
const mockIsNullFn     = vi.fn().mockReturnValue({ select: mockSelectFn, or: mockOrFn });

// Second .eq() (finishCreate/releaseCreate) → thenable + { select }
function makeSecondEqResult(err: null | { message: string } = null) {
    const p = Promise.resolve({ data: err ? null : [{ id: "x" }], error: err });
    return Object.assign(p, { select: mockSelectFn });
}
const mockSecondEqFn = vi.fn().mockImplementation(() => makeSecondEqResult());

// First .eq("id") → thenable + { is, eq }
function makeEqResult(err: null | { message: string } = null) {
    const p = Promise.resolve({ error: err });
    return Object.assign(p, { is: mockIsNullFn, eq: mockSecondEqFn });
}

const mockUpdateEq  = vi.fn().mockImplementation(() => makeEqResult());
const mockUpdate    = vi.fn(() => ({ eq: mockUpdateEq }));
const mockFrom      = vi.fn(() => ({ update: mockUpdate }));

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: mockFrom }),
}));

const mockGetCustomerById = vi.fn();
vi.mock("@/lib/supabase/customers", () => ({
    dbGetCustomerById: (...args: unknown[]) => mockGetCustomerById(...args),
}));


const mockFindByTax     = vi.fn<[], Promise<ParasutContact[]>>();
const mockFindByEmail   = vi.fn<[], Promise<ParasutContact[]>>();
const mockCreateContact = vi.fn<[], Promise<ParasutContact>>();
const mockUpdateContact = vi.fn<[], Promise<ParasutContact>>();

vi.mock("@/lib/parasut", () => ({
    sendInvoiceToParasut: vi.fn(),
    getParasutAdapter: () => ({
        findContactsByTaxNumber: (...args: unknown[]) => mockFindByTax(...args),
        findContactsByEmail:     (...args: unknown[]) => mockFindByEmail(...args),
        createContact:           (...args: unknown[]) => mockCreateContact(...args),
        updateContact:           (...args: unknown[]) => mockUpdateContact(...args),
    }),
}));

import { serviceEnsureParasutContact } from "@/lib/services/parasut-service";

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("serviceEnsureParasutContact", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // parasutApiCall requires PARASUT_ENABLED=true
        process.env.PARASUT_ENABLED = "true";
        // Reset select mock to default (non-empty rows → claim/finishCreate succeeds)
        mockSelectFn.mockResolvedValue({ data: [{ id: "x" }], error: null });
    });

    afterEach(() => {
        delete process.env.PARASUT_ENABLED;
    });

    // ── Idempotent ────────────────────────────────────────────────────────────

    it("returns existing parasut_contact_id without calling adapter", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ parasut_contact_id: "existing-id" }));
        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("existing-id");
        expect(mockFindByTax).not.toHaveBeenCalled();
    });

    // ── Guard ─────────────────────────────────────────────────────────────────

    it("throws not_found when customer does not exist", async () => {
        mockGetCustomerById.mockResolvedValue(null);
        await expect(serviceEnsureParasutContact("missing")).rejects.toMatchObject({
            kind: "not_found",
        });
    });

    it("throws validation when tax_number is null", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: null }));
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({
            kind: "validation",
        });
        expect(mockFindByTax).not.toHaveBeenCalled();
    });

    it("throws validation when tax_number is empty string", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: "" }));
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({
            kind: "validation",
        });
    });

    it("throws validation when tax_number is whitespace-only", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ tax_number: "   " }));
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({
            kind: "validation",
        });
        expect(mockFindByTax).not.toHaveBeenCalled();
    });

    // ── findByTax: 1 eşleşme ─────────────────────────────────────────────────

    it("findByTax 1 match → writes DB, returns contact id", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([makeContact("parasut-abc", "1234567890", null)]);
        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("parasut-abc");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ parasut_contact_id: "parasut-abc" }));
        expect(mockUpdateEq).toHaveBeenCalledWith("id", "cust-1");
        expect(mockCreateContact).not.toHaveBeenCalled();
    });

    it("findByTax 1 match → sets parasut_synced_at", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([makeContact("parasut-abc", "1234567890", null)]);
        await serviceEnsureParasutContact("cust-1");
        const updateArgs = mockUpdate.mock.calls[0][0];
        expect(typeof updateArgs.parasut_synced_at).toBe("string");
    });

    it("findByTax 1 match: DB write error → throws", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([makeContact("parasut-abc", "1234567890", null)]);
        mockUpdateEq.mockImplementationOnce(() => makeEqResult({ message: "connection lost" }));
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toThrow("connection lost");
    });

    // ── findByTax: >1 eşleşme ─────────────────────────────────────────────────

    it("findByTax >1 match → validation error", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([
            makeContact("c1", "1234567890", null),
            makeContact("c2", "1234567890", null),
        ]);
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({
            kind: "validation",
        });
        expect(mockCreateContact).not.toHaveBeenCalled();
    });

    // ── findByTax: 0 eşleşme → email fallback ────────────────────────────────

    it("0 tax match + no email → createContact without email, returns id", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        const newContact = makeContact("new-id", "1234567890", null);
        mockCreateContact.mockResolvedValue(newContact);
        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("new-id");
        expect(mockCreateContact).toHaveBeenCalledWith(expect.not.objectContaining({ email: expect.anything() }));
        expect(mockFindByEmail).not.toHaveBeenCalled();
    });

    it("0 tax match + no email → writes parasut_contact_id to DB", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", null));
        await serviceEnsureParasutContact("cust-1");
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ parasut_contact_id: "new-id" }));
    });

    it("0 tax match + no email: claim wins → createContact called, real id written", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", null));

        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("new-id");
        expect(mockCreateContact).toHaveBeenCalledOnce();
    });

    it("0 tax match + no email: claim fails, winner found → returns winner without createContact", async () => {
        // initial read: no contact
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer({ email: null }));
        // claimOrSkip re-read: another caller already finished and set real ID
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer({ parasut_contact_id: "winner-id" }));
        mockFindByTax.mockResolvedValue([]);
        // Claim fails (conditional update wrote 0 rows)
        mockSelectFn.mockResolvedValueOnce({ data: [], error: null });

        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("winner-id");
        expect(mockCreateContact).not.toHaveBeenCalled();
        expect(mockGetCustomerById).toHaveBeenCalledTimes(2);
    });

    it("0 tax match + no email: claim fails, other worker holds active lease → throws retryable", async () => {
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer({ email: null }));
        // claimOrSkip re-read: parasut_contact_id still null (winner not done yet; lease is active)
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        mockSelectFn.mockResolvedValueOnce({ data: [], error: null });

        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({ kind: "server" });
        expect(mockCreateContact).not.toHaveBeenCalled();
    });

    it("0 tax match + no email: claim DB error → throws", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        mockSelectFn.mockResolvedValueOnce({ data: null, error: { message: "DB unavailable" } });

        await expect(serviceEnsureParasutContact("cust-1")).rejects.toThrow("DB unavailable");
        expect(mockCreateContact).not.toHaveBeenCalled();
    });

    it("0 tax match + no email: finishCreate DB error → releases lease, rethrows", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", null));
        // 1st select call (claimOrSkip .or().select()): claim wins
        // 2nd select call (finishCreate .eq(owner).select()): DB error
        mockSelectFn
            .mockResolvedValueOnce({ data: [{ id: "x" }], error: null })
            .mockResolvedValueOnce({ data: null, error: { message: "write failed" } });

        await expect(serviceEnsureParasutContact("cust-1")).rejects.toThrow("write failed");
        // claim .eq() + finishCreate .eq() + releaseCreate .eq() = 3
        expect(mockUpdateEq).toHaveBeenCalledTimes(3);
    });

    it("0 tax match + no email: finishCreate lease lost → throws ParasutError server, releases lease", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", null));
        // 1st select (claim wins), 2nd select (finishCreate: 0 rows = lease lost)
        mockSelectFn
            .mockResolvedValueOnce({ data: [{ id: "x" }], error: null })
            .mockResolvedValueOnce({ data: [], error: null });

        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({ kind: "server" });
        expect(mockUpdateEq).toHaveBeenCalledTimes(3);
    });

    // ── email fallback: 0 eşleşme ────────────────────────────────────────────

    it("0 tax + 0 email match → createContact with email, returns id", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([]);
        const newContact = makeContact("new-id", "1234567890", "test@example.com");
        mockCreateContact.mockResolvedValue(newContact);
        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("new-id");
        expect(mockCreateContact).toHaveBeenCalledWith(expect.objectContaining({
            name:       "Test Müşteri",
            tax_number: "1234567890",
            email:      "test@example.com",
        }));
    });

    it("0 tax + 0 email: claim wins → createContact called, real id written", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", "test@example.com"));

        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("new-id");
        expect(mockCreateContact).toHaveBeenCalledOnce();
    });

    it("0 tax + 0 email: claim fails, winner found → returns winner without createContact", async () => {
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer());
        // claimOrSkip re-read: another caller already finished
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer({ parasut_contact_id: "winner-id" }));
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([]);
        mockSelectFn.mockResolvedValueOnce({ data: [], error: null });

        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("winner-id");
        expect(mockCreateContact).not.toHaveBeenCalled();
        expect(mockGetCustomerById).toHaveBeenCalledTimes(2);
    });

    it("0 tax + 0 email: claim fails, other worker holds active lease → throws retryable", async () => {
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer());
        // claimOrSkip re-read: no winner yet (active lease held by another worker)
        mockGetCustomerById.mockResolvedValueOnce(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([]);
        mockSelectFn.mockResolvedValueOnce({ data: [], error: null });

        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({ kind: "server" });
        expect(mockCreateContact).not.toHaveBeenCalled();
    });

    // ── email fallback: >1 eşleşme ───────────────────────────────────────────

    it("0 tax + >1 email match → validation error", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([
            makeContact("e1", null, "test@example.com"),
            makeContact("e2", null, "test@example.com"),
        ]);
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({
            kind: "validation",
        });
        expect(mockCreateContact).not.toHaveBeenCalled();
    });

    // ── email fallback: 1 eşleşme, tax_number null ───────────────────────────

    it("email match with null tax_number → updateContact + writes DB", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([makeContact("email-id", null, "test@example.com")]);
        mockUpdateContact.mockResolvedValue(makeContact("email-id", "1234567890", "test@example.com"));
        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("email-id");
        expect(mockUpdateContact).toHaveBeenCalledWith("email-id", { tax_number: "1234567890" });
        expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ parasut_contact_id: "email-id" }));
    });

    it("email match with empty string tax_number → updateContact + writes DB", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([makeContact("email-id", "", "test@example.com")]);
        mockUpdateContact.mockResolvedValue(makeContact("email-id", "1234567890", "test@example.com"));
        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("email-id");
        expect(mockUpdateContact).toHaveBeenCalledWith("email-id", { tax_number: "1234567890" });
    });

    it("email match with same tax_number → updateContact + writes DB", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([makeContact("email-id", "1234567890", "test@example.com")]);
        mockUpdateContact.mockResolvedValue(makeContact("email-id", "1234567890", "test@example.com"));
        const result = await serviceEnsureParasutContact("cust-1");
        expect(result).toBe("email-id");
        expect(mockUpdateContact).toHaveBeenCalledOnce();
    });

    it("email match (find path): DB write error → throws", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([makeContact("email-id", null, "test@example.com")]);
        mockUpdateContact.mockResolvedValue(makeContact("email-id", "1234567890", "test@example.com"));
        mockUpdateEq.mockImplementationOnce(() => makeEqResult({ message: "write failed" }));
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toThrow("write failed");
    });

    // ── email fallback: 1 eşleşme, farklı tax_number ─────────────────────────

    it("email match with different tax_number → validation error, no update", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([]);
        mockFindByEmail.mockResolvedValue([makeContact("email-id", "9999999999", "test@example.com")]);
        await expect(serviceEnsureParasutContact("cust-1")).rejects.toMatchObject({
            kind: "validation",
        });
        expect(mockUpdateContact).not.toHaveBeenCalled();
        expect(mockUpdate).not.toHaveBeenCalled();
    });

    // ── DB write details ─────────────────────────────────────────────────────

    it("DB write always uses .eq('id', customerId)", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer());
        mockFindByTax.mockResolvedValue([makeContact("c1", "1234567890", null)]);
        await serviceEnsureParasutContact("cust-1");
        expect(mockUpdateEq).toHaveBeenCalledWith("id", "cust-1");
    });

    it("createContact passes tax_office when present", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null }));
        mockFindByTax.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", null));
        await serviceEnsureParasutContact("cust-1");
        expect(mockCreateContact).toHaveBeenCalledWith(expect.objectContaining({ tax_office: "Istanbul" }));
    });

    it("createContact omits tax_office when null", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null, tax_office: null }));
        mockFindByTax.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", null));
        await serviceEnsureParasutContact("cust-1");
        const callArgs = mockCreateContact.mock.calls[0][0];
        expect(callArgs.tax_office).toBeUndefined();
    });

    it("createContact uses trimmed tax_number (not raw value)", async () => {
        mockGetCustomerById.mockResolvedValue(makeCustomer({ email: null, tax_number: "  1234567890  " }));
        mockFindByTax.mockResolvedValue([]);
        mockCreateContact.mockResolvedValue(makeContact("new-id", "1234567890", null));
        await serviceEnsureParasutContact("cust-1");
        expect(mockCreateContact).toHaveBeenCalledWith(expect.objectContaining({ tax_number: "1234567890" }));
        expect(mockFindByTax).toHaveBeenCalledWith("1234567890");
    });
});
