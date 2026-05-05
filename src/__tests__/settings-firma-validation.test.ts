/**
 * Settings — Firma form validation helpers
 */
import { describe, it, expect } from "vitest";
import { isValidEmail, isValidTaxNumber, isValidUrl, EMAIL_RE } from "@/lib/validation";

describe("isValidEmail / EMAIL_RE", () => {
    it("standart e-posta → true", () => {
        expect(isValidEmail("user@example.com")).toBe(true);
        expect(isValidEmail("info@pmt.com.tr")).toBe(true);
        expect(isValidEmail("a.b+c@domain.co.uk")).toBe(true);
    });

    it("boş, @ yok, alan adı yok → false", () => {
        expect(isValidEmail("")).toBe(false);
        expect(isValidEmail("noatsign")).toBe(false);
        expect(isValidEmail("@nouser.com")).toBe(false);
        expect(isValidEmail("missing@dotcom")).toBe(false);
        expect(isValidEmail("space @bad.com")).toBe(false);
    });

    it("baş/son boşluk trim'lenir", () => {
        expect(isValidEmail("  user@example.com  ")).toBe(true);
    });

    it("EMAIL_RE export edilir", () => {
        expect(EMAIL_RE).toBeInstanceOf(RegExp);
    });
});

describe("isValidTaxNumber", () => {
    it("10 hane (kurumsal) → true", () => {
        expect(isValidTaxNumber("1234567890")).toBe(true);
        expect(isValidTaxNumber("6440012345")).toBe(true);
    });

    it("11 hane (TC kimlik) → true", () => {
        expect(isValidTaxNumber("12345678901")).toBe(true);
    });

    it("9 veya 12 hane → false", () => {
        expect(isValidTaxNumber("123456789")).toBe(false);
        expect(isValidTaxNumber("123456789012")).toBe(false);
    });

    it("boşluk/tire/harf temizlenir, sadece rakam sayılır", () => {
        expect(isValidTaxNumber("644 001 2345")).toBe(true);
        expect(isValidTaxNumber("644-001-2345")).toBe(true);
        expect(isValidTaxNumber("VKN: 6440012345")).toBe(true);
    });

    it("sadece harf/boş → false", () => {
        expect(isValidTaxNumber("")).toBe(false);
        expect(isValidTaxNumber("abc")).toBe(false);
    });
});

describe("isValidUrl", () => {
    it("https:// ile → true", () => {
        expect(isValidUrl("https://pmt.com.tr")).toBe(true);
    });

    it("http:// ile → true", () => {
        expect(isValidUrl("http://example.com")).toBe(true);
    });

    it("protokolsüz → true (https varsayılır)", () => {
        expect(isValidUrl("pmt.com.tr")).toBe(true);
        expect(isValidUrl("www.example.com")).toBe(true);
    });

    it("path/query'li → true", () => {
        expect(isValidUrl("https://example.com/path?q=1")).toBe(true);
    });

    it("noktasız hostname → false", () => {
        expect(isValidUrl("localhost")).toBe(false);
        expect(isValidUrl("not a url")).toBe(false);
    });

    it("boş → false", () => {
        expect(isValidUrl("")).toBe(false);
        expect(isValidUrl("   ")).toBe(false);
    });
});
