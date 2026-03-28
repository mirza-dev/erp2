/** Anthropic SDK mockCreate'nin döneceği response şeklini üretir. */
export function makeTextResponse(text: string) {
    return { content: [{ type: "text", text }] };
}

/** ISO 8601 datetime string doğrulayıcı. */
export function isValidISO(dateString: string): boolean {
    const d = new Date(dateString);
    return !isNaN(d.getTime()) && dateString.includes("T");
}
