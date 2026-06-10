/**
 * Excel/CSV toplu aktarım sihirbazı — /dashboard/import/excel
 * (2026-06-10 sadeleştirme: accordion'dan kendi sayfasına taşındı).
 *
 * Source-regex tarzı: 7-adım state machine'in ve korunması şart davranışların
 * (remember, inline edit rollback, field approval, bulk fill, overwrite,
 * confirm body, demo guard) yapısal kilitleri. Saf fonksiyon testleri
 * (validateFileSize/sourceChipLabel) kendi dosyalarında.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inferStockOpFromSheetName } from "@/app/dashboard/import/excel/page";
import { stashImportFile, takeImportFile, isExcelWizardFile } from "@/lib/import-file-transfer";

const SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/import/excel/page.tsx"),
    "utf8",
);

describe("excel wizard — 7-adım state machine korundu", () => {
    it("ImportState union tüm adımları içerir", () => {
        expect(SOURCE).toMatch(/"idle" \| "analyzing" \| "sheet_select" \| "column_mapping" \| "preview" \| "importing" \| "done"/);
    });

    it("akış zinciri: batch oluştur → detect-columns → apply-mappings → confirm → report", () => {
        expect(SOURCE).toMatch(/fetch\("\/api\/import",/);
        expect(SOURCE).toMatch(/detect-columns/);
        expect(SOURCE).toMatch(/apply-mappings/);
        expect(SOURCE).toMatch(/\/confirm/);
        expect(SOURCE).toMatch(/report\?format=xlsx/);
    });

    it("E2E locator'lar korundu: classic-import-file + import-error-banner", () => {
        expect(SOURCE).toMatch(/data-testid="classic-import-file"/);
        expect(SOURCE).toMatch(/parseError &&[\s\S]{0,400}data-testid="import-error-banner"/);
        expect(SOURCE).toMatch(/role="alert"/);
        expect(SOURCE).toMatch(/aria-label="Hata mesajını kapat"/);
    });

    it("korunan davranışlar: remember + inline-edit rollback + field approval + bulk fill + overwrite", () => {
        expect(SOURCE).toMatch(/rememberMappings/);
        expect(SOURCE).toMatch(/rollback/);
        expect(SOURCE).toMatch(/setFieldApproval/);
        expect(SOURCE).toMatch(/Boşlara Uygula/);
        expect(SOURCE).toMatch(/JSON\.stringify\(\{ overwrite: overwriteExisting \}\)/);
        expect(SOURCE).toMatch(/Mevcut dolu alanların üzerine yaz/);
    });

    it("demo guard'lar üç mutasyon noktasında (detect/apply/confirm)", () => {
        const guards = SOURCE.match(/if \(isDemo\) \{ toast\(\{ type: "info", message: DEMO_BLOCK_TOAST \}\); return; \}/g) ?? [];
        expect(guards.length).toBeGreaterThanOrEqual(3);
    });

    it("25 MB dosya limiti korundu", () => {
        expect(SOURCE).toMatch(/25 \* 1024 \* 1024/);
    });

    it("vendor/stock sheet adları mapping'de desteklenir", () => {
        expect(SOURCE).toMatch(/Tedarikciler/);
        expect(SOURCE).toMatch(/Tedarikçi_Ürünleri/);
        expect(SOURCE).toMatch(/Stok_Sayimi/);
        expect(SOURCE).toMatch(/Stok_Hareketleri/);
    });

    it("internal operation marker preview tablosunda gösterilmez", () => {
        expect(SOURCE).toMatch(/INTERNAL_IMPORT_FIELDS/);
        expect(SOURCE).toMatch(/__ai_import_operation/);
        expect(SOURCE).toMatch(/!INTERNAL_IMPORT_FIELDS\.has\(k\)/);
    });
});

describe("excel wizard — dosya-önce entegrasyonu", () => {
    it("mount'ta hub'dan gelen dosya alınır (takeImportFile('excel') → handleFileSelect)", () => {
        expect(SOURCE).toMatch(/takeImportFile\("excel"\)/);
        expect(SOURCE).toMatch(/if \(handed\) handleFileSelect\(handed\)/);
    });

    it("AI kaçış yolu: 'AI ile analiz et' → stash('ai') + hub'a dönüş", () => {
        expect(SOURCE).toMatch(/stashImportFile\(file, "ai"\)/);
        expect(SOURCE).toMatch(/router\.push\("\/dashboard\/import"\)/);
        expect(SOURCE).toMatch(/AI ile analiz et/);
    });

    it("İşlem Türü ızgarası bu sayfada da yok; apply-mappings'e aiOperationType gitmez", () => {
        expect(SOURCE).not.toMatch(/aiOperationType/);
        expect(SOURCE).not.toMatch(/ACTIVE_AI_IMPORT_OPERATIONS/);
        expect(SOURCE).not.toMatch(/operation_type:\s*aiOperationType/);
    });

    it("stok sheet'lerinde sayım/hareket radio'su + apply-mappings sheets[].operation_type", () => {
        expect(SOURCE).toMatch(/stockOps/);
        expect(SOURCE).toMatch(/role="radiogroup"/);
        expect(SOURCE).toMatch(/effectiveStockOp/);
        expect(SOURCE).toMatch(/s\.entityType === "stock" \? \{ operation_type: effectiveStockOp\(s\.name\) \} : \{\}/);
        // veri-nereye-gider netliği: her seçeneğin hint'i var
        // (Türkçe I/ı JS regex /i folding'inde eşleşmez → birebir metin)
        expect(SOURCE).toContain("Mevcut stok miktarını dosyadaki değerle YAZAR");
        expect(SOURCE).toContain("mevcut stoğa EKLER/ÇIKARIR");
    });
});

describe("inferStockOpFromSheetName (pure)", () => {
    it("sayım kalıpları → stock_count", () => {
        expect(inferStockOpFromSheetName("Stok_Sayimi")).toBe("stock_count");
        expect(inferStockOpFromSheetName("Stok Sayımı")).toBe("stock_count");
        expect(inferStockOpFromSheetName("count_2026")).toBe("stock_count");
    });

    it("hareket kalıpları → stock_movement", () => {
        expect(inferStockOpFromSheetName("Stok_Hareketleri")).toBe("stock_movement");
        expect(inferStockOpFromSheetName("Giris-Cikis")).toBe("stock_movement");
        expect(inferStockOpFromSheetName("transfer")).toBe("stock_movement");
    });

    it("belirsiz ad → null (UI default Sayım gösterir, kullanıcı değiştirebilir)", () => {
        expect(inferStockOpFromSheetName("Stok")).toBeNull();
        expect(inferStockOpFromSheetName("Depo1")).toBeNull();
    });
});

describe("import-file-transfer singleton (pure)", () => {
    it("stash → take aynı hedefle dosyayı bir kez döndürür (oku-ve-temizle)", () => {
        const f = new File(["x"], "a.xlsx");
        stashImportFile(f, "excel");
        expect(takeImportFile("excel")).toBe(f);
        expect(takeImportFile("excel")).toBeNull();
    });

    it("hedef uyuşmazsa dosya verilmez (excel stash'i ai take'ine sızmaz)", () => {
        const f = new File(["x"], "a.xlsx");
        stashImportFile(f, "excel");
        expect(takeImportFile("ai")).toBeNull();
        // yanlış-hedef take stash'i tüketmez
        expect(takeImportFile("excel")).toBe(f);
    });

    it("isExcelWizardFile: xlsx/xls/csv true; pdf/png false; büyük harf uzantı tolere edilir", () => {
        expect(isExcelWizardFile("a.xlsx")).toBe(true);
        expect(isExcelWizardFile("a.XLS")).toBe(true);
        expect(isExcelWizardFile("a.csv")).toBe(true);
        expect(isExcelWizardFile("a.pdf")).toBe(false);
        expect(isExcelWizardFile("a.png")).toBe(false);
        expect(isExcelWizardFile("dosya")).toBe(false);
    });
});

describe("E2E spec hizası", () => {
    it("tests/import.spec.ts sihirbaz sayfasına gider; eski accordion locator'ı kalmadı", () => {
        const E2E_SRC = readFileSync(join(process.cwd(), "tests/import.spec.ts"), "utf8");
        expect(E2E_SRC).toMatch(/\/dashboard\/import\/excel/);
        expect(E2E_SRC).toMatch(/getByTestId\("import-error-banner"\)/);
        expect(E2E_SRC).not.toMatch(/classic-mode-accordion/);
        expect(E2E_SRC).not.toMatch(/getByRole\("alert"\)/);
    });
});
