/**
 * Faz 3a — DropZone pure helpers (validateClassifyUpload, pickAcceptForMime, formatBytes)
 */
import { describe, it, expect } from "vitest";
import {
    validateClassifyUpload,
    pickAcceptForMime,
    formatBytes,
} from "@/lib/import-file-helpers";

function makeFile(name: string, type: string, size: number): File {
    return new File([new Uint8Array(size)], name, { type });
}

describe("validateClassifyUpload", () => {
    it("accepts a valid PDF under 10MB", () => {
        const f = makeFile("a.pdf", "application/pdf", 1024);
        expect(validateClassifyUpload(f)).toEqual({ ok: true });
    });

    it("accepts a valid Excel xlsx", () => {
        const f = makeFile(
            "stok.xlsx",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            500,
        );
        expect(validateClassifyUpload(f).ok).toBe(true);
    });

    it("rejects empty file", () => {
        const f = makeFile("empty.pdf", "application/pdf", 0);
        const r = validateClassifyUpload(f);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/boş/);
    });

    it("rejects file > 10MB", () => {
        const f = makeFile("big.pdf", "application/pdf", 11 * 1024 * 1024);
        const r = validateClassifyUpload(f);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/10 MB sınırını/);
    });

    it("rejects disallowed MIME (zip)", () => {
        const f = makeFile("x.zip", "application/zip", 100);
        const r = validateClassifyUpload(f);
        expect(r.ok).toBe(false);
        expect(r.reason).toMatch(/Desteklenmeyen/);
    });

    it("rejects empty MIME string", () => {
        const f = makeFile("x.bin", "", 100);
        const r = validateClassifyUpload(f);
        expect(r.ok).toBe(false);
    });
});

describe("pickAcceptForMime", () => {
    it("returns mime for whitelist values", () => {
        expect(pickAcceptForMime("application/pdf")).toBe("application/pdf");
        expect(pickAcceptForMime("image/png")).toBe("image/png");
    });
    it("returns null for non-whitelist", () => {
        expect(pickAcceptForMime("application/zip")).toBeNull();
    });
});

describe("formatBytes", () => {
    it("formats B / KB / MB", () => {
        expect(formatBytes(500)).toBe("500 B");
        expect(formatBytes(2048)).toBe("2.0 KB");
        expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
    });
    it("returns dash for invalid", () => {
        expect(formatBytes(NaN)).toBe("—");
        expect(formatBytes(-1)).toBe("—");
    });
});
