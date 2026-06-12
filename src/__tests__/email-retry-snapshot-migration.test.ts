import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("migration 096 — kısa ömürlü e-posta retry snapshot'ları", () => {
    const sql = readFileSync(
        join(process.cwd(), "supabase/migrations/096_email_retry_snapshots.sql"),
        "utf8",
    );

    it("gerekli üç snapshot kolonunu idempotent ekler", () => {
        expect(sql).toMatch(/add column if not exists html_body text/i);
        expect(sql).toMatch(/add column if not exists text_body text/i);
        expect(sql).toMatch(/add column if not exists body_expires_at timestamptz/i);
    });

    it("süre dolumu temizliği için partial index içerir", () => {
        expect(sql).toMatch(/create index if not exists ix_email_logs_body_expiry/i);
        expect(sql).toMatch(/where body_expires_at is not null/i);
    });

    it("email_logs RLS veya policy davranışını gevşetmez", () => {
        expect(sql).not.toMatch(/disable row level security/i);
        expect(sql).not.toMatch(/create policy/i);
    });
});
