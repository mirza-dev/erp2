/**
 * Migration 112 — belge vurgu rengi. Migration'lar canlıya Studio'dan ELLE
 * uygulanıyor; dosya ile canlı arasındaki köprüler: `check-migrations.ts` probu,
 * `manual-migration-checks.sql` satırı ve bu kaynak kilidi.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const SQL = read("supabase/migrations/112_document_accent_color.sql");
/** Satır yorumlarını ayıkla — açıklamalar yanlış-pozitif üretmesin. */
const CODE = SQL.replace(/--[^\n]*/g, "");

describe("mig.112 — şema", () => {
    it("kolon idempotent eklenir, NOT NULL + varsayılan bugünkü renk (PMT'de görünüm değişmez)", () => {
        expect(CODE).toMatch(/add column if not exists document_accent_color text not null default '#0072BC'/i);
    });

    it("biçim CHECK'i #RRGGBB ve çift uygulamaya dayanıklı", () => {
        expect(CODE).toMatch(/check \(document_accent_color ~ '\^#\[0-9A-Fa-f\]\{6\}\$'\)/);
        expect(CODE).toMatch(/when duplicate_object then null/i);
    });

    it("yeni tablo/fonksiyon açmaz (RLS ve DEFINER kapılarının konusu değil)", () => {
        expect(CODE).not.toMatch(/create table/i);
        expect(CODE).not.toMatch(/create (or replace )?function/i);
    });
});

describe("mig.112 — canlı köprüleri", () => {
    it("check-migrations otomatik probu kolonu arar", () => {
        expect(read("scripts/check-migrations.ts")).toMatch(
            /"112":\s*\{\s*kind:\s*"column",\s*table:\s*"company_settings",\s*column:\s*"document_accent_color"\s*\}/,
        );
    });

    it("elle doğrulama SQL'i kolon + CHECK kısıtını birlikte arar", () => {
        const manual = read("docs/audit/manual-migration-checks.sql");
        expect(manual).toMatch(/select '112'/);
        expect(manual).toContain("company_settings_document_accent_color_check");
    });

    it("satır tipi alanı OPSİYONEL taşır (migration'sız DB alanı döndürmez)", () => {
        expect(read("src/lib/database.types.ts")).toMatch(/document_accent_color\?: string/);
    });
});
