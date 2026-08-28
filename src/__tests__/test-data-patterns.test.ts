/**
 * Faz 4 (2026-08-24) — Teslim öncesi test artığı tespiti.
 *
 * Bu desenlere bakarak canlı veriden kayıt SİLİNECEK. Yanlış bir eşleşme
 * gerçek müşteri verisini sildirir; bu yüzden asıl değerli testler NEGATİF
 * olanlar: gerçek firma adlarının, teklif başlıklarının ve SKU'ların
 * eşleşmediğini kanıtlarlar.
 */
import { describe, expect, it } from "vitest";
import { matchTestDataPattern, isGibberishTitle, TEST_DATA_PATTERNS } from "@/lib/test-data-patterns";

describe("test artığı — POZİTİF eşleşmeler (canlı veriden gerçek örnekler)", () => {
    it("otomatik üretilmiş cari adları", () => {
        expect(matchTestDataPattern("Test Müşterisi 1781832705471")).toBeTruthy();
        expect(matchTestDataPattern("E2E Müşteri 1781832658926")).toBeTruthy();
    });

    it("otomatik üretilmiş e-postalar", () => {
        expect(matchTestDataPattern("test-1781832705471@testfirma.com")).toBeTruthy();
    });

    it("test aracı damgaları", () => {
        expect(matchTestDataPattern("playwright-fixture")).toBeTruthy();
        expect(matchTestDataPattern("__test__ kayıt")).toBeTruthy();
    });
});

describe("test artığı — NEGATİF (gerçek veri SİLİNMEMELİ)", () => {
    it("gerçek müşteri adları eşleşmez", () => {
        for (const name of [
            "Botaş Doğalgaz İşletmeleri",
            "Abdi İbrahim İlaç A.Ş.",
            "Tüpraş İzmit Rafinerisi",
            "Enerjisa Üretim Santralleri",
            "Star Rafineri A.Ş.",
            "PT-0108 Kazakistan Boru Hattı Konsorsiyumu",
            "Aygaz Dolum Tesisleri",
        ]) {
            expect(matchTestDataPattern(name), name).toBeNull();
        }
    });

    it("içinde 'test' geçen GERÇEK firma adları eşleşmez", () => {
        // "test" tek başına yetmemeli — desen timestamp yapısını arar.
        expect(matchTestDataPattern("Testaş Vana Sanayi")).toBeNull();
        expect(matchTestDataPattern("Protest Mühendislik")).toBeNull();
        expect(matchTestDataPattern("Test Center Endüstri")).toBeNull();
    });

    it("gerçek e-postalar eşleşmez", () => {
        expect(matchTestDataPattern("malzeme@botas.example.com")).toBeNull();
        expect(matchTestDataPattern("test@botas.example.com")).toBeNull(); // timestamp yok
    });

    it("gerçek ürün adları/SKU'ları eşleşmez", () => {
        for (const v of [
            "Çelik Tank V=60 m³ Yatay Karbon Çelik",
            "Fully Welded Ball Valve DN400 PN80 Pnömatik-Hidrolik",
            "FWBV-DN400-PN80-PH",
            "DGV-800-DN25-A105",
        ]) {
            expect(matchTestDataPattern(v), v).toBeNull();
        }
    });

    it("boş/eksik değer eşleşmez", () => {
        expect(matchTestDataPattern(null)).toBeNull();
        expect(matchTestDataPattern(undefined)).toBeNull();
        expect(matchTestDataPattern("   ")).toBeNull();
    });
});

describe("isGibberishTitle", () => {
    it("klavye dizisini yakalar (canlı RFQ başlığı)", () => {
        expect(isGibberishTitle("zrxdjfgchvj")).toBe(true);
    });

    it("gerçek başlıkları yakalamaz", () => {
        for (const t of [
            "Vana alımı",
            "DN100 dirsek fiyat talebi",
            "Kazakistan projesi",
            "yedekparca",       // sesli harf dolu tek kelime
            "malzemeler",
        ]) {
            expect(isGibberishTitle(t), t).toBe(false);
        }
    });

    it("çok kısa / çok uzun / boşluklu metni yakalamaz", () => {
        expect(isGibberishTitle("abc")).toBe(false);
        expect(isGibberishTitle("x".repeat(25))).toBe(false);
        expect(isGibberishTitle("zrxdjfgchvj ek not")).toBe(false);
        expect(isGibberishTitle(null)).toBe(false);
    });
});

describe("desen listesi disiplini", () => {
    it("hiçbir desen yalnız 'test' kelimesine dayanmıyor", () => {
        // Böyle bir desen "Testaş Vana"yı silmeye aday gösterirdi.
        for (const p of TEST_DATA_PATTERNS) {
            expect(p.re.test("Testaş Vana Sanayi"), p.label).toBe(false);
        }
    });

    it("her desenin okunabilir bir etiketi var (rapor çıktısı için)", () => {
        for (const p of TEST_DATA_PATTERNS) expect(p.label.length).toBeGreaterThan(3);
    });
});
