/**
 * AI Guardrails — domain-rules §11, ai-strategy §12
 *
 * G1: Input sanitization    — strip hostile chars before they reach the AI prompt
 * G2: Confidence clamp      — AI confidence always in [0, 1], NaN → 0.5
 * G3: High risk needs reason — enforced in ai-service.ts → parseScoreResponse()
 * G4: No silent mutation    — AI writes only advisory fields; operational truth is untouched
 */

/**
 * G1 — Strips zero-width chars (U+200B–U+200D, U+FEFF), bidi-override chars
 * (U+202A–U+202E), and C0 control characters (except \t \n \r) from a string
 * before it reaches the AI prompt. Truncates at maxLen (default 4096).
 */
export function sanitizeAiInput(value: string, maxLen = 4096): string {
    return value
        .replace(/[\u200B-\u200D\uFEFF\u202A-\u202E]/g, "")         // zero-width + bidi override
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")    // C0 control chars (keep \t \n \r)
        .slice(0, maxLen);
}

/**
 * G1 — Applies sanitizeAiInput to every string value in a row record.
 * Keys are preserved; non-string values are left untouched.
 */
export function sanitizeAiInputRecord(row: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, sanitizeAiInput(v)])
    ) as Record<string, string>;
}

/**
 * G2 — Clamps an AI-returned confidence value to [0, 1].
 * NaN or any non-number value returns 0.5 (neutral fallback).
 */
export function clampConfidence(value: unknown): number {
    if (typeof value !== "number" || isNaN(value)) return 0.5;
    return Math.min(1, Math.max(0, value));
}

/**
 * Output safety — Strips C0 control characters from AI-generated text and
 * truncates to maxLen. Non-string input returns "".
 */
export function sanitizeAiOutput(value: unknown, maxLen: number): string {
    if (typeof value !== "string") return "";
    return value
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
        .slice(0, maxLen);
}

/**
 * Output safety — Ensures an AI-returned string array respects a count cap.
 * Non-array input returns []. Non-string items are filtered out.
 * Each surviving item is truncated to 300 characters.
 */
export function capAiStringArray(arr: unknown, maxCount: number): string[] {
    if (!Array.isArray(arr)) return [];
    return arr
        .filter((item): item is string => typeof item === "string")
        .slice(0, maxCount)
        .map(item => item.slice(0, 300));
}
