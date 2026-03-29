/**
 * Tests for parseAIResponse — §11.3 explainability contract.
 * No AI calls, no mocks — pure function tested with synthetic Claude-style response strings.
 */
import { describe, it, expect } from "vitest";
import { parseAIResponse, parseScoreResponse } from "@/lib/services/ai-service";

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

// ─── G2: parseAIResponse confidence clamp ────────────────────────────────────

describe("parseAIResponse — G2 confidence clamp", () => {
    it("clamps confidence > 1 to 1", () => {
        const r = parseAIResponse(`{"x":1}\nCONFIDENCE: 1.5\nREASON: ok`);
        expect(r.confidence).toBe(1);
    });

    it("negative confidence string (regex misses minus) → 0.5 fallback", () => {
        // Regex [\d.]+ doesn't match minus sign, so -0.2 → no match → clampConfidence(0.5)
        const r = parseAIResponse(`{"x":1}\nCONFIDENCE: -0.2\nREASON: ok`);
        expect(r.confidence).toBe(0.5);
    });

    it("NaN confidence → 0.5", () => {
        const r = parseAIResponse(`{"x":1}\nCONFIDENCE: abc\nREASON: ok`);
        expect(r.confidence).toBe(0.5);
    });

    it("ai_reason truncated at 300 chars", () => {
        const longReason = "x".repeat(400);
        const r = parseAIResponse(`{"x":1}\nCONFIDENCE: 0.8\nREASON: ${longReason}`);
        expect(r.ai_reason.length).toBeLessThanOrEqual(300);
    });
});

// ─── G3: parseScoreResponse — high-risk-needs-reason ─────────────────────────

describe("parseScoreResponse — G3 high-risk-needs-reason", () => {
    it("high risk with reason → stays high", () => {
        const r = parseScoreResponse("CONFIDENCE: 0.9\nRISK_LEVEL: high\nREASON: Eksik bilgi var.");
        expect(r.risk_level).toBe("high");
        expect(r.reason).not.toBe("");
    });

    it("high risk without reason → downgraded to medium", () => {
        const r = parseScoreResponse("CONFIDENCE: 0.9\nRISK_LEVEL: high");
        expect(r.risk_level).toBe("medium");
    });

    it("medium risk without reason → stays medium", () => {
        const r = parseScoreResponse("CONFIDENCE: 0.6\nRISK_LEVEL: medium");
        expect(r.risk_level).toBe("medium");
    });

    it("low risk stays low", () => {
        const r = parseScoreResponse("CONFIDENCE: 0.9\nRISK_LEVEL: low\nREASON: Her şey normal.");
        expect(r.risk_level).toBe("low");
    });

    it("confidence > 1 clamped to 1", () => {
        const r = parseScoreResponse("CONFIDENCE: 2.5\nRISK_LEVEL: low\nREASON: ok");
        expect(r.confidence).toBe(1);
    });

    it("negative confidence string (regex misses minus) → 0.5 fallback", () => {
        // Regex [\d.]+ doesn't capture the minus sign
        const r = parseScoreResponse("CONFIDENCE: -1\nRISK_LEVEL: low\nREASON: ok");
        expect(r.confidence).toBe(0.5);
    });

    it("reason truncated at 400 chars", () => {
        const longReason = "y".repeat(500);
        const r = parseScoreResponse(`CONFIDENCE: 0.8\nRISK_LEVEL: high\nREASON: ${longReason}`);
        expect(r.reason.length).toBeLessThanOrEqual(400);
        expect(r.risk_level).toBe("high");
    });

    it("unknown risk_level → medium fallback", () => {
        const r = parseScoreResponse("CONFIDENCE: 0.7\nRISK_LEVEL: extreme\nREASON: ok");
        expect(r.risk_level).toBe("medium");
    });

    it("missing RISK_LEVEL line → medium", () => {
        const r = parseScoreResponse("CONFIDENCE: 0.7\nREASON: ok");
        expect(r.risk_level).toBe("medium");
    });

    it("always returns all three keys", () => {
        const r = parseScoreResponse("");
        expect(r).toHaveProperty("confidence");
        expect(r).toHaveProperty("risk_level");
        expect(r).toHaveProperty("reason");
        expect(typeof r.confidence).toBe("number");
        expect(typeof r.risk_level).toBe("string");
        expect(typeof r.reason).toBe("string");
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
