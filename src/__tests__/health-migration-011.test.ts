/**
 * Fix marker doğrulama testi — interpretMigration011Result
 * (src/app/api/health/route.ts)
 *
 * check_migration_011_applied() RPC'nin üç olası sonucunun
 * db.migration_011 health response string'ine doğru map edildiğini kilitler.
 */
import { describe, it, expect } from "vitest";
import { interpretMigration011Result, REQUIRED_KEYS } from "@/app/api/health/route";

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

// ─── REQUIRED_KEYS kontrat testi ──────────────────────────────────────────────
// Bu testler hangi key'lerin zorunlu olduğunu kilitler.
// Birisi yanlışlıkla kritik bir migration'ı optional yapırsa bu testler yakalar.

describe("REQUIRED_KEYS — readiness kontrat", () => {
    it("db.migration_011 required (sevkiyat RPC uuid fix)", () => {
        expect(REQUIRED_KEYS).toContain("db.migration_011");
    });

    it("db.migration_015 required (products identity fields — CRUD bağımlı)", () => {
        expect(REQUIRED_KEYS).toContain("db.migration_015");
    });

    it("db.migration_014 optional — required listesinde olmamalı (fire-and-forget audit)", () => {
        expect(REQUIRED_KEYS).not.toContain("db.migration_014");
    });

    it("env.PARASUT_CLIENT_ID optional — required listesinde olmamalı", () => {
        expect(REQUIRED_KEYS).not.toContain("env.PARASUT_CLIENT_ID");
    });

    it("allOk semantiği: tüm required key'ler 'ok' değilse false döner", () => {
        const checks: Record<string, string> = {};
        REQUIRED_KEYS.forEach(k => { checks[k] = "ok"; });

        expect(REQUIRED_KEYS.every(k => checks[k] === "ok")).toBe(true);

        // migration_011 fix_missing → allOk false olmalı
        checks["db.migration_011"] = "fix_missing: ship_order_full has uuid cast bug";
        expect(REQUIRED_KEYS.every(k => checks[k] === "ok")).toBe(false);
    });

    it("allOk semantiği: migration_015 missing → false döner", () => {
        const checks: Record<string, string> = {};
        REQUIRED_KEYS.forEach(k => { checks[k] = "ok"; });
        checks["db.migration_015"] = "missing_or_error: column does not exist";
        expect(REQUIRED_KEYS.every(k => checks[k] === "ok")).toBe(false);
    });

    it("db.migration_018 required (create_order_with_lines — atomik sipariş RPC)", () => {
        expect(REQUIRED_KEYS).toContain("db.migration_018");
    });

    it("allOk semantiği: migration_018 missing → false döner", () => {
        const checks: Record<string, string> = {};
        REQUIRED_KEYS.forEach(k => { checks[k] = "ok"; });
        checks["db.migration_018"] = "missing: Could not find the function create_order_with_lines";
        expect(REQUIRED_KEYS.every(k => checks[k] === "ok")).toBe(false);
    });
});
