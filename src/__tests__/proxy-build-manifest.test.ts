/**
 * P0 regression — proxy.ts production pipeline kayıt kontrolü.
 *
 * Önceki Review'de middleware.ts + `runtime: "nodejs"` config setup edilmişti
 * ama Next 16 Turbopack build'de functions-config-manifest.json BOŞ kaldı →
 * production'da middleware INVOKE EDİLMEDİ → auth/cron/rate-limit gate'leri
 * tamamen bypass oldu. Smoke kanıtı:
 *   - GET /dashboard auth'suz 200 (login redirect olmalıydı)
 *   - GET /api/products 401 değil 200
 *   - POST /api/parasut/sync-all Bearer'sız 200 (CRON_SECRET 401 olmalıydı)
 *   - X-RateLimit-* header yok
 *
 * Çözüm: `middleware.ts` → `src/proxy.ts` rename (proxy.ts convention Next 16
 * Turbopack tarafından otomatik Node runtime'a alınır; root-level proxy.ts
 * Turbopack tarafından discover edilmediği için src/ altında).
 *
 * Bu test post-build manifest dosyalarını inceler — `npx run build` çağrısı
 * vitest scope'unda yapılmaz (yavaş + ENV bağımlılığı), ancak last-build
 * artifact'larını okur. CI'da `npm run build && npx vitest run` sırasıyla
 * çalıştığında bu kontrol her zaman güncel olur.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MANIFEST_PATH = join(
    process.cwd(),
    ".next/server/functions-config-manifest.json",
);

const PROXY_SOURCE = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");

describe("P0 regression — proxy.ts production pipeline kayıt", () => {
    it("src/proxy.ts dosyası mevcut (middleware.ts'den taşındı)", () => {
        expect(existsSync(join(process.cwd(), "src/proxy.ts"))).toBe(true);
    });

    it("root-level middleware.ts ARTIK YOK (Turbopack ikisini birden bulursa hata atar)", () => {
        expect(existsSync(join(process.cwd(), "middleware.ts"))).toBe(false);
        expect(existsSync(join(process.cwd(), "src/middleware.ts"))).toBe(false);
    });

    it("proxy.ts named export `proxy` fonksiyonu içerir (Next 16 convention)", () => {
        // Next 16 build error: "Ensure this file has either a default or 'proxy'
        // function export." — bu satırın silinmesi production middleware'i kırar.
        expect(PROXY_SOURCE).toMatch(/export\s+async\s+function\s+proxy\s*\(/);
    });

    it("proxy.ts backward-compat `middleware` alias export'u korur (test importları kırılmasın)", () => {
        expect(PROXY_SOURCE).toMatch(/export\s+const\s+middleware\s*=\s*proxy/);
    });

    it("proxy.ts config.matcher tanımlı (sayfa scope'u belirli)", () => {
        expect(PROXY_SOURCE).toMatch(/matcher:\s*\["\/\(\(\?!_next/);
    });

    it("[build sonrası] functions-config-manifest /_middleware entry'sini içerir (Node runtime kayıtlı)", () => {
        // Bu assertion sadece `npm run build` sonrası geçerli. Build edilmeden
        // çalıştırılırsa manifest dosyası yok → test skip (önceki build state'i
        // garanti edilmediği için lenient: file yoksa açıklayıcı mesaj).
        if (!existsSync(MANIFEST_PATH)) {
            // Manifest yok — build çalıştırılmamış. CI'da build her zaman önce
            // koşturulur; lokal vitest run'da bu durum normal.
            console.warn(
                "[proxy-build-manifest test] .next/server/functions-config-manifest.json yok — `npm run build` çalıştır ve testi tekrar koş.",
            );
            return;
        }
        const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as {
            version: number;
            functions: Record<string, { runtime: string; matchers?: unknown[] }>;
        };
        expect(manifest.functions).toBeDefined();
        expect(manifest.functions["/_middleware"]).toBeDefined();
        expect(manifest.functions["/_middleware"]?.runtime).toBe("nodejs");
        expect(Array.isArray(manifest.functions["/_middleware"]?.matchers)).toBe(true);
    });
});
