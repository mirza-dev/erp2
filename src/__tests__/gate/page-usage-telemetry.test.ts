/**
 * GATE: modül kullanım sayacı (madde #14).
 *
 * Sayaç YENİ altyapı kurmaz — `request_metrics` tablosunu, RUM ingest'ini,
 * `KNOWN_ENDPOINTS` allowlist'ini ve 30 günlük retention'ı yeniden kullanır.
 * Bu ucuz çözümün bir bedeli var ve test onu koruyor:
 *
 *   **Aynı tablo artık iki farklı şey taşıyor.** Sayfa görüntülemeleri birer
 *   istek DEĞİL — süreleri 0, statüleri hep 200. Performans okuması onları
 *   dışlamazsa p95 aşağı çekilir, hata oranı suni olarak düşer ve
 *   `errorRateCorroborated` sağlık kararı bozulur: panel "her şey yolunda"
 *   derken gerçek uçlar yavaşlıyor olabilir. Ayrım tek bir `.like()` filtresine
 *   bakıyor ve sessizce silinebilir.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { KNOWN_ENDPOINTS } from "@/lib/telemetry/known-endpoints";
import { normalizeEndpoint } from "@/lib/telemetry/endpoint";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");

const telemetrySrc = read("src/lib/supabase/telemetry.ts");

describe("GATE — modül kullanım sayacı", () => {
    it("performans okuması YALNIZ /api uçlarını kapsar", () => {
        // Bu filtre giderse sayfa görüntülemeleri performans tablosuna karışır.
        const perf = telemetrySrc.slice(telemetrySrc.indexOf("export async function dbPerformanceSummary"));
        expect(perf.slice(0, 1200)).toMatch(/\.like\("endpoint", "\/api\/%"\)/);
    });

    it("kullanım okuması YALNIZ dashboard yollarını kapsar", () => {
        const usage = telemetrySrc.slice(telemetrySrc.indexOf("export async function dbPageUsageSummary"));
        expect(usage.slice(0, 900)).toMatch(/\.like\("endpoint", "\/dashboard%"\)/);
        // İki küme kesişmemeli — aksi hâlde aynı satır iki kez sayılır.
        expect("/api/products".startsWith("/dashboard")).toBe(false);
        expect("/dashboard/products".startsWith("/api/")).toBe(false);
    });

    it("istemci gezinmeyi kaydediyor ve kabuk bunu pathname'e bağlıyor", () => {
        expect(read("src/lib/telemetry/rum-client.ts")).toMatch(/export function recordPageView/);
        const bridge = read("src/components/layout/TelemetryBridge.tsx");
        expect(bridge).toMatch(/usePathname\(\)/);
        expect(bridge).toMatch(/recordPageView\(pathname\)/);
    });

    it("gönderilen dashboard yolları sunucunun ALLOWLIST'inden geçer", () => {
        // Geçmezse sunucu sessizce reddeder ve panel boş kalır — sayaç
        // "çalışıyor" görünüp hiçbir şey ölçmez. Bu, yeşil testle birlikte
        // gelebilecek en sinsi kusur.
        for (const path of ["/dashboard", "/dashboard/products", "/dashboard/quotes", "/dashboard/orders"]) {
            const normalized = normalizeEndpoint(path);
            expect(normalized, `${path} normalize edilemedi`).toBe(path);
            expect(KNOWN_ENDPOINTS.has(normalized!), `${path} allowlist'te yok`).toBe(true);
        }
        // Dinamik segment yer tutucuya inmeli (her ürün için ayrı satır olmasın).
        expect(normalizeEndpoint("/dashboard/products/3f2a4b5c-6d7e-4f80-9a1b-2c3d4e5f6a7b"))
            .toBe("/dashboard/products/[id]");
    });

    it("sorgu dizesi düşürülür — arama kutusundaki müşteri adı telemetriye gitmez", () => {
        expect(normalizeEndpoint("/dashboard/customers?search=Ahmet%20Yilmaz"))
            .toBe("/dashboard/customers");
    });

    it("uç yanıtı kullanım verisini AYRI alanda taşır", () => {
        expect(read("src/app/api/developer/performance/route.ts")).toMatch(/dbPageUsageSummary/);
        expect(read("src/lib/telemetry/console-types.ts")).toMatch(/pageUsage: PageUsage\[\]/);
    });
});
