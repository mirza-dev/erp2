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
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DETAIL_SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/settings/product-types/[id]/page.tsx"),
    "utf8",
);

describe("product-types detay — field_key edit-mode read-only guard", () => {
    it("field_key input edit modunda readOnly + disabled", () => {
        expect(DETAIL_SRC).toMatch(/readOnly=\{fieldModal === "edit"\}/);
        expect(DETAIL_SRC).toMatch(/disabled=\{fieldModal === "edit"\}/);
    });

    it("onChange edit modunda erken return (auto-generate sadece new'de)", () => {
        // Teknik Anahtar input'unun onChange'i edit modunda field_key'i değiştirmez
        expect(DETAIL_SRC).toMatch(/if \(fieldModal === "edit"\) return;\s*\n\s*setFieldDraft\(prev => \(\{ \.\.\.prev, field_key: generateTechnicalFieldKey/);
    });

    it("edit modunda 'değiştirilemez' + orphan uyarısı görünür", () => {
        expect(DETAIL_SRC).toMatch(/Teknik Anahtar\{fieldModal === "edit" \? " \(değiştirilemez\)" : ""\}/);
        expect(DETAIL_SRC).toMatch(/orphan bırakır/);
    });

    it("label_tr değişiminde field_key yalnız new+boşken auto-generate (edit'i ezmez)", () => {
        // Regression: codex'in mevcut guard'ı korunur (label değişimi edit'te key'i bozmaz)
        expect(DETAIL_SRC).toMatch(/field_key: fieldModal === "new" && !prev\.field_key \? generateTechnicalFieldKey\(nextLabel\) : prev\.field_key/);
    });
});
