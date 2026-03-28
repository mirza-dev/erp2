/**
 * Eval helpers — pure structural scoring utilities.
 * No vitest dependency. Plain TypeScript.
 * Used by eval-runner.test.ts and fixture-level tests.
 */

export interface EvalResult {
    pass: boolean;
    check: string;
    actual: unknown;
    expected: unknown;
    message?: string;
}

/**
 * Checks that a confidence value falls within [min, max].
 * Both bounds are inclusive. Defaults: min=0, max=1.
 */
export function checkConfidenceRange(
    actual: number,
    { min = 0, max = 1 }: { min?: number; max?: number } = {},
): EvalResult {
    const pass = actual >= min && actual <= max;
    return {
        pass,
        check: "confidence_range",
        actual,
        expected: { min, max },
        message: pass
            ? undefined
            : `confidence ${actual} is outside [${min}, ${max}]`,
    };
}

/**
 * Checks that `actual` equals `expected` and that `expected` is in `validValues`.
 */
export function checkCategory<T extends string>(
    actual: T,
    expected: T,
    validValues: readonly T[],
): EvalResult {
    const isValid = validValues.includes(actual);
    const matches = actual === expected;
    const pass = isValid && matches;
    return {
        pass,
        check: "category",
        actual,
        expected,
        message: pass
            ? undefined
            : !isValid
                ? `"${actual}" is not a valid category (valid: ${validValues.join(", ")})`
                : `expected "${expected}", got "${actual}"`,
    };
}

/**
 * Checks that `obj` has all required keys and (optionally) correct types.
 * typeChecks: { fieldName: "string" | "number" | "array" }
 */
export function checkRequiredKeys(
    obj: Record<string, unknown>,
    keys: string[],
    typeChecks?: Record<string, "string" | "number" | "array">,
): EvalResult {
    const missing: string[] = [];
    const typeMismatches: string[] = [];

    for (const key of keys) {
        if (!(key in obj)) {
            missing.push(key);
            continue;
        }
        if (typeChecks && key in typeChecks) {
            const expected = typeChecks[key];
            const value = obj[key];
            const ok =
                expected === "array"
                    ? Array.isArray(value)
                    : typeof value === expected;
            if (!ok) {
                typeMismatches.push(
                    `${key}: expected ${expected}, got ${Array.isArray(value) ? "array" : typeof value}`,
                );
            }
        }
    }

    const pass = missing.length === 0 && typeMismatches.length === 0;
    return {
        pass,
        check: "required_keys",
        actual: Object.keys(obj),
        expected: keys,
        message: pass
            ? undefined
            : [
                missing.length > 0 ? `missing keys: ${missing.join(", ")}` : null,
                typeMismatches.length > 0 ? `type mismatches: ${typeMismatches.join("; ")}` : null,
            ]
                .filter(Boolean)
                .join(" | "),
    };
}

/**
 * Checks that an array has length within [min, max].
 * Both bounds are inclusive.
 */
export function checkArrayBounds(
    arr: unknown[],
    { min, max }: { min?: number; max?: number } = {},
): EvalResult {
    const len = arr.length;
    const tooShort = min !== undefined && len < min;
    const tooLong = max !== undefined && len > max;
    const pass = !tooShort && !tooLong;
    return {
        pass,
        check: "array_bounds",
        actual: len,
        expected: { min, max },
        message: pass
            ? undefined
            : tooShort
                ? `array length ${len} < min ${min}`
                : `array length ${len} > max ${max}`,
    };
}

/**
 * Returns true if `dateString` is a valid ISO 8601 datetime string.
 * Reusable DRY version of the isValidISO helper in individual test files.
 */
export function isValidISO(dateString: string): boolean {
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && dateString.includes("T");
}

/**
 * Returns true if `value` is a number in the normalized [0, 1] range.
 */
export function isNormalizedConfidence(value: unknown): boolean {
    return typeof value === "number" && value >= 0 && value <= 1;
}
