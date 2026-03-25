/**
 * Tests for parseScoreResponse — pure function, no mocks needed.
 * Verifies regex parsing contract independent of AI model wording.
 */
import { describe, it, expect } from "vitest";
import { parseScoreResponse } from "@/lib/services/ai-service";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const LOW_RISK = `CONFIDENCE: 0.92\nRISK_LEVEL: low\nREASON: Bilinen müşteri, standart sipariş, tüm bilgiler eksiksiz`;
const MEDIUM_RISK = `CONFIDENCE: 0.68\nRISK_LEVEL: medium\nREASON: Büyük sipariş tutarı fakat not alanı boş`;
const HIGH_RISK = `CONFIDENCE: 0.45\nRISK_LEVEL: high\nREASON: Bilinmeyen müşteri, alışılmadık para birimi, yüksek iskonto`;
const GARBLED = `Sorry, I cannot process this request.`;
const PARTIAL = `CONFIDENCE: 0.6\nREASON: Kısmi veri`; // RISK_LEVEL eksik

const ALL_FIXTURES = [
    { label: "LOW_RISK", text: LOW_RISK },
    { label: "MEDIUM_RISK", text: MEDIUM_RISK },
    { label: "HIGH_RISK", text: HIGH_RISK },
    { label: "GARBLED", text: GARBLED },
    { label: "PARTIAL", text: PARTIAL },
];

// ── CONFIDENCE extraction ────────────────────────────────────────────────────

describe("parseScoreResponse — CONFIDENCE extraction", () => {
    it("extracts float from 'CONFIDENCE: 0.85'", () => {
        const result = parseScoreResponse("CONFIDENCE: 0.85\nRISK_LEVEL: low\nREASON: ok");
        expect(result.confidence).toBe(0.85);
    });

    it("defaults to 0.5 when CONFIDENCE line missing", () => {
        const result = parseScoreResponse("RISK_LEVEL: low\nREASON: ok");
        expect(result.confidence).toBe(0.5);
    });

    it("handles boundary: 1.0", () => {
        const result = parseScoreResponse("CONFIDENCE: 1.0\nRISK_LEVEL: low\nREASON: ok");
        expect(result.confidence).toBe(1.0);
    });

    it("handles boundary: 0", () => {
        const result = parseScoreResponse("CONFIDENCE: 0\nRISK_LEVEL: high\nREASON: ok");
        expect(result.confidence).toBe(0);
    });

    it("case-insensitive: 'confidence: 0.75'", () => {
        const result = parseScoreResponse("confidence: 0.75\nRISK_LEVEL: low\nREASON: ok");
        expect(result.confidence).toBe(0.75);
    });
});

// ── RISK_LEVEL extraction ────────────────────────────────────────────────────

describe("parseScoreResponse — RISK_LEVEL extraction", () => {
    it("extracts 'low' from 'RISK_LEVEL: low'", () => {
        expect(parseScoreResponse(LOW_RISK).risk_level).toBe("low");
    });

    it("extracts 'medium' from 'RISK_LEVEL: medium'", () => {
        expect(parseScoreResponse(MEDIUM_RISK).risk_level).toBe("medium");
    });

    it("extracts 'high' from 'RISK_LEVEL: high'", () => {
        expect(parseScoreResponse(HIGH_RISK).risk_level).toBe("high");
    });

    it("defaults to 'medium' when RISK_LEVEL missing", () => {
        expect(parseScoreResponse(GARBLED).risk_level).toBe("medium");
    });

    it("case-insensitive: 'risk_level: HIGH' → 'high'", () => {
        const result = parseScoreResponse("CONFIDENCE: 0.9\nrisk_level: HIGH\nREASON: ok");
        expect(result.risk_level).toBe("high");
    });

    it("result is always 'low' | 'medium' | 'high'", () => {
        const result = parseScoreResponse(PARTIAL);
        expect(["low", "medium", "high"]).toContain(result.risk_level);
    });
});

// ── REASON extraction ────────────────────────────────────────────────────────

describe("parseScoreResponse — REASON extraction", () => {
    it("extracts reason text", () => {
        const result = parseScoreResponse(LOW_RISK);
        expect(result.reason).toBe("Bilinen müşteri, standart sipariş, tüm bilgiler eksiksiz");
    });

    it("trims whitespace", () => {
        const result = parseScoreResponse("CONFIDENCE: 0.8\nRISK_LEVEL: low\nREASON:   spaces around   ");
        expect(result.reason).toBe("spaces around");
    });

    it("defaults to '' when REASON missing", () => {
        const result = parseScoreResponse(GARBLED);
        expect(result.reason).toBe("");
    });
});

// ── Output contract ──────────────────────────────────────────────────────────

describe("parseScoreResponse — output contract", () => {
    it.each(ALL_FIXTURES)("always returns { confidence, risk_level, reason } — $label", ({ text }) => {
        const result = parseScoreResponse(text);
        expect(result).toHaveProperty("confidence");
        expect(result).toHaveProperty("risk_level");
        expect(result).toHaveProperty("reason");
    });

    it.each(ALL_FIXTURES)("confidence is number — $label", ({ text }) => {
        expect(typeof parseScoreResponse(text).confidence).toBe("number");
    });

    it.each(ALL_FIXTURES)("risk_level matches /^(low|medium|high)$/ — $label", ({ text }) => {
        expect(parseScoreResponse(text).risk_level).toMatch(/^(low|medium|high)$/);
    });

    it.each(ALL_FIXTURES)("reason is string — $label", ({ text }) => {
        expect(typeof parseScoreResponse(text).reason).toBe("string");
    });
});
