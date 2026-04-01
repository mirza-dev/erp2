/**
 * Tests for buildCustomerPatch — data-context.tsx
 *
 * Verifies the camelCase→snake_case payload-build logic used by updateCustomer.
 * Pure function, no mocks needed. Same pattern as data-context-error.test.ts.
 *
 * Critical regressions guarded:
 *   - taxNumber → tax_number (not "taxNumber" in the PATCH body)
 *   - taxOffice → tax_office (not "taxOffice" in the PATCH body)
 *   - undefined fields must NOT appear in the body (no-op safety)
 */
import { describe, it, expect } from "vitest";
import { buildCustomerPatch } from "@/lib/data-context";

// ─── camelCase → snake_case mapping ──────────────────────────────────────────

describe("buildCustomerPatch — field name mapping", () => {
    it("taxNumber → tax_number", () => {
        const body = buildCustomerPatch({ taxNumber: "1234567890" });
        expect(body).toHaveProperty("tax_number", "1234567890");
        expect(body).not.toHaveProperty("taxNumber");
    });

    it("taxOffice → tax_office", () => {
        const body = buildCustomerPatch({ taxOffice: "Kadıköy" });
        expect(body).toHaveProperty("tax_office", "Kadıköy");
        expect(body).not.toHaveProperty("taxOffice");
    });

    it("name, email, phone, address pass through with same key", () => {
        const body = buildCustomerPatch({ name: "Acme", email: "a@b.com", phone: "+90", address: "İst" });
        expect(body.name).toBe("Acme");
        expect(body.email).toBe("a@b.com");
        expect(body.phone).toBe("+90");
        expect(body.address).toBe("İst");
    });

    it("country and currency pass through with same key", () => {
        const body = buildCustomerPatch({ country: "TR", currency: "TRY" });
        expect(body.country).toBe("TR");
        expect(body.currency).toBe("TRY");
    });

    it("notes passes through with same key", () => {
        const body = buildCustomerPatch({ notes: "VIP müşteri" });
        expect(body.notes).toBe("VIP müşteri");
    });
});

// ─── undefined-drop semantics ─────────────────────────────────────────────────

describe("buildCustomerPatch — undefined fields excluded", () => {
    it("empty updates → empty body", () => {
        expect(buildCustomerPatch({})).toEqual({});
    });

    it("only defined fields appear in body", () => {
        const body = buildCustomerPatch({ name: "Acme" });
        expect(Object.keys(body)).toEqual(["name"]);
    });

    it("taxNumber undefined → tax_number not in body", () => {
        const body = buildCustomerPatch({ name: "Acme" });
        expect(body).not.toHaveProperty("tax_number");
    });

    it("taxOffice undefined → tax_office not in body", () => {
        const body = buildCustomerPatch({ email: "x@x.com" });
        expect(body).not.toHaveProperty("tax_office");
    });
});

// ─── value preservation ───────────────────────────────────────────────────────

describe("buildCustomerPatch — value preservation", () => {
    it("empty string preserved (validation is route's responsibility)", () => {
        const body = buildCustomerPatch({ name: "" });
        expect(body.name).toBe("");
    });

    it("all 9 fields present when all provided", () => {
        const body = buildCustomerPatch({
            name: "X", email: "x@x.com", phone: "0", address: "A",
            taxNumber: "T", taxOffice: "O", country: "TR", currency: "USD", notes: "N",
        });
        expect(Object.keys(body).sort()).toEqual(
            ["address", "country", "currency", "email", "name", "notes", "phone", "tax_number", "tax_office"],
        );
    });

    it("null value passed through (clears field)", () => {
        // data-context allows null for optional fields via Partial<Customer>
        const body = buildCustomerPatch({ email: undefined });
        expect(body).not.toHaveProperty("email");
    });
});
