/**
 * AI Guardrails — domain-rules §11, ai-strategy §12
 *
 * G1: Input sanitization    — strip hostile chars before they reach the AI prompt
 * G2: Confidence clamp      — AI confidence always in [0, 1], NaN → 0.5
 * G3: High risk needs reason — enforced in ai-service.ts → parseScoreResponse()
 * G4: No silent mutation    — AI writes only advisory fields; operational truth is untouched
 */

// U+2028 / U+2029 are JavaScript line terminators; including them as literal
// chars inside a regex literal terminates the regex prematurely. All regexes
// in this file that need to span the C0 control range are built via the
// RegExp constructor with escape sequences, which is consistent across all
// our sanitize functions and resilient to source-encoding accidents.

const ZERO_WIDTH_AND_BIDI_RE = new RegExp(
    "[\\u200B-\\u200D\\uFEFF\\u202A-\\u202E]",
    "g",
);
const C0_CONTROL_RE = new RegExp(
    "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]",
    "g",
);
const FEEDBACK_STEP1_RE = new RegExp(
    "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u2028\\u2029]",
    "g",
);

/**
 * G1 — Strips zero-width chars (U+200B–U+200D, U+FEFF), bidi-override chars
 * (U+202A–U+202E), and C0 control characters (except \t \n \r) from a string
 * before it reaches the AI prompt. Truncates at maxLen (default 4096).
 */
export function sanitizeAiInput(value: string, maxLen = 4096): string {
    return value
        .replace(ZERO_WIDTH_AND_BIDI_RE, "")
        .replace(C0_CONTROL_RE, "")
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
        .replace(C0_CONTROL_RE, "")
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

const FEEDBACK_MAX_LEN = 200;

/**
 * G1 — Feedback-specific sanitize. Yalnızca AI prompt input'una giden serbest
 * kullanıcı metni (rejection note) için kullanılır. sanitizeAiInput'tan daha
 * agresif: markdown injection + role marker strip'leri eklenmiştir; o yüzden
 * ürün/vendor isimleri gibi yapısal alanlarda kullanılmamalıdır.
 *
 * Null/undefined → "".
 */
export function sanitizeFeedbackForPrompt(raw: string | null | undefined): string {
    if (raw == null) return "";
    let s = String(raw);
    // 1a. Zero-width + bidi-override → empty. Removing them collapses adversarial joins
    //     (e.g. "syste​m:" → "system:") so step 3's word-boundary \b can match.
    s = s.replace(ZERO_WIDTH_AND_BIDI_RE, "");
    // 1b. C0+DEL+LS+PS → space. Replace with SPACE (not empty) so C0-split joins
    //     cannot collapse into a new role marker after zero-width chars are already gone.
    s = s.replace(FEEDBACK_STEP1_RE, " ");
    // 2. Markdown injection — triple backtick
    s = s.replace(/```/g, "''");
    // 3. Role marker prefix'leri (system:/assistant:/user:) — case-insensitive strip
    s = s.replace(/\b(system|assistant|user)\s*:/gi, "");
    // 4. Whitespace normalize (newlines, tabs ve birden fazla boşluk → tek boşluk)
    s = s.replace(/\s+/g, " ").trim();
    // 5. Length cap (199 char + …, toplam ≤ 200)
    if (s.length > FEEDBACK_MAX_LEN) s = s.slice(0, FEEDBACK_MAX_LEN - 1) + "…";
    return s;
}
