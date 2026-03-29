import { describe, it, expect } from "vitest";
import {
    sanitizeAiInput,
    sanitizeAiInputRecord,
    clampConfidence,
    sanitizeAiOutput,
    capAiStringArray,
} from "@/lib/ai-guards";

// ── sanitizeAiInput ───────────────────────────────────────────

describe("sanitizeAiInput", () => {
    it("strips zero-width chars", () => {
        expect(sanitizeAiInput("hello\u200Bworld")).toBe("helloworld");
        expect(sanitizeAiInput("\u200Chidden\u200D")).toBe("hidden");
        expect(sanitizeAiInput("\uFEFFbom")).toBe("bom");
    });

    it("strips bidi-override chars", () => {
        expect(sanitizeAiInput("a\u202Eb")).toBe("ab");
        expect(sanitizeAiInput("\u202Astart\u202E")).toBe("start");
    });

    it("strips C0 control chars but keeps \\t \\n \\r", () => {
        expect(sanitizeAiInput("a\u0000b")).toBe("ab");
        expect(sanitizeAiInput("a\u0007b")).toBe("ab");          // BEL
        expect(sanitizeAiInput("a\u001Fb")).toBe("ab");          // US
        expect(sanitizeAiInput("a\tb\nc\r")).toBe("a\tb\nc\r");  // kept
    });

    it("truncates at default maxLen (4096)", () => {
        const long = "x".repeat(5000);
        expect(sanitizeAiInput(long)).toHaveLength(4096);
    });

    it("custom maxLen", () => {
        expect(sanitizeAiInput("hello world", 5)).toBe("hello");
    });

    it("passes clean strings through unchanged", () => {
        const clean = "Clean string with spaces 123!";
        expect(sanitizeAiInput(clean)).toBe(clean);
    });

    it("keeps Turkish special chars (ğüşıöç)", () => {
        const turkish = "ğüşıöçĞÜŞİÖÇ";
        expect(sanitizeAiInput(turkish)).toBe(turkish);
    });
});

// ── sanitizeAiInputRecord ─────────────────────────────────────

describe("sanitizeAiInputRecord", () => {
    it("sanitizes every value in the record", () => {
        const row = { a: "clean", b: "bad\u200Bval", c: "ctrl\u0007char" };
        const result = sanitizeAiInputRecord(row);
        expect(result.a).toBe("clean");
        expect(result.b).toBe("badval");
        expect(result.c).toBe("ctrlchar");
    });

    it("preserves keys", () => {
        const row = { name: "Acme", email: "a@b.com" };
        expect(Object.keys(sanitizeAiInputRecord(row))).toEqual(["name", "email"]);
    });
});

// ── clampConfidence ───────────────────────────────────────────

describe("clampConfidence", () => {
    it("returns value in [0,1] unchanged", () => {
        expect(clampConfidence(0)).toBe(0);
        expect(clampConfidence(0.5)).toBe(0.5);
        expect(clampConfidence(1)).toBe(1);
    });

    it("clamps > 1 to 1", () => {
        expect(clampConfidence(1.5)).toBe(1);
        expect(clampConfidence(99)).toBe(1);
    });

    it("clamps < 0 to 0", () => {
        expect(clampConfidence(-0.1)).toBe(0);
        expect(clampConfidence(-99)).toBe(0);
    });

    it("NaN → 0.5", () => {
        expect(clampConfidence(NaN)).toBe(0.5);
    });

    it("non-number → 0.5", () => {
        expect(clampConfidence("0.8")).toBe(0.5);
        expect(clampConfidence(null)).toBe(0.5);
        expect(clampConfidence(undefined)).toBe(0.5);
        expect(clampConfidence({})).toBe(0.5);
    });
});

// ── sanitizeAiOutput ──────────────────────────────────────────

describe("sanitizeAiOutput", () => {
    it("strips C0 control chars", () => {
        expect(sanitizeAiOutput("hello\u0000world", 100)).toBe("helloworld");
        expect(sanitizeAiOutput("a\u001Fb", 100)).toBe("ab");
    });

    it("truncates at maxLen", () => {
        expect(sanitizeAiOutput("hello world", 5)).toBe("hello");
    });

    it("non-string → empty string", () => {
        expect(sanitizeAiOutput(null, 100)).toBe("");
        expect(sanitizeAiOutput(42, 100)).toBe("");
        expect(sanitizeAiOutput(undefined, 100)).toBe("");
        expect(sanitizeAiOutput([], 100)).toBe("");
    });
});

// ── capAiStringArray ──────────────────────────────────────────

describe("capAiStringArray", () => {
    it("non-array → []", () => {
        expect(capAiStringArray(null, 5)).toEqual([]);
        expect(capAiStringArray("string", 5)).toEqual([]);
        expect(capAiStringArray(42, 5)).toEqual([]);
    });

    it("respects maxCount", () => {
        const arr = ["a", "b", "c", "d", "e", "f"];
        expect(capAiStringArray(arr, 3)).toHaveLength(3);
        expect(capAiStringArray(arr, 3)).toEqual(["a", "b", "c"]);
    });

    it("filters non-string items", () => {
        const arr = ["ok", 42, null, "also ok", true];
        expect(capAiStringArray(arr, 10)).toEqual(["ok", "also ok"]);
    });

    it("each item truncated to 300 chars", () => {
        const long = "x".repeat(400);
        const result = capAiStringArray([long], 5);
        expect(result[0]).toHaveLength(300);
    });
});
