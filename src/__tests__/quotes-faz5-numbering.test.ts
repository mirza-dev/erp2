/**
 * Teklif V7 — Faz 5 (infra dilim): numara katmanı — migration 073.
 *
 * ⚠️ DÜRÜST SINIR (advisor): numara mantığı tamamen DB-side (next_quote_number
 * PL/pgSQL). Birim test DB gerektirir → buradaki testler migration SQL'inde
 * string VARLIĞINI doğrular (DRIFT-GUARD), DAVRANIŞI DEĞİL — backfill regex'i
 * ters olsa veya ON CONFLICT yanlış olsa bile geçebilirler. Bu fazın gerçek
 * correctness doğrulaması MANUEL SMOKE'tur (yeni teklif numarası çakışmaz,
 * prefix değişimi, yıl reset). Bu testler yalnız "SQL beklenen şekli kaybetti mi"
 * regression'ını yakalar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const M73 = readFileSync(
    join(process.cwd(), "supabase/migrations/073_quotes_numbering.sql"), "utf8",
);

describe("Migration 073 — numara katmanı (source-regex drift-guard)", () => {
    it("company_settings += quote_number_prefix/separator (default TKL/-)", () => {
        expect(M73).toMatch(/add column if not exists quote_number_prefix\s+text not null default 'TKL'/);
        expect(M73).toMatch(/add column if not exists quote_number_separator\s+text not null default '-'/);
    });

    it("quote_yearly_counters tablo (year int primary key) + RLS + service_role policy", () => {
        expect(M73).toMatch(/create table if not exists quote_yearly_counters/);
        expect(M73).toMatch(/year\s+int\s+primary key/);
        expect(M73).toMatch(/enable row level security/);
        expect(M73).toMatch(/auth\.role\(\) = 'service_role'/);
    });

    it("backfill: 034 defansif precedent (^TKL-\\d{4}-\\d+$ guard) + gömülü-yıl group + on conflict greatest", () => {
        expect(M73).toMatch(/where quote_number ~ '\^TKL-\\d\{4\}-\\d\+\$'/);
        expect(M73).toMatch(/split_part\(quote_number, '-', 2\)::int/); // gömülü-yıl group
        expect(M73).toMatch(/max\(split_part\(quote_number, '-', 3\)::int\)/); // trailing seq
        expect(M73).toMatch(/on conflict \(year\) do update[\s\S]*greatest/);
    });

    it("next_quote_number rewrite: atomik ON CONFLICT artış + company_settings prefix oku", () => {
        expect(M73).toMatch(/create or replace function next_quote_number\(\)\s*\n\s*returns text/);
        expect(M73).toMatch(/on conflict \(year\) do update set last_seq = quote_yearly_counters\.last_seq \+ 1/);
        expect(M73).toMatch(/from company_settings limit 1/);
        expect(M73).toMatch(/coalesce\(nullif\(quote_number_prefix, ''\), 'TKL'\)/);
        // V7-A1: SECURITY DEFINER YOK (açıklamadaki "... YOK" hariç).
        expect(M73).not.toMatch(/SECURITY DEFINER(?! YOK)/i);
    });

    it("idempotent: add column if not exists + create table if not exists + policy duplicate_object guard", () => {
        expect(M73).toMatch(/add column if not exists/);
        expect(M73).toMatch(/create table if not exists/);
        expect(M73).toMatch(/exception when duplicate_object then null/);
    });
});

describe("CompanySettingsRow TS senkron", () => {
    it("quote_number_prefix + quote_number_separator alanları", () => {
        const types = readFileSync(join(process.cwd(), "src/lib/database.types.ts"), "utf8");
        const block = types.slice(types.indexOf("interface CompanySettingsRow"));
        expect(block).toMatch(/quote_number_prefix: string/);
        expect(block).toMatch(/quote_number_separator: string/);
    });
});
