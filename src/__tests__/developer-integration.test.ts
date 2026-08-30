/**
 * Developer Console §13, §21 — entegrasyon noktalarının kilidi.
 *
 * Bu dosya "telemetri çalışıyor mu"yu değil, **BAĞLI MI**yı korur. Fonksiyonlar
 * mükemmel çalışsa bile kancalar sökülürse panel sessizce boş kalır ve bunu
 * hiçbir birim testi yakalamaz. Üç kanca var ve üçü de merkezî:
 *
 *   1. `api-error.ts`      → `handleApiError`/`captureRouteError` çağıran her route
 *   2. `instrumentation.ts`→ hatayı YUTMAYAN route'lar + RSC + sayfa hataları
 *   3. `proxy.ts`          → request ID üretimi ve yayılımı
 *
 * 2026-08 K2: (2)'nin eski tarifi "kalan 33 route" idi ve YANLIŞTI — o
 * route'ların 28'i kendi `catch`'inde yanıt döndürdüğü için hata Next'in
 * sınırına hiç ulaşmıyor, kanca tetiklenmiyordu. Hepsi (1)'e bağlandı;
 * `gate/route-error-coverage.test.ts` bunu kilitliyor.
 *
 * Ayrıca §21'in asıl şartı: iş mantığı dosyalarına telemetri SIZMAMIŞ olmalı.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    // Satır yorumları ÖNCE ayıklanır: bir `//` yorumunun içindeki `/**`
    // (ör. "// /dashboard/** erişimi") aksi hâlde blok yorum başlangıcı
    // sanılıp sonraki `*/`e kadar GERÇEK KODU yutuyordu (2026-08).
    return src.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}

const API_ERROR = code(read("src/lib/api-error.ts"));
const INSTRUMENTATION = code(read("src/instrumentation.ts"));
const PROXY = code(read("src/proxy.ts"));

describe("Kanca 1 — merkezi hata yakalayıcı (5xx döndüren TÜM catch'ler)", () => {
    it("handleApiError telemetriyi çağırır", () => {
        expect(API_ERROR).toContain('from "@/lib/telemetry/record"');
        expect(API_ERROR).toMatch(/scheduleTelemetry\(\(\) => recordError\(/);
    });

    it("hem ConfigError (503) hem genel hata (500) yolunda kayıt alınır", () => {
        expect(API_ERROR).toMatch(/capture\(err, label, 503\)/);
        expect(API_ERROR).toMatch(/capture\(err, label, 500\)/);
    });

    it("400 doğrulama yolu BİLİNÇLİ olarak kaydedilmez", () => {
        // Kullanıcı girdisi reddi sistem kusuru değildir; her doğrulama
        // hatasını hata merkezine yazmak gerçek hataları gürültüye gömerdi.
        const overflowBlock = API_ERROR.slice(
            API_ERROR.indexOf("numeric field overflow"),
            API_ERROR.indexOf("describeError(err)"),
        );
        expect(overflowBlock).not.toContain("capture(");
    });

    it("kayıt yanıttan SONRA çalışır — istek gecikmez (§24)", () => {
        expect(API_ERROR).toContain("scheduleTelemetry");
    });
});

describe("Kanca 2 — onRequestError (handleApiError'a uğramayan yollar + RSC)", () => {
    it("instrumentation.ts onRequestError export eder", () => {
        expect(INSTRUMENTATION).toMatch(/export const onRequestError/);
    });

    /**
     * 2026-08 Y2 — bu testin ESKİ hâli "register() export ETMEZ" diyordu ve
     * yanlış bir varsayımı kilitliyordu: `@sentry/nextjs` v10 kök
     * `sentry.server.config.ts` / `sentry.edge.config.ts` dosyalarını otomatik
     * YÜKLEMEZ (SDK'nın kendi uyarısı: "`Sentry.init` must be called inside of
     * an instrumentation file"). Yani sunucu/edge Sentry'si hiç başlamıyordu ve
     * `captureRequestError` no-op'tu. Test doğru davranışı kilitliyor.
     */
    it("register() export EDER ve iki runtime'ın config'ini de yükler", () => {
        expect(INSTRUMENTATION).toMatch(/export async function register/);
        expect(INSTRUMENTATION).toMatch(/NEXT_RUNTIME === "nodejs"[\s\S]{0,120}sentry\.server\.config/);
        expect(INSTRUMENTATION).toMatch(/NEXT_RUNTIME === "edge"[\s\S]{0,120}sentry\.edge\.config/);
    });

    it("init mantığı kopyalanmaz — kök config dosyaları tek kaynak kalır", () => {
        // `Sentry.init(` burada ÇAĞRILMAMALI: DSN/environment/beforeSend PII
        // scrub'ı ikiye bölmek, birinin sessizce eskimesi demektir.
        expect(INSTRUMENTATION).not.toMatch(/Sentry\.init\(/);
    });

    it("ÖNCE Sentry'ye bildirir, sonra yerel kayıt (mevcut davranış korunur)", () => {
        const sentryIdx = INSTRUMENTATION.indexOf("captureRequestError");
        const recordIdx = INSTRUMENTATION.indexOf("recordError");
        expect(sentryIdx).toBeGreaterThan(-1);
        expect(recordIdx).toBeGreaterThan(sentryIdx);
    });

    it("her iki adım de ayrı ayrı sarmalanır — kanca isteği etkilemez", () => {
        expect((INSTRUMENTATION.match(/try \{/g) ?? []).length).toBeGreaterThanOrEqual(2);
    });

    it("istek kapsamı dışında olduğu için request id'yi BAŞLIKTAN okur", () => {
        expect(INSTRUMENTATION).toMatch(/requestId: headerValue\(errorRequest\.headers, REQUEST_ID_HEADER\)/);
        expect(INSTRUMENTATION).toMatch(/userAgent: headerValue\(errorRequest\.headers, "user-agent"\)/);
    });
});

describe("Kanca 3 — request ID (§13)", () => {
    it("proxy her istekte ID üretir", () => {
        expect(PROXY).toContain("newRequestId()");
        expect(PROXY).toMatch(/const requestId = newRequestId\(\);/);
    });

    it("ID İSTEK başlığına yazılır — handler `next/headers` ile okur", () => {
        expect(PROXY).toMatch(/const requestHeaders = new Headers\(request\.headers\);/);
        expect(PROXY).toMatch(/requestHeaders\.set\(REQUEST_ID_HEADER, requestId\)/);
        expect(PROXY).toMatch(/NextResponse\.next\(\{ request: \{ headers: requestHeaders \} \}\)/);
    });

    it("ID yanıt başlığına da basılır — kullanıcı raporlayabilsin", () => {
        expect(PROXY).toMatch(/response\.headers\.set\(REQUEST_ID_HEADER, requestId\)/);
    });

    it("route imzaları DEĞİŞMEZ — ID parametre olarak geçirilmez", () => {
        const record = code(read("src/lib/telemetry/record.ts"));
        expect(record).toContain("readRequestId");
        // `next/headers` dinamik import: modül seviyesinde bağlanırsa test
        // ortamı ve istek-dışı çağrılar kırılır.
        const requestId = code(read("src/lib/telemetry/request-id.ts"));
        expect(requestId).toMatch(/await import\("next\/headers"\)/);
    });
});

describe("§21 — iş mantığına telemetri SIZMADI", () => {
    /** Telemetriye dokunması meşru olan dosyalar. */
    const ALLOWED = [
        "src/lib/api-error.ts",
        "src/instrumentation.ts",
        "src/proxy.ts",
        "src/app/dashboard/layout.tsx",
    ];

    function walk(dir: string, acc: string[] = []): string[] {
        for (const entry of readdirSync(dir)) {
            if (entry === "node_modules" || entry === "__tests__") continue;
            const p = join(dir, entry);
            if (statSync(p).isDirectory()) walk(p, acc);
            else if (/\.tsx?$/.test(entry)) acc.push(p);
        }
        return acc;
    }

    const root = join(process.cwd(), "src");
    const offenders = walk(root)
        .map(p => p.slice(root.length + 1))
        .filter(rel =>
            !rel.startsWith("lib/telemetry/")
            && !rel.startsWith("app/api/developer/")
            && !rel.startsWith("app/dashboard/developer/")
            && !rel.startsWith("components/developer/")
            && !rel.startsWith("components/layout/TelemetryBridge")
            && !rel.startsWith("lib/supabase/telemetry")
            && !rel.startsWith("lib/supabase/developer-")
            && !rel.startsWith("lib/services/developer-console-service")
            && !ALLOWED.includes(`src/${rel}`),
        )
        .filter(rel => /recordError\(|recordEvent\(|scheduleTelemetry\(/.test(read(`src/${rel}`)));

    it("sipariş/teklif/stok/satın alma modüllerine telemetri çağrısı EKLENMEDİ", () => {
        expect(
            offenders,
            `İş mantığına telemetri sızdı:\n  ${offenders.join("\n  ")}\n`
            + "→ Kayıt merkezî kancalardan alınmalı (api-error / instrumentation).",
        ).toEqual([]);
    });

    it("hiçbir iş route'una sarmalayıcı eklenmedi", () => {
        // `/api/developer/*` dışındaki route dosyalarında telemetri importu yok.
        const apiRoot = join(process.cwd(), "src/app/api");
        const bad: string[] = [];
        for (const f of walk(apiRoot)) {
            const rel = f.slice(apiRoot.length + 1);
            if (rel.startsWith("developer/")) continue;
            if (/@\/lib\/telemetry\//.test(readFileSync(f, "utf8"))) bad.push(rel);
        }
        expect(bad, bad.join("\n")).toEqual([]);
    });
});

describe("RUM toplayıcısı — tek nokta, kendini ölçmez", () => {
    const RUM = code(read("src/lib/telemetry/rum-client.ts"));
    const LAYOUT = code(read("src/app/dashboard/layout.tsx"));

    it("dashboard kabuğuna tek yerden bağlanır", () => {
        expect(LAYOUT).toContain("TelemetryBridge");
        expect(code(read("src/components/layout/TelemetryBridge.tsx")))
            .toContain("installRumCollector");
    });

    it("kendi ucunu ölçmez (sonsuz döngü yok)", () => {
        expect(RUM).toMatch(/function isExcluded/);
        expect(RUM).toMatch(/RUM_ENDPOINT = "\/api\/developer\/rum"/);
    });

    it("yalnız kendi origin'imizin /api yolları ölçülür", () => {
        expect(RUM).toMatch(/url\.origin !== window\.location\.origin/);
        expect(RUM).toMatch(/url\.pathname\.startsWith\("\/api\/"\)/);
    });

    it("orijinal fetch saklanır ve yanıt AYNEN geri verilir", () => {
        expect(RUM).toMatch(/originalFetch = window\.fetch\.bind\(window\)/);
        expect(RUM).toMatch(/return response;/);
        // Ölçüm hatası isteği etkilemesin diye iç try/catch
        expect(RUM).toMatch(/const response = await originalFetch\(input, init\);\s*try \{/);
    });

    it("idempotent kurulum (StrictMode iki kez çalıştırır)", () => {
        expect(RUM).toMatch(/if \(installed \|\| typeof window === "undefined"\) return/);
    });
});
