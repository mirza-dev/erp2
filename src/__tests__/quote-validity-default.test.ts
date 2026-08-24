/**
 * B2 (2026-08-24) — Teklif geçerlilik varsayılanı.
 *
 * `quotes.valid_until` PRATİKTE HİÇ DOLMUYORDU: QuoteForm'da alan boş
 * başlıyor + opsiyonel gönderiliyor → kullanıcı elle doldurmazsa null.
 * Canlı veride 16 teklifin hiçbirinde yoktu ⇒ expire cron'u, `quote_expired`
 * uyarısı ve "Süresi Doldu" sekmesi fiilen ölüydü.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
    addDaysToISODate,
    normalizeValidityDays,
    getValidUntilBadge,
    DEFAULT_QUOTE_VALIDITY_DAYS,
} from "@/app/dashboard/quotes/_utils/quote-display";

const root = process.cwd();
const MIG_106 = readFileSync(join(root, "supabase/migrations/106_quote_validity_days.sql"), "utf8");
const FORM_SRC = readFileSync(join(root, "src/app/dashboard/quotes/_components/QuoteForm.tsx"), "utf8");
const ROUTE_SRC = readFileSync(join(root, "src/app/api/settings/company/route.ts"), "utf8");

describe("addDaysToISODate", () => {
    it("gün ekler", () => {
        expect(addDaysToISODate("2026-08-24", 30)).toBe("2026-09-23");
    });

    it("ay sonunu doğru taşırır", () => {
        expect(addDaysToISODate("2026-01-31", 1)).toBe("2026-02-01");
        expect(addDaysToISODate("2026-11-30", 1)).toBe("2026-12-01");
    });

    it("yıl sınırını geçer", () => {
        expect(addDaysToISODate("2026-12-20", 30)).toBe("2027-01-19");
    });

    it("artık yılı bilir", () => {
        expect(addDaysToISODate("2028-02-28", 1)).toBe("2028-02-29");
        expect(addDaysToISODate("2026-02-28", 1)).toBe("2026-03-01");
    });

    it("her zaman sıfır dolgulu YYYY-MM-DD döner (string karşılaştırması bozulmaz)", () => {
        const out = addDaysToISODate("2026-01-05", 3);
        expect(out).toBe("2026-01-08");
        expect(out).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it("bozuk girdide boş string (alan doldurulmadan bırakılır)", () => {
        expect(addDaysToISODate("", 30)).toBe("");
        expect(addDaysToISODate("24.08.2026", 30)).toBe("");
    });
});

describe("normalizeValidityDays", () => {
    it("geçerli değeri korur", () => {
        expect(normalizeValidityDays(15)).toBe(15);
        expect(normalizeValidityDays(1)).toBe(1);
        expect(normalizeValidityDays(365)).toBe(365);
    });

    it("sınır dışı / bozuk değerde varsayılana düşer", () => {
        for (const bad of [0, -5, 366, 12.5, "30", null, undefined, NaN]) {
            expect(normalizeValidityDays(bad)).toBe(DEFAULT_QUOTE_VALIDITY_DAYS);
        }
    });

    it("varsayılan 30", () => {
        expect(DEFAULT_QUOTE_VALIDITY_DAYS).toBe(30);
    });
});

describe("uçtan uca: varsayılan geçerlilik gerçek bir rozet üretir", () => {
    it("bugün + 30 gün → 'gün kaldı' rozeti (eskiden rozet HİÇ çıkmıyordu)", () => {
        const today = new Date();
        const pad = (n: number) => String(n).padStart(2, "0");
        const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        const validUntil = addDaysToISODate(todayIso, 30);
        const badge = getValidUntilBadge(validUntil);
        expect(badge).not.toBeNull();
        expect(badge!.type).toBe("ok");
        expect(badge!.text).toBe("30 gün kaldı");
    });
});

describe("migration 106", () => {
    it("company_settings += quote_validity_days (default 30, idempotent)", () => {
        expect(MIG_106).toMatch(/add column if not exists quote_validity_days\s+integer not null default 30/i);
    });

    it("CHECK 1..365 — 0/negatif teklifi doğar doğmaz süresiz-dolmuş yapardı", () => {
        expect(MIG_106).toMatch(/check \(quote_validity_days between 1 and 365\)/i);
    });

    it("duplicate_object guard'ı var (manuel double-apply patlamaz)", () => {
        expect(MIG_106).toMatch(/when duplicate_object then null/i);
    });
});

describe("QuoteForm entegrasyonu (kaynak kilidi)", () => {
    it("YALNIZ yeni teklifte doldurur (initialData → dokunmaz)", () => {
        expect(FORM_SRC).toMatch(/if \(!initialData\) \{\s*\n\s*const days = normalizeValidityDays\(s\.quote_validity_days\);/);
    });

    it("alan BOŞKEN doldurur — kullanıcının yazdığının üstüne YAZMAZ", () => {
        expect(FORM_SRC).toMatch(/setValidUntil\(prev => \(prev === "" \? addDaysToISODate\(base, days\) : prev\)\)/);
    });

    it("ayar okuması normalize edilir (migration uygulanmadan da çalışır)", () => {
        expect(FORM_SRC).toMatch(/normalizeValidityDays\(s\.quote_validity_days\)/);
    });

    // Ayrı bir effect quoteDate'i beklerse effect-ZİNCİRİ kurulur (fazladan
    // render + kırılganlık). Ayarların geldiği yerde tek seferde yazılır.
    it("geçerlilik için AYRI effect kurulmaz (effect-zinciri yok)", () => {
        expect(FORM_SRC).not.toMatch(/\[initialData, validityDays, quoteDate\]/);
        expect(FORM_SRC).not.toMatch(/setValidityDays/);
    });
});

describe("settings API sözleşmesi", () => {
    it("quote_validity_days hem GET whitelist'inde hem PATCH allowed'ında", () => {
        expect(ROUTE_SRC).toMatch(/SAFE_COMPANY_FIELDS[\s\S]*?"quote_validity_days"/);
        expect(ROUTE_SRC).toMatch(/const allowed = \[[^\]]*"quote_validity_days"/);
    });

    it("sunucu tarafı 1..365 tam sayı doğrulaması var (defense in depth)", () => {
        expect(ROUTE_SRC).toMatch(/Number\.isInteger\(validity\)[\s\S]*?validity < 1[\s\S]*?validity > 365/);
    });
});
