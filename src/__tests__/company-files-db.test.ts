/**
 * Şirket dosya arşivi — saf yardımcılar (lib/company-files) + DB helper
 * source-lock'ları (orphan cleanup zinciri, soft-delete sözleşmesi, bucket adı).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    FILE_CATEGORIES,
    isCompanyFileCategory,
    catLabel,
    splitName,
    formatFileSize,
    extTextColor,
    isAllowedCompanyFileExt,
    contentTypeForExt,
    MAX_COMPANY_FILE_SIZE,
    COMPANY_FILES_STORAGE_LIMIT_MB,
} from "@/lib/company-files";

describe("company-files saf yardımcılar", () => {
    it("kategoriler: 5 sabit kategori + label çözümü", () => {
        expect(FILE_CATEGORIES.map(c => c.key)).toEqual(["sozlesme", "belge", "teklif-eki", "kurumsal", "diger"]);
        expect(catLabel("teklif-eki")).toBe("Teklif Ekleri");
        expect(catLabel("bilinmeyen")).toBe("bilinmeyen"); // fallback: key'in kendisi
        expect(isCompanyFileCategory("kurumsal")).toBe(true);
        expect(isCompanyFileCategory("baska")).toBe(false);
        expect(isCompanyFileCategory(null)).toBe(false);
    });

    it("splitName: son noktadan böler, uzantıyı küçük harfe çevirir", () => {
        expect(splitName("Bayilik Sözleşmesi.PDF")).toEqual({ base: "Bayilik Sözleşmesi", ext: "pdf" });
        expect(splitName("rapor.final.xlsx")).toEqual({ base: "rapor.final", ext: "xlsx" });
        expect(splitName("uzantisiz")).toEqual({ base: "uzantisiz", ext: "" });
        expect(splitName(".gizli")).toEqual({ base: ".gizli", ext: "" }); // i<=0 → uzantı sayılmaz
    });

    it("formatFileSize: TR virgüllü MB, tam KB, ham B", () => {
        expect(formatFileSize(2412000)).toBe("2,3 MB");
        expect(formatFileSize(456000)).toBe("445 KB");
        expect(formatFileSize(84)).toBe("84 B");
    });

    it("uzantı renkleri yalnız metinde: PDF danger, XLSX success, DOCX accent, diğer secondary", () => {
        expect(extTextColor("PDF")).toBe("var(--danger-text)");
        expect(extTextColor("xlsx")).toBe("var(--success-text)");
        expect(extTextColor("DOCX")).toBe("var(--accent-text)");
        expect(extTextColor("ZIP")).toBe("var(--text-secondary)");
    });

    it("allowlist: ofis+görsel+zip/csv/txt kabul, exe/sh/html red; MIME uzantıdan türer", () => {
        for (const ok of ["pdf", "docx", "xlsx", "png", "JPG", "svg", "zip", "csv", "txt"]) {
            expect(isAllowedCompanyFileExt(ok), ok).toBe(true);
        }
        for (const bad of ["exe", "sh", "html", "js", ""]) {
            expect(isAllowedCompanyFileExt(bad), bad || "(boş)").toBe(false);
        }
        expect(contentTypeForExt("pdf")).toBe("application/pdf");
        expect(contentTypeForExt("XLSX")).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        expect(contentTypeForExt("exe")).toBeNull();
    });

    it("sabitler: 25MB dosya sınırı (bucket ile eş), 5GB gösterge limiti", () => {
        expect(MAX_COMPANY_FILE_SIZE).toBe(25 * 1024 * 1024);
        expect(COMPANY_FILES_STORAGE_LIMIT_MB).toBe(5120);
    });
});

describe("kaynak kilitleri (source-lock)", () => {
    const dbSrc = readFileSync(join(process.cwd(), "src/lib/supabase/company-files.ts"), "utf8");

    it("dbCreateCompanyFile: orphan cleanup zinciri — upload başarısızsa satır silinir, patch başarısızsa storage+satır geri alınır", () => {
        expect(dbSrc).toMatch(/if \(uploadErr\) \{\s*await supabase\.from\("company_files"\)\.delete\(\)/);
        expect(dbSrc).toMatch(/\.remove\(\[path\]\)\.catch/);
    });

    it("soft-delete: deleted_at damgalanır, storage remove ÇAĞRILMAZ (30 gün sözleşmesi)", () => {
        const softDel = dbSrc.slice(dbSrc.indexOf("dbSoftDeleteCompanyFile"), dbSrc.indexOf("dbGetCompanyFileSignedUrl"));
        expect(softDel).toMatch(/update\(\{ deleted_at: new Date\(\)\.toISOString\(\) \}\)/);
        expect(softDel).not.toMatch(/storage/);
        expect(softDel).toMatch(/\.is\("deleted_at", null\)/); // idempotent: ikinci silme false döner
    });

    it("liste/get yalnız aktif satırlar (deleted_at IS NULL) + bucket adı company-files", () => {
        expect(dbSrc).toMatch(/const STORAGE_BUCKET = "company-files"/);
        const listFn = dbSrc.slice(dbSrc.indexOf("dbListCompanyFiles"), dbSrc.indexOf("dbGetCompanyFile("));
        expect(listFn).toMatch(/\.is\("deleted_at", null\)/);
    });

    it("migration 091: tablo + bucket + CHECK kategorileri kodla eş", () => {
        const mig = readFileSync(join(process.cwd(), "supabase/migrations/091_company_files.sql"), "utf8");
        expect(mig).toMatch(/CREATE TABLE IF NOT EXISTS company_files/);
        expect(mig).toMatch(/'company-files'/);
        expect(mig).toMatch(/26214400/); // 25 MB — MAX_COMPANY_FILE_SIZE ile eş
        for (const c of FILE_CATEGORIES) expect(mig).toContain(`'${c.key}'`);
        expect(mig).toMatch(/deleted_at\s+timestamptz/);
    });
});
