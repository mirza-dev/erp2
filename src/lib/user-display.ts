function firstChars(value: string, count: number): string {
    return Array.from(value.trim()).slice(0, count).join("");
}

function initialsFromParts(parts: string[]): string | null {
    const clean = parts.map(p => p.trim()).filter(Boolean);
    if (clean.length === 0) return null;
    if (clean.length === 1) return firstChars(clean[0], 2).toLocaleUpperCase("tr-TR");
    return `${firstChars(clean[0], 1)}${firstChars(clean[clean.length - 1], 1)}`.toLocaleUpperCase("tr-TR");
}

export function getUserInitials(fullName?: string | null, email?: string | null): string {
    const nameInitials = initialsFromParts((fullName ?? "").split(/\s+/));
    if (nameInitials) return nameInitials;

    const emailLocalPart = (email ?? "").split("@")[0] ?? "";
    const emailInitials = initialsFromParts(emailLocalPart.split(/[._\-\s]+/));
    return emailInitials || "?";
}
