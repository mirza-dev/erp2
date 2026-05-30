/**
 * Faz 6 (V7) — quote detay accept UI + deprecation kilidi (source-regex).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const PAGE = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/[id]/page.tsx"), "utf8");
const DISPLAY = readFileSync(join(process.cwd(), "src/app/dashboard/quotes/_utils/quote-display.ts"), "utf8");

describe("quote detay — atomik accept UI (Faz 6)", () => {
    it("handleAccept → POST /accept çağrısı", () => {
        expect(PAGE).toMatch(/const handleAccept = async/);
        expect(PAGE).toMatch(/fetch\(`\/api\/quotes\/\$\{params\.id\}\/accept`, \{ method: "POST" \}\)/);
    });
    it("eski handleConvert + /convert fetch KALDIRILDI", () => {
        expect(PAGE).not.toMatch(/const handleConvert = async/);
        expect(PAGE).not.toMatch(/\/api\/quotes\/\$\{params\.id\}\/convert/);
    });
    it("already → mevcut sipariş bilgisi (idempotent UX)", () => {
        expect(PAGE).toMatch(/data\.already/);
    });
    it("confirm dispatch: accepted + convert_to_order → handleAccept", () => {
        expect(PAGE).toMatch(/action === "convert_to_order" \|\| action === "accepted"/);
        expect(PAGE).toMatch(/handleAccept\(\)/);
    });
    it("Faz 3 iskonto convert-block notu kaldırıldı", () => {
        expect(PAGE).not.toMatch(/quote\.discountAmount > 0/);
    });
});

describe("getQuoteActions — Faz 6 accept label", () => {
    it("accept butonu 'Kabul Et ve Siparişe Dönüştür'", () => {
        expect(DISPLAY).toMatch(/Kabul Et ve Siparişe Dönüştür/);
    });
});
