/**
 * Tests for parseAIResponse — §11.3 explainability contract.
 * No AI calls, no mocks — pure function tested with synthetic Claude-style response strings.
 */
import { describe, it, expect } from "vitest";
import { parseAIResponse } from "@/lib/services/ai-service";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FULL_RESPONSE = `{"name": "Acme Vana", "email": "acme@example.com", "country": "TR", "currency": "TRY"}
CONFIDENCE: 0.92
REASON: All required fields extracted from structured row data
UNMATCHED: notlar, adres`;

const ORDER_RESPONSE = `{"customer_name": "Beta Corp", "currency": "USD", "grand_total": 12000, "lines": [{"product_name": "Vana DN50", "quantity": 5, "unit_price": 2400}]}
CONFIDENCE: 0.78
REASON: Customer and total mapped; lines inferred
UNMATCHED: `;

const NO_ANNOTATIONS_RESPONSE = `{"sku": "GV-050", "name": "Gate Valve"}`;

const GARBLED_RESPONSE = `This is plain text with no JSON or annotations.`;

const MALFORMED_JSON_RESPONSE = `{name: "broken", email }
CONFIDENCE: 0.6
REASON: Could not parse
UNMATCHED: email`;

// ─── JSON extraction ─────────────────────────────────────────────────────────

describe("parseAIResponse — JSON extraction", () => {
    it("extracts valid JSON object into parsed_data", () => {
        const result = parseAIResponse(FULL_RESPONSE);
        expect(result.parsed_data).toEqual({
            name: "Acme Vana",
            email: "acme@example.com",
            country: "TR",
            currency: "TRY",
        });
    });

    it("returns empty object for parsed_data when JSON is malformed", () => {
        const result = parseAIResponse(MALFORMED_JSON_RESPONSE);
        expect(result.parsed_data).toEqual({});
    });

    it("returns empty object for parsed_data when no JSON is present", () => {
        const result = parseAIResponse(GARBLED_RESPONSE);
        expect(result.parsed_data).toEqual({});
    });

    it("correctly parses nested JSON with arrays (order lines)", () => {
        const result = parseAIResponse(ORDER_RESPONSE);
        expect(result.parsed_data).toMatchObject({
            customer_name: "Beta Corp",
            currency: "USD",
            grand_total: 12000,
        });
        expect(Array.isArray((result.parsed_data as Record<string, unknown>).lines)).toBe(true);
    });
});

// ─── Confidence extraction ───────────────────────────────────────────────────

describe("parseAIResponse — confidence extraction", () => {
    it("extracts float confidence from 'CONFIDENCE: 0.92' line", () => {
        expect(parseAIResponse(FULL_RESPONSE).confidence).toBe(0.92);
    });

    it("defaults confidence to 0.5 when CONFIDENCE line is missing", () => {
        expect(parseAIResponse(NO_ANNOTATIONS_RESPONSE).confidence).toBe(0.5);
    });

    it("defaults confidence to 0.5 when response is garbled", () => {
        expect(parseAIResponse(GARBLED_RESPONSE).confidence).toBe(0.5);
    });

    it("parses CONFIDENCE: 1.0 correctly", () => {
        const r = parseAIResponse(`{"x":1}\nCONFIDENCE: 1.0\nREASON: Perfect`);
        expect(r.confidence).toBe(1.0);
    });

    it("parses CONFIDENCE: 0 correctly", () => {
        const r = parseAIResponse(`{"x":1}\nCONFIDENCE: 0\nREASON: Nothing matched`);
        expect(r.confidence).toBe(0);
    });

    it("parses confidence when CONFIDENCE line is lowercase", () => {
        const r = parseAIResponse(`{"x":1}\nconfidence: 0.75\nREASON: ok`);
        expect(r.confidence).toBe(0.75);
    });
});

// ─── Reason extraction ───────────────────────────────────────────────────────

describe("parseAIResponse — reason extraction", () => {
    it("extracts reason text from REASON line", () => {
        const result = parseAIResponse(FULL_RESPONSE);
        expect(typeof result.ai_reason).toBe("string");
        expect(result.ai_reason.length).toBeGreaterThan(0);
    });

    it("returns empty string for ai_reason when REASON line is absent", () => {
        expect(parseAIResponse(NO_ANNOTATIONS_RESPONSE).ai_reason).toBe("");
    });

    it("returns empty string for ai_reason when response is garbled", () => {
        expect(parseAIResponse(GARBLED_RESPONSE).ai_reason).toBe("");
    });
});

// ─── Unmatched fields extraction ─────────────────────────────────────────────

describe("parseAIResponse — unmatched_fields extraction", () => {
    it("extracts comma-separated unmatched fields as string[]", () => {
        const result = parseAIResponse(FULL_RESPONSE);
        expect(result.unmatched_fields).toEqual(["notlar", "adres"]);
    });

    it("returns empty array when UNMATCHED line is absent", () => {
        expect(parseAIResponse(NO_ANNOTATIONS_RESPONSE).unmatched_fields).toEqual([]);
    });

    it("returns empty array when response is garbled", () => {
        expect(parseAIResponse(GARBLED_RESPONSE).unmatched_fields).toEqual([]);
    });

    it("trims whitespace from individual field names", () => {
        const r = parseAIResponse(`{"x":1}\nCONFIDENCE: 0.5\nREASON: ok\nUNMATCHED:  field1 ,  field2 `);
        expect(r.unmatched_fields).toEqual(["field1", "field2"]);
    });
});

// ─── §11.3 Explainability contract ──────────────────────────────────────────

describe("parseAIResponse — §11.3 explainability contract", () => {
    const CASES = [FULL_RESPONSE, ORDER_RESPONSE, NO_ANNOTATIONS_RESPONSE, GARBLED_RESPONSE, MALFORMED_JSON_RESPONSE];

    it.each(CASES)("always returns all four keys regardless of input (%#)", (input) => {
        const result = parseAIResponse(input);
        expect(result).toHaveProperty("parsed_data");
        expect(result).toHaveProperty("confidence");
        expect(result).toHaveProperty("ai_reason");
        expect(result).toHaveProperty("unmatched_fields");
    });

    it.each(CASES)("types are always correct regardless of input (%#)", (input) => {
        const result = parseAIResponse(input);
        expect(typeof result.parsed_data).toBe("object");
        expect(result.parsed_data).not.toBeNull();
        expect(typeof result.confidence).toBe("number");
        expect(typeof result.ai_reason).toBe("string");
        expect(Array.isArray(result.unmatched_fields)).toBe(true);
    });
});
