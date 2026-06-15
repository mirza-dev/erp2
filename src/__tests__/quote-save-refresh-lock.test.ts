/**
 * Kaynak kilidi — teklif "kaydet → gönder onayı eski e-posta" bug fix'i.
 *
 * Kök: detay sayfası `quote` state'i İLK fetch'ten kalıyordu; formda e-posta
 * değiştirilip Kaydet'ilince onay modalındaki adres (ve hasCustomerEmail
 * checkbox guard'ı) tazelenmiyordu. Fix: QuoteForm persistQuote başarılı
 * yanıtı `onSaved` ile parent'a verir; detay sayfası bununla setQuote yapar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const FORM = readFileSync("src/app/dashboard/quotes/_components/QuoteForm.tsx", "utf8");
const PAGE = readFileSync("src/app/dashboard/quotes/[id]/page.tsx", "utf8");

describe("teklif kaydet→gönder tazeliği (kaynak kilitleri)", () => {
    it("QuoteForm onSaved prop'u tanımlı ve PATCH yanıtıyla çağrılıyor", () => {
        expect(FORM).toContain("onSaved?: (detail: QuoteDetail) => void");
        // Yanıt parse edilip onSaved'e veriliyor (POST+PATCH birleşik dal)
        expect(FORM).toMatch(/const data = await res\.json\(\)[\s\S]{0,500}onSaved\?\.\(data\)/);
        // PATCH (mevcut teklif) dalı da bildirir
        expect(FORM).toContain("if (data) onSaved?.(data)");
        // POST (ilk kayıt) dalı da bildirir
        expect(FORM).toMatch(/setQuoteNo\(data\.quoteNumber\);\s*\n\s*onSaved\?\.\(data\);/);
    });

    it("kaydetme hatasında sunucunun gerçek nedeni toast'a taşınır (403/422 ayrımı)", () => {
        // persistQuote artık jenerik 'return null' yerine readSaveError ile mesaj saklar
        expect(FORM).toMatch(/lastSaveErrorRef\.current = await readSaveError\(res\)/);
        expect(FORM).toMatch(/showToast\(lastSaveErrorRef\.current \|\| "Kaydetme hatası", "error"\)/);
        // 403 → manage_quotes yetki mesajı
        expect(FORM).toMatch(/res\.status === 403[\s\S]{0,120}manage_quotes/);
    });

    it("detay sayfası onSaved ile quote state'ini tazeler (modal yeni e-postayı görür)", () => {
        expect(PAGE).toMatch(/onSaved=\{[\s\S]{0,160}setQuote/);
        // onay modalı canlı state'ten okur
        expect(PAGE).toContain("{quote?.customerEmail}");
        // PDF eki dönemi (2026-06) — modal metni gerçek PDF ekinden bahseder
        expect(PAGE).toContain("teklif belgesi PDF olarak eklenir");
        expect(PAGE).not.toContain("görüntüleme bağlantısı");
    });
});
