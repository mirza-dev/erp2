/**
 * Fix marker doğrulama testi — interpretMigration011Result
 * (src/app/api/health/route.ts)
 *
 * check_migration_011_applied() RPC'nin üç olası sonucunun
 * db.migration_011 health response string'ine doğru map edildiğini kilitler.
 */
import { describe, it, expect } from "vitest";
import { interpretMigration011Result } from "@/app/api/health/route";

describe("interpretMigration011Result — fix marker doğrulama", () => {
    it("PGRST202 → missing (016 tanı fonksiyonu uygulanmamış)", () => {
        const result = interpretMigration011Result(
            null,
            { code: "PGRST202", message: "Could not find the function check_migration_011_applied" },
        );
        expect(result).toMatch(/^missing:/);
        expect(result).toContain("Could not find");
    });

    it("false → fix_missing (007 uygulandı, 011 uygulanmadı — uuid cast bug mevcut)", () => {
        const result = interpretMigration011Result(false, null);
        expect(result).toMatch(/^fix_missing:/);
        expect(result).toContain("uuid cast bug");
        expect(result).toContain("migration 011");
    });

    it("true → ok (011 uygulandı, fix marker mevcut)", () => {
        const result = interpretMigration011Result(true, null);
        expect(result).toBe("ok");
    });

    it("non-PGRST202 hata → fix_missing gibi davranır (false path)", () => {
        // Beklenmedik bir RPC hatası; false olarak değerlendirilir, exception fırlatılmaz
        const result = interpretMigration011Result(null, { code: "42501", message: "permission denied" });
        expect(result).toMatch(/^fix_missing:/);
    });
});
