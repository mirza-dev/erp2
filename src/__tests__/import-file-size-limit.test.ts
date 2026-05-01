/**
 * Sprint B G1 — Dosya boyutu limiti (25 MB).
 *
 * Plan kriteri: "26 MB dosya → toast + reject"
 * validateFileSize helper'ı doğrudan test edilir.
 */
import { describe, it, expect } from "vitest";
import { validateFileSize } from "@/app/dashboard/import/page";

const MB = 1024 * 1024;

describe("validateFileSize — 25 MB limit", () => {
    it("24 MB dosya kabul edilir", () => {
        expect(validateFileSize(24 * MB)).toEqual({ ok: true });
    });

    it("tam 25 MB dosya kabul edilir", () => {
        expect(validateFileSize(25 * MB)).toEqual({ ok: true });
    });

    it("25 MB + 1 byte reddedilir", () => {
        const result = validateFileSize(25 * MB + 1);
        expect(result.ok).toBe(false);
        expect(result.sizeMb).toBeDefined();
    });

    it("26 MB dosya reddedilir ve MB değeri string olarak dönür", () => {
        const result = validateFileSize(26 * MB);
        expect(result.ok).toBe(false);
        expect(result.sizeMb).toBe("26.0");
    });

    it("0 byte dosya kabul edilir (sınır testi)", () => {
        expect(validateFileSize(0)).toEqual({ ok: true });
    });

    it("30 MB dosya reddedilir", () => {
        const result = validateFileSize(30 * MB);
        expect(result.ok).toBe(false);
        expect(result.sizeMb).toBe("30.0");
    });
});
