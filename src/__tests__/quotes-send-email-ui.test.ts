/**
 * Source-regression: teklif "Gönder" onayında müşteriye e-posta checkbox'ı +
 * post-transition /send-email çağrısı + draft confirm.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

describe("quote-display: draft Gönder onay diyaloğu", () => {
    const src = read("src/app/dashboard/quotes/_utils/quote-display.ts");
    it("draft 'sent' aksiyonu artık confirm taşır (onay diyaloğu açılır)", () => {
        expect(src).toMatch(/transition:\s*"sent"[\s\S]*?confirm:\s*\{[\s\S]*?title:\s*"Teklifi Gönder"/);
    });
});

describe("[id]/page.tsx: müşteriye e-posta checkbox + gönderim", () => {
    const src = read("src/app/dashboard/quotes/[id]/page.tsx");

    it("sendEmailChecked state (default true) + hasCustomerEmail türevi var", () => {
        expect(src).toContain("useState(true)");
        expect(src).toContain("hasCustomerEmail");
        expect(src).toContain("quote?.customerEmail");
    });

    it("checkbox yalnız 'sent' onayında render edilir", () => {
        expect(src).toContain('confirmDialog.action === "sent"');
        expect(src).toMatch(/Müşteriye e-posta da gönder/);
    });

    it("müşteri e-postası yoksa checkbox disabled + uyarı", () => {
        expect(src).toContain("disabled={!hasCustomerEmail}");
        expect(src).toMatch(/Bu teklifte müşteri e-postası yok/);
    });

    it("başarılı sent transition sonrası /send-email çağrılır (paylaşılan helper)", () => {
        // sendQuoteToCustomer inline'dı; artık paylaşılan sendQuoteEmail (_utils/send-result).
        expect(src).toContain("sendQuoteEmail");
        // yalnız checkbox işaretli + e-posta varsa
        expect(src).toMatch(/sendEmailChecked\s*&&\s*data\.customerEmail/);
    });

    it("send sonucu toast cascade paylaşılan helper'a delege edildi", () => {
        expect(src).toContain("applySendResultToast");
    });
});
