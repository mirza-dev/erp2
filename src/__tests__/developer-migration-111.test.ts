/**
 * Migration 111 — inceleme bulgularının şema kapanışı (Y7 · O3 · D3 · D4).
 *
 * 109'un kilidiyle aynı gerekçe: migration'lar Studio'dan ELLE uygulanıyor,
 * dosya ile canlı arasındaki tek köprü `scripts/check-migrations.ts` probu ve
 * bu kaynak kilidi. Buradaki iddialar, 109'un KORUNMASI gereken davranışlarının
 * yeniden tanımda düşmediğini de doğrular (088 tipi sessiz regresyon emsali).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/111_telemetry_schema_fixes.sql"),
    "utf8",
);

/** SQL satır yorumlarını ayıkla — açıklamalar yanlış-pozitif üretmesin. */
const CODE = SQL.replace(/--[^\n]*/g, "");

describe("Y7 — grup anahtarı ortamı içerir", () => {
    it("eski tekil fingerprint kısıtı düşürülür", () => {
        expect(CODE).toMatch(/drop constraint if exists system_error_groups_fingerprint_key/i);
    });

    it("yeni benzersiz indeks (fingerprint, environment)", () => {
        expect(CODE).toMatch(/create unique index[\s\S]{0,80}system_error_groups\(fingerprint, environment\)/i);
    });

    it("RPC on conflict hedefi de ortamı içerir", () => {
        expect(CODE).toMatch(/on conflict \(fingerprint, environment\) do update/i);
    });

    it("başlık ve normalize mesaj artık TAZELENİR (eskiden hiç güncellenmiyordu)", () => {
        expect(CODE).toMatch(/title\s*=\s*excluded\.title/i);
        expect(CODE).toMatch(/normalized_message\s*=\s*excluded\.normalized_message/i);
    });
});

describe("O3 — olay bazlı ciddiyet", () => {
    it("system_error_events.severity kolonu NOT NULL eklenir", () => {
        expect(CODE).toMatch(/alter table system_error_events[\s\S]{0,120}add column if not exists severity text not null/i);
    });

    it("ciddiyet CHECK'i dört seviyeyi kısıtlar", () => {
        expect(CODE).toMatch(/check \(severity in \('info', 'warning', 'error', 'critical'\)\)/i);
    });

    it("RPC olay satırına severity YAZAR", () => {
        const insertBlock = CODE.slice(CODE.indexOf("insert into system_error_events"));
        expect(insertBlock.slice(0, 400)).toMatch(/group_id, occurred_at, severity/i);
        expect(insertBlock.slice(0, 600)).toMatch(/v_group_id, p_occurred_at, p_severity/i);
    });
});

describe("D3 — histogram bütünlüğü", () => {
    it("dizi uzunluğu ÖN KONTROLDEN geçer ve ihlalde exception fırlatır", () => {
        expect(CODE).toMatch(/jsonb_array_length\(r->'histogram'\) <> 10/i);
        expect(CODE).toMatch(/raise exception/i);
    });

    it("her histogram elemanı coalesce ile okunur (NULL kova zehirlenmesi)", () => {
        const matches = CODE.match(/coalesce\(\(r->'histogram'->>\d\)::int, 0\)/g) ?? [];
        expect(matches).toHaveLength(10);
    });
});

describe("D4 — açık gruplar da sınırsız birikmez", () => {
    it("purge'e 180 günlük AÇIK grup kolu eklenir", () => {
        expect(CODE).toMatch(/status in \('open', 'investigating'\)[\s\S]{0,160}interval '180 days'/i);
    });

    it("bug'a bağlı grup her iki kolda da KORUNUR", () => {
        const guards = CODE.match(/not exists \(select 1 from developer_bug_errors/gi) ?? [];
        expect(guards.length).toBeGreaterThanOrEqual(2);
    });

    it("olayı olan grup silinmez (her iki kol)", () => {
        const guards = CODE.match(/not exists \(select 1 from system_error_events/gi) ?? [];
        expect(guards.length).toBeGreaterThanOrEqual(2);
    });
});

describe("109'un korunması gereken davranışları düşmedi", () => {
    it("ciddiyet yalnız YUKARI çıkar", () => {
        expect(CODE).toMatch(/array_position\(v_levels, excluded\.severity\)[\s\S]{0,80}> array_position/i);
    });

    it("çözülmüş grup yeniden patlarsa AÇILIR", () => {
        expect(CODE).toMatch(/when system_error_groups\.status = 'resolved' then 'open'/i);
    });

    it("saatlik örnekleme tavanı korunur ve occurrence_count'u etkilemez", () => {
        expect(CODE).toMatch(/v_recent_count < greatest\(1, p_hourly_sample_cap\)/i);
        // Sayaç artışı koşulsuz: örnekleme yalnız olay INSERT'ini kapatır.
        expect(CODE).toMatch(/occurrence_count\s*=\s*system_error_groups\.occurrence_count \+ 1/i);
    });

    it("histogram toplaması eleman-bazlı ve atomik kalır", () => {
        expect(CODE).toMatch(/rm\.histogram\[1\]\s*\+\s*excluded\.histogram\[1\]/i);
        expect(CODE).toMatch(/on conflict \(bucket_at, endpoint, method\) do update/i);
    });
});

describe("DEFINER hijyeni — 2026-08 K1'in tekrarlanmaması", () => {
    it("üç RPC de public+anon+authenticated'tan revoke edilir", () => {
        for (const fn of ["record_error_occurrence", "record_request_metrics", "purge_telemetry"]) {
            expect(CODE, `${fn} rol-hedefli revoke taşımıyor`).toMatch(
                new RegExp(`revoke all on function ${fn}[\\s\\S]{0,400}?from public, anon, authenticated`, "i"),
            );
        }
    });

    it("her RPC search_path pinler", () => {
        const pins = CODE.match(/set search_path = public/gi) ?? [];
        expect(pins.length).toBeGreaterThanOrEqual(3);
    });

    it("yalnız service_role grant alır", () => {
        expect(CODE).not.toMatch(/grant execute[\s\S]{0,120}to (anon|authenticated)/i);
    });
});
