/**
 * Source-regression: Yeni Teklif sayfasına inline "Gönder" butonu (çift onay).
 *
 * QuoteForm `enableInlineSend` prop'u ile yalnız /quotes/new'de Gönder gösterir;
 * çift-onay modalı (sendStep 1→2); ön-validasyon sunucu sözleşmesini aynalar
 * (validateQuoteForSend/validateQuoteLineQuantities); persist→sent→navigasyon
 * sırası; replaceState atlanır; draft localStorage temizlenir. Davranış DB-side
 * smoke'ta tam doğrulanır; bu test kritik invariant'ları kilitler (drift-guard).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf-8");

describe("new/page.tsx — inline send etkin", () => {
    const src = read("src/app/dashboard/quotes/new/page.tsx");
    it("QuoteForm enableInlineSend prop'u ile render edilir", () => {
        expect(src).toMatch(/<QuoteForm\s+enableInlineSend\s*\/>/);
    });
});

describe("QuoteForm.tsx — inline Gönder butonu gating", () => {
    const src = read("src/app/dashboard/quotes/_components/QuoteForm.tsx");

    it("enableInlineSend prop'u tanımlı", () => {
        expect(src).toMatch(/enableInlineSend\?:\s*boolean/);
    });

    it("Gönder butonu YALNIZ enableInlineSend && !readOnly iken", () => {
        expect(src).toMatch(/enableInlineSend\s*&&\s*!readOnly/);
        expect(src).toMatch(/onClick=\{handleRequestSend\}/);
    });

    it("ön-validasyon sunucu helper'larını aynalar (manuel-kod/adres-yok bloğu)", () => {
        expect(src).toMatch(/validateQuoteLineQuantities/);
        expect(src).toMatch(/validateQuoteForSend\(\{\s*customer_address:\s*custAddress/);
    });

    it("çift onay: sendStep 0→1→2 ve son onayda handleSendInline", () => {
        expect(src).toMatch(/setSendStep\(1\)/);
        expect(src).toMatch(/setSendStep\(2\)/);
        expect(src).toMatch(/onClick=\{handleSendInline\}/);
        expect(src).toMatch(/Teklifi Gönder \(1\/2\)/);
        expect(src).toMatch(/Son Onay \(2\/2\)/);
    });

    it("modal 1: rezerve notu + müşteri e-posta checkbox", () => {
        expect(src).toMatch(/bekleyen sipariş<\/strong> oluşturulur/);
        expect(src).toMatch(/Müşteriye e-posta da gönder/);
    });

    it("persist→sent→navigasyon sırası + replaceState atlanır (skipUrlSync)", () => {
        expect(src).toMatch(/persistQuote\(\{\s*skipUrlSync:\s*true\s*\}\)/);
        expect(src).toMatch(/transition:\s*"sent"/);
        expect(src).toMatch(/router\.push\("\/dashboard\/quotes\/"\s*\+\s*id\)/);
    });

    it("skipUrlSync replaceState'i guard'lar (push desync hazard)", () => {
        expect(src).toMatch(/if\s*\(!opts\?\.skipUrlSync\)\s*\{[\s\S]*?replaceState/);
    });

    it("geçiş başarısızsa navigasyon YOK (erken return)", () => {
        // !res.ok dalında push yok — return ile durur.
        expect(src).toMatch(/if\s*\(!res\.ok\)\s*\{[\s\S]*?return;/);
    });

    it("gönderim sonrası draft localStorage temizlenir", () => {
        expect(src).toMatch(/removeItem\("teklif_v3"\)/);
        expect(src).toMatch(/removeItem\("teklif_v3_full"\)/);
    });

    it("autoSave suppress flag (clear→unmount penceresi)", () => {
        expect(src).toMatch(/suppressAutoSaveRef\.current\s*=\s*true/);
        expect(src).toMatch(/readOnly\s*\|\|\s*suppressAutoSaveRef\.current/);
    });

    it("sonuç toast + e-posta paylaşılan helper'lardan", () => {
        expect(src).toMatch(/applySendResultToast\(pushToast,\s*data\)/);
        expect(src).toMatch(/sendQuoteEmail\(id,\s*pushToast\)/);
    });
});
