/**
 * Teknik şablon (product-types) detay — field_key edit-modunda READ-ONLY guard.
 *
 * Branch hizalama (codex merge) sırasında re-apply edilen veri-bütünlüğü guard'ı:
 * codex'in edit modalı field_key'i edit'te yeniden üretiyordu
 * (generateTechnicalFieldKey(event.target.value)) → mevcut bir alanın anahtarını
 * değiştirmek o tipteki TÜM ürünlerin attributes JSONB değerini orphan bırakır
 * (products page hâlâ `attributes[f.field_key]` ile saklıyor — model değişmedi).
 *
 * Guard: fieldModal === "edit" iken field_key input readOnly + disabled + onChange
 * erken return + "değiştirilemez" notu. "new" modunda auto-generate korunur.
 *
 * 2026-08-29 — İDDİA DÜZELTİLDİ. "orphan uyarısı GÖRÜNÜR" testi kaynağın
 * TAMAMINDA arıyordu ve aslında bir KOD YORUMUNA eşleşiyordu; kullanıcıya
 * görünen not değiştirildiğinde bile yeşil kalıyordu (yani kilitlediğini
 * sandığı şeyi hiç kilitlemiyormuş). Artık yorumlar ayıklanıyor (`code()`) ve
 * iddia gerçekten render edilen metne bağlı.
 *
 * Aynı turda sunucu tarafı da kapatıldı: `dbUpdateProductTypeField` field_key
 * değişimini reddediyor → guard artık yalnız UI'da değil.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Yorumları düşürür — iddia açıklamaya değil koda/render edilen metne bakmalı. */
function code(src: string): string {
    // Satır yorumları ÖNCE ayıklanır: bir `//` yorumunun içindeki `/**`
    // (ör. "// /dashboard/** erişimi") aksi hâlde blok yorum başlangıcı
    // sanılıp sonraki `*/`e kadar GERÇEK KODU yutuyordu (2026-08).
    return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const DETAIL_SRC = code(readFileSync(
    join(process.cwd(), "src/app/dashboard/settings/product-types/[id]/page.tsx"),
    "utf8",
));

describe("product-types detay — field_key edit-mode read-only guard", () => {
    it("field_key input edit modunda readOnly + disabled", () => {
        expect(DETAIL_SRC).toMatch(/readOnly=\{fieldModal === "edit"\}/);
        expect(DETAIL_SRC).toMatch(/disabled=\{fieldModal === "edit"\}/);
    });

    it("onChange edit modunda erken return (auto-generate sadece new'de)", () => {
        // Teknik Anahtar input'unun onChange'i edit modunda field_key'i değiştirmez
        expect(DETAIL_SRC).toMatch(/if \(fieldModal === "edit"\) return;\s*\n\s*setFieldDraft\(prev => \(\{ \.\.\.prev, field_key: generateTechnicalFieldKey/);
    });

    it("edit modunda 'değiştirilemez' etiketi + güvenli alternatif GÖRÜNÜR", () => {
        expect(DETAIL_SRC).toMatch(/Teknik Anahtar\{fieldModal === "edit" \? " \(değiştirilemez\)" : ""\}/);
        // Kullanıcıya görünen not: neden + ne yapılacağı.
        expect(DETAIL_SRC).toMatch(/kimliğidir ve değiştirilemez/);
        expect(DETAIL_SRC).toMatch(/pasifleştirip yenisini ekleyin/);
    });

    it("çelişkili 'güvenli şekilde taşınır' kutusu geri gelmez", () => {
        // Bu cümle alan-altı notun TERSİNİ söylüyordu ve anlattığı taşıma yolu
        // sunucuda kapatıldı — iki uyarı aynı anda gösterilemez.
        expect(DETAIL_SRC).not.toMatch(/güvenli şekilde yeni anahtara taşınır/);
    });

    it("label_tr değişiminde field_key yalnız new+boşken auto-generate (edit'i ezmez)", () => {
        // Regression: codex'in mevcut guard'ı korunur (label değişimi edit'te key'i bozmaz)
        expect(DETAIL_SRC).toMatch(/field_key: fieldModal === "new" && !prev\.field_key \? generateTechnicalFieldKey\(nextLabel\) : prev\.field_key/);
    });
});
