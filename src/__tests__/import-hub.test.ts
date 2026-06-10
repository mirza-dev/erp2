/**
 * Veri Aktarım Merkezi hub — dosya-önce model (2026-06-10 sadeleştirme).
 *
 * Eski tasarım (Faz 3d): "İşlem Türü" buton ızgarası + selectedUsesClassic
 * koşullu Excel CTA + Excel sihirbazı <details> accordion'da. Yeni tasarım:
 * tek DropZone — uzantıya göre yönlendirme (Excel → /dashboard/import/excel,
 * diğerleri → AI kuyruğu); rehber bloğu (ImportGuide) yerine şablon satırı +
 * tek satır güven notu.
 *
 * Source-regex tarzı: kritik yapısal kararları kilitleyen pattern check'leri.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const SOURCE = readFileSync(
    join(process.cwd(), "src/app/dashboard/import/page.tsx"),
    "utf8",
);

describe("import hub — dosya-önce model", () => {
    it("tek DropZone render edilir ve routeFiles yönlendirmesine bağlıdır", () => {
        expect(SOURCE).toMatch(/<DropZone/);
        expect(SOURCE).toMatch(/onFiles=\{routeFiles\}/);
    });

    it("uzantı yönlendirmesi: Excel → stash + push /dashboard/import/excel; diğerleri → aiFiles", () => {
        expect(SOURCE).toMatch(/isExcelWizardFile/);
        expect(SOURCE).toMatch(/stashImportFile\(excelFiles\[0\], "excel"\)/);
        expect(SOURCE).toMatch(/router\.push\("\/dashboard\/import\/excel"\)/);
        expect(SOURCE).toMatch(/setAiFiles\(prev => \[\.\.\.prev, \.\.\.aiBound\]\)/);
    });

    it("birden çok Excel'de bilgilendirici toast (yalnız ilki sihirbaza gider)", () => {
        expect(SOURCE).toMatch(/excelFiles\.length > 1/);
        expect(SOURCE).toMatch(/Excel dosyalarını tek tek yükleyin/);
    });

    it("İşlem Türü ızgarası ve accordion GERİ GELMEZ (regression-lock)", () => {
        expect(SOURCE).not.toMatch(/İşlem Türü/);
        expect(SOURCE).not.toMatch(/ACTIVE_AI_IMPORT_OPERATIONS/);
        expect(SOURCE).not.toMatch(/selectedUsesClassic/);
        expect(SOURCE).not.toMatch(/<details/);
        expect(SOURCE).not.toMatch(/showClassic/);
        expect(SOURCE).not.toMatch(/aiOperationType/);
    });

    it("ImportGuide bloğu kaldırıldı; component dosyası da yok", () => {
        expect(SOURCE).not.toMatch(/ImportGuide/);
        expect(existsSync(join(process.cwd(), "src/components/import/ImportGuide.tsx"))).toBe(false);
    });

    it("şablon satırı: getActiveTemplateLinks + tip-özel şablon dropdown korundu", () => {
        expect(SOURCE).toMatch(/getActiveTemplateLinks/);
        expect(SOURCE).toMatch(/kind=product_type&typeId=/);
    });

    it("güven satırı tek satır + tooltip (IMPORT_TRUST_NOTES title'da)", () => {
        expect(SOURCE).toMatch(/IMPORT_TRUST_NOTES\.join\("\\n"\)/);
        expect(SOURCE).toMatch(/Onayın olmadan hiçbir kayıt yazılmaz/);
    });

    it("ClassifierQueue'ya onOpenExcelWizard geçilir (migration_excel kaçışı); operationType prop'u kalktı", () => {
        expect(SOURCE).toMatch(/onOpenExcelWizard=\{openExcelWizard\}/);
        expect(SOURCE).not.toMatch(/operationType=/);
    });

    it("sihirbazdan 'AI ile analiz et' kaçışıyla gelen dosya alınır (takeImportFile('ai'))", () => {
        expect(SOURCE).toMatch(/takeImportFile\("ai"\)/);
    });
});

describe("import hub — ölü uçlar geri gelmez (regression-lock)", () => {
    it("/api/import/[batchId]/parse route dosyası yok", () => {
        expect(existsSync(join(process.cwd(), "src/app/api/import/[batchId]/parse/route.ts"))).toBe(false);
    });

    it("drafts route POST handler içermez (GET kalır)", () => {
        const drafts = readFileSync(
            join(process.cwd(), "src/app/api/import/[batchId]/drafts/route.ts"),
            "utf8",
        );
        expect(drafts).toMatch(/export async function GET/);
        expect(drafts).not.toMatch(/export async function POST/);
    });
});
