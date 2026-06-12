/**
 * Denetim Y6 (2026-06) — UTC gün-sınırı kayması kilitleri.
 *
 * `new Date().toISOString().slice(0,10)` UTC tarihi verir: İstanbul (UTC+3)
 * 00:00–03:00 arasında "bugün" DÜN'e kayar → teklif/PO vadesi 1 gün geç dolar,
 * vadesi geçmiş teklif gece penceresinde kabul edilebilirdi. Düzeltme:
 * `localISODate()` (stock-utils — yerel takvim bileşenleri).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { localISODate } from "@/lib/stock-utils";

describe("localISODate — yerel takvim, UTC kayması yok", () => {
    it("gece yarısından hemen sonra yerel günü verir (TZ'den bağımsız doğrulama)", () => {
        // Yerel 12 Haziran 00:30 — localISODate yerel bileşen okur → her zaman 06-12.
        // (Aynı anın toISOString'i UTC+3 makinede "06-11" olurdu — bug buydu.)
        const ts = new Date(2026, 5, 12, 0, 30).getTime();
        expect(localISODate(ts)).toBe("2026-06-12");
    });

    it("gün sonu 23:59'da da yerel günü verir", () => {
        const ts = new Date(2026, 5, 12, 23, 59).getTime();
        expect(localISODate(ts)).toBe("2026-06-12");
    });

    it("ay/gün sıfır dolgulu (string karşılaştırma sözleşmesi)", () => {
        expect(localISODate(new Date(2026, 0, 5).getTime())).toBe("2026-01-05");
    });
});

describe("vade karşılaştıran modüller localISODate kullanır (UTC dilimleme geri gelmez)", () => {
    const read = (p: string) => readFileSync(p, "utf8");

    const NO_UTC_SLICE = [
        "src/lib/services/order-service.ts",
        "src/lib/services/quote-service.ts",
        "src/lib/supabase/orders.ts",
        "src/lib/supabase/purchase-orders.ts",
    ];

    for (const p of NO_UTC_SLICE) {
        it(`${p}: toISOString().slice(0, 10) YOK + localISODate import edilir`, () => {
            const src = read(p);
            expect(src).not.toContain("toISOString().slice(0, 10)");
            expect(src).toMatch(/import \{[^}]*localISODate[^}]*\} from "@\/lib\/stock-utils"/);
        });
    }

    it("parasut-service: issueDate'ler localISODate; tek istisna computeDueDate (Z-bazlı iç hesap)", () => {
        const src = read("src/lib/services/parasut-service.ts");
        const utcSlices = src.match(/toISOString\(\)\.slice\(0, 10\)/g) ?? [];
        // yalnız computeDueDate'in dönüşü (issueDate+Z'den türetilen vade — tutarlı UTC matematiği)
        expect(utcSlices.length).toBe(1);
        expect(src).toMatch(/const issueDate = localISODate\(Date\.now\(\)\)/);
    });
});
