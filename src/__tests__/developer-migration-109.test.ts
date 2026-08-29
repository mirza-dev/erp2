/**
 * Migration 109 — Developer Console telemetri şeması.
 *
 * Migration'lar bu projede Studio'dan ELLE uygulanıyor; dosya ile canlı
 * arasındaki tek köprü `scripts/check-migrations.ts` probu ve bu kilit.
 * Buradaki iddialar şemanın §16/§23 sözleşmesini korur: RLS kapalı kalmasın,
 * retention sütunları düşmesin, örnekleme tavanı kaldırılmasın.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { BUCKET_COUNT, DURATION_BUCKETS } from "@/lib/telemetry/endpoint";

const SQL = readFileSync(
    join(process.cwd(), "supabase/migrations/109_developer_console.sql"),
    "utf8",
);

/** SQL satır yorumlarını ayıkla — açıklamalar yanlış-pozitif üretmesin. */
const CODE = SQL.replace(/--[^\n]*/g, "");

const TABLES = [
    "system_error_groups",
    "system_error_events",
    "system_events",
    "developer_bugs",
    "developer_bug_errors",
    "request_metrics",
];

describe("tablolar", () => {
    it("altı tablo idempotent oluşturulur", () => {
        for (const t of TABLES) {
            expect(CODE, `${t} yok`).toMatch(new RegExp(`create table if not exists ${t}\\b`, "i"));
        }
    });

    it("mevcut iş tablolarına DOKUNULMAZ (§21 — ERP yeniden yazılmıyor)", () => {
        // Yalnız yeni tablolar; hiçbir iş tablosunda alter/drop yok.
        expect(CODE).not.toMatch(/alter table (?!.*(system_|developer_|request_metrics))/i);
        expect(CODE).not.toMatch(/drop table/i);
    });
});

describe("RLS — service_role dışında erişim yok", () => {
    it("her tabloda RLS açık", () => {
        for (const t of TABLES) {
            expect(CODE, `${t} RLS kapalı`).toMatch(
                new RegExp(`alter table ${t} enable row level security`, "i"),
            );
        }
    });

    it("her policy yalnız service_role'e izin verir", () => {
        for (const t of TABLES) {
            expect(CODE, `${t} policy yok`).toMatch(
                new RegExp(`create policy "service_${t}_all" on ${t}[\\s\\S]{0,120}auth\\.role\\(\\) = 'service_role'`, "i"),
            );
        }
    });

    it("anon/authenticated rolüne doğrudan grant YOK", () => {
        expect(CODE).not.toMatch(/grant\s+(select|insert|update|delete|all)[\s\S]{0,60}to\s+(anon|authenticated)/i);
    });
});

describe("retention (§16, §23) — sınırsız büyüme engellenir", () => {
    it("olay tablolarında expires_at var ve varsayılanı dolu", () => {
        for (const t of ["system_error_events", "system_events", "request_metrics"]) {
            const block = CODE.slice(CODE.indexOf(`create table if not exists ${t}`));
            expect(block.slice(0, 1_400), `${t} expires_at yok`).toMatch(/expires_at\s+timestamptz not null default/i);
        }
    });

    it("expires_at indeksleri var — purge tablo taraması yapmasın", () => {
        expect(CODE).toMatch(/ix_error_events_expiry[\s\S]{0,80}expires_at/i);
        expect(CODE).toMatch(/ix_system_events_expiry[\s\S]{0,80}expires_at/i);
        expect(CODE).toMatch(/ix_request_metrics_expiry[\s\S]{0,80}expires_at/i);
    });

    it("purge fonksiyonu üç olay tablosunu da temizler", () => {
        const fn = CODE.slice(CODE.indexOf("function purge_telemetry"));
        expect(fn).toMatch(/delete from system_error_events where expires_at < now\(\)/i);
        expect(fn).toMatch(/delete from system_events where expires_at < now\(\)/i);
        expect(fn).toMatch(/delete from request_metrics where expires_at < now\(\)/i);
    });

    it("bug'a bağlı hata grubu ASLA silinmez", () => {
        const fn = CODE.slice(CODE.indexOf("function purge_telemetry"));
        expect(fn).toMatch(/not exists\s*\(\s*select 1 from developer_bug_errors/i);
    });

    it("saatlik cron retention'ı çağırır", () => {
        const crons = readFileSync(join(process.cwd(), ".github/workflows/crons.yml"), "utf8");
        expect(crons).toContain("/api/developer/retention");
        expect(crons).toContain("telemetry_retention");
    });
});

describe("gruplama ve örnekleme (§6, §23)", () => {
    it("fingerprint UNIQUE — gruplama anahtarı çoğalamaz", () => {
        expect(CODE).toMatch(/fingerprint\s+text not null unique/i);
    });

    it("tekrar eden hata yeni satır değil sayaç artırır", () => {
        const fn = CODE.slice(CODE.indexOf("function record_error_occurrence"));
        expect(fn).toMatch(/on conflict \(fingerprint\) do update/i);
        expect(fn).toMatch(/occurrence_count = system_error_groups\.occurrence_count \+ 1/i);
    });

    it("ciddiyet yalnız YUKARI çıkar — kritik görülen hata warning'e düşmez", () => {
        const fn = CODE.slice(CODE.indexOf("function record_error_occurrence"));
        expect(fn).toMatch(/array_position\(v_levels, excluded\.severity\)/i);
    });

    it("çözülmüş grup yeniden patlarsa yeniden açılır (regresyon gizlenmez)", () => {
        const fn = CODE.slice(CODE.indexOf("function record_error_occurrence"));
        expect(fn).toMatch(/when system_error_groups\.status = 'resolved' then 'open'/i);
    });

    it("saatlik örnekleme tavanı var — tablo hata fırtınasında şişmez", () => {
        const fn = CODE.slice(CODE.indexOf("function record_error_occurrence"));
        expect(fn).toMatch(/p_hourly_sample_cap\s+int default 20/i);
        expect(fn).toMatch(/occurred_at >= now\(\) - interval '1 hour'/i);
        expect(fn).toMatch(/if v_recent_count < greatest\(1, p_hourly_sample_cap\)/i);
    });
});

describe("SECURITY DEFINER hijyeni (gate ile aynı kural)", () => {
    const FUNCTIONS = ["record_error_occurrence", "record_request_metrics", "purge_telemetry"];

    it("üç fonksiyon da search_path sabitler", () => {
        expect((CODE.match(/set search_path = public/gi) ?? []).length)
            .toBeGreaterThanOrEqual(FUNCTIONS.length);
    });

    it("her fonksiyon public'ten revoke edilip service_role'e grant edilir", () => {
        for (const fn of FUNCTIONS) {
            expect(CODE, `${fn} revoke yok`).toMatch(new RegExp(`revoke all on function ${fn}`, "i"));
            expect(CODE, `${fn} grant yok`).toMatch(new RegExp(`grant execute on function ${fn}`, "i"));
        }
    });
});

describe("istek metrikleri — TS ile SQL aynı kovayı kullanır", () => {
    it("histogram uzunluğu TS sabitiyle birebir", () => {
        expect(BUCKET_COUNT).toBe(10);
        expect(DURATION_BUCKETS.length).toBe(BUCKET_COUNT);
        expect(CODE).toMatch(new RegExp(`array_length\\(histogram, 1\\) = ${BUCKET_COUNT}`, "i"));
        expect(CODE).toMatch(/default array\[0,0,0,0,0,0,0,0,0,0\]/i);
    });

    it("kova sınırları SQL yorumunda da yazılı (drift görünür olsun)", () => {
        const finite = DURATION_BUCKETS.filter(b => Number.isFinite(b)).join(",");
        expect(SQL).toContain(finite);
    });

    it("saatlik kova benzersiz — aynı uç iki satıra bölünmez", () => {
        expect(CODE).toMatch(/unique \(bucket_at, endpoint, method\)/i);
    });

    it("upsert on conflict ile TOPLAR (üzerine yazmaz)", () => {
        const fn = CODE.slice(CODE.indexOf("function record_request_metrics"));
        expect(fn).toMatch(/on conflict \(bucket_at, endpoint, method\) do update/i);
        expect(fn).toMatch(/sample_count = rm\.sample_count \+ excluded\.sample_count/i);
        expect(fn).toMatch(/max_ms\s+= greatest\(rm\.max_ms, excluded\.max_ms\)/i);
        // Histogramın 10 gözü de toplanır
        for (let i = 1; i <= BUCKET_COUNT; i++) {
            expect(fn, `histogram[${i}] toplanmıyor`)
                .toMatch(new RegExp(`rm\\.histogram\\[${i}\\]\\s*\\+ excluded\\.histogram\\[${i}\\]`));
        }
    });
});

describe("bug ↔ hata bağı", () => {
    it("join tablosu iki yönde de cascade siler (çürük bağ kalmaz)", () => {
        const block = CODE.slice(CODE.indexOf("create table if not exists developer_bug_errors"));
        expect(block).toMatch(/bug_id\s+uuid not null references developer_bugs\(id\) on delete cascade/i);
        expect(block).toMatch(/error_group_id\s+uuid not null references system_error_groups\(id\) on delete cascade/i);
        expect(block).toMatch(/primary key \(bug_id, error_group_id\)/i);
    });
});

describe("migration probu", () => {
    it("check-migrations 109 için probe taşır", () => {
        const script = readFileSync(join(process.cwd(), "scripts/check-migrations.ts"), "utf8");
        expect(script).toMatch(/"109":\s*\{ kind: "table", table: "system_error_groups" \}/);
    });
});
