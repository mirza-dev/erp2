/**
 * Gerçek zamanlı senkron — sözleşme ve güvenlik sınırları.
 *
 * NEDEN BU MİMARİ: Roven'de RBAC ve finansal maskeleme Next.js API katmanında;
 * Postgres RLS politikalarının HEPSİ yalnız `service_role`'e açık. Bu yüzden
 * Supabase'in `postgres_changes` özelliği kullanılamaz — tarayıcıya satır
 * ulaşmaz, ulaşsa da yetki/maskeleme kapısı atlanmış olurdu.
 *
 * Onun yerine yayın (broadcast) VERİ TAŞIMAZ: yalnız "şu alan değişti" der,
 * istemci veriyi her zamanki korumalı API yolundan çeker. Bu testler o sınırı
 * korur — biri payload'a iş verisi koymaya kalkarsa kırılır.
 *
 * Canlı ölçüm (2026-08-29): 5/5 teslim, ortanca 77 ms.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFile } from "fs/promises";
import { join } from "path";
import {
    REALTIME_CHANNEL,
    REALTIME_EVENT,
    REALTIME_DOMAINS,
    DOMAIN_KEY_PREFIXES,
    parseDataChangePayload,
    keyMatchesDomains,
    affectedKeyPrefixes,
    isRealtimeDomain,
    type RealtimeDomain,
} from "@/lib/realtime/channel";

/** Yorumları düşürür — iddia açıklamaya değil koda bakmalı. */
function code(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

describe("payload ayrıştırma — ağdan gelen her şey şüphelidir", () => {
    it("geçerli payload'ı kabul eder", () => {
        const p = parseDataChangePayload({ domains: ["orders"], origin: "t_abc", at: 123 });
        expect(p).toEqual({ domains: ["orders"], origin: "t_abc", at: 123 });
    });

    it("bilinmeyen alanları süzer", () => {
        const p = parseDataChangePayload({ domains: ["orders", "kripto_cuzdan", "products"] });
        expect(p?.domains).toEqual(["orders", "products"]);
    });

    it("hiç geçerli alan yoksa null döner (boşuna tazeleme yok)", () => {
        expect(parseDataChangePayload({ domains: ["uyduruk"] })).toBeNull();
        expect(parseDataChangePayload({ domains: [] })).toBeNull();
        expect(parseDataChangePayload({})).toBeNull();
        expect(parseDataChangePayload(null)).toBeNull();
        expect(parseDataChangePayload("orders")).toBeNull();
    });

    it("origin string değilse null'a düşer (sahte tipte çökmemeli)", () => {
        expect(parseDataChangePayload({ domains: ["orders"], origin: 42 })?.origin).toBeNull();
    });

    it("at yoksa şimdiki zamanı koyar", () => {
        const p = parseDataChangePayload({ domains: ["orders"] });
        expect(typeof p?.at).toBe("number");
    });
});

describe("alan → SWR anahtarı eşleşmesi", () => {
    it("her alanın en az bir anahtar öneki var", () => {
        for (const d of REALTIME_DOMAINS) {
            expect(DOMAIN_KEY_PREFIXES[d]?.length, `${d} önek tanımsız`).toBeGreaterThan(0);
        }
    });

    it("sipariş değişikliği sipariş listesini ve sayaçları tazeler", () => {
        expect(keyMatchesDomains("/api/orders?all=1", ["orders"])).toBe(true);
        expect(keyMatchesDomains("/api/dashboard/counters", ["orders"])).toBe(true);
    });

    it("üretim girişi stoğu da tazeler (üretim stoğu artırır)", () => {
        expect(keyMatchesDomains("/api/products?all=1", ["production"])).toBe(true);
    });

    it("mal kabul stoğu tazeler (yolda mal → depoya girer)", () => {
        expect(keyMatchesDomains("/api/products?all=1", ["purchase_orders"])).toBe(true);
    });

    it("ilgisiz anahtarı tazelemez", () => {
        expect(keyMatchesDomains("/api/customers", ["production"])).toBe(false);
        expect(keyMatchesDomains("/api/settings/company", ["orders"])).toBe(false);
    });

    it("string olmayan SWR anahtarında çökmez", () => {
        expect(keyMatchesDomains(null, ["orders"])).toBe(false);
        expect(keyMatchesDomains(["/api/orders"], ["orders"])).toBe(false);
        expect(keyMatchesDomains(undefined, ["orders"])).toBe(false);
    });

    it("sorgu parametreli anahtarları da kapsar (önek eşleşmesi)", () => {
        expect(keyMatchesDomains("/api/products?page=3&kategori=vana", ["products"])).toBe(true);
    });

    it("çoklu alanda önekler birleşir, tekrar etmez", () => {
        const p = affectedKeyPrefixes(["orders", "products"]);
        expect(new Set(p).size).toBe(p.length);
        expect(p).toContain("/api/orders");
        expect(p).toContain("/api/products");
    });

    it("isRealtimeDomain yalnız bilinenleri kabul eder", () => {
        expect(isRealtimeDomain("orders")).toBe(true);
        expect(isRealtimeDomain("ORDERS")).toBe(false);
        expect(isRealtimeDomain(7)).toBe(false);
    });
});

describe("GÜVENLİK SINIRI — yayın iş verisi taşımamalı", () => {
    it("payload tipi yalnız alan/origin/zaman taşır", async () => {
        const src = code(await readFile(join(process.cwd(), "src/lib/realtime/channel.ts"), "utf-8"));
        const arayuz = src.slice(src.indexOf("interface DataChangePayload"));
        const govde = arayuz.slice(0, arayuz.indexOf("}"));
        // Bu alanlar dışında bir şey eklenirse, veri sızdırma yolu açılmış demektir:
        // yayın RBAC ve maskeleme kapısının DIŞINDAN geçer.
        for (const yasak of ["price", "cost", "total", "amount", "email", "name", "rows", "data"]) {
            expect(govde.toLowerCase(), `payload'da "${yasak}" alanı olmamalı`).not.toMatch(
                new RegExp(`\\b${yasak}\\b\\s*[?:]`),
            );
        }
        expect(govde).toMatch(/domains/);
    });

    it("istemci veriyi yayından DEĞİL, API'den çeker", async () => {
        const src = code(await readFile(join(process.cwd(), "src/lib/realtime/useRealtimeSync.ts"), "utf-8"));
        // mutate(..., undefined, { revalidate: true }) = "cache'i boşalt, API'den yeniden çek".
        // Payload'dan cache'e veri YAZILMAMALI.
        expect(src).toMatch(/mutateRef\.current\(\s*[\s\S]*?undefined,\s*[\s\S]*?revalidate:\s*true/);
        expect(src).not.toMatch(/mutate[\s\S]{0,80}payload\.(rows|data|items)/);
    });

    it("postgres_changes KULLANILMIYOR (RLS service_role'e kapalı)", async () => {
        for (const f of ["src/lib/realtime/channel.ts", "src/lib/realtime/useRealtimeSync.ts", "src/lib/realtime/broadcast.ts"]) {
            const src = await readFile(join(process.cwd(), f), "utf-8");
            expect(code(src), `${f}: postgres_changes kullanılmamalı`).not.toMatch(/postgres_changes/);
        }
    });
});

describe("yayın mutasyonu ASLA düşürmemeli", () => {
    const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const ORIG_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    beforeEach(() => {
        vi.resetModules();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });
    afterEach(() => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
        process.env.SUPABASE_SERVICE_ROLE_KEY = ORIG_KEY;
        vi.restoreAllMocks();
        vi.doUnmock("@supabase/supabase-js");
    });

    it("env eksikse sessizce false döner, FIRLATMAZ", async () => {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
        delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        const { broadcastDataChange } = await import("@/lib/realtime/broadcast");
        await expect(broadcastDataChange(["orders"])).resolves.toBe(false);
    });

    it("ağ hatasında FIRLATMAZ — sipariş kaydı yayın yüzünden kaybolamaz", async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
        vi.doMock("@supabase/supabase-js", () => ({
            createClient: () => ({
                channel: () => ({ httpSend: () => Promise.reject(new Error("ECONNRESET")) }),
            }),
        }));
        const { broadcastDataChange } = await import("@/lib/realtime/broadcast");
        await expect(broadcastDataChange(["orders"])).resolves.toBe(false);
    });

    it("sunucu reddederse false döner ama fırlatmaz", async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
        vi.doMock("@supabase/supabase-js", () => ({
            createClient: () => ({
                channel: () => ({ httpSend: () => Promise.resolve({ success: false, status: 429, error: "rate limited" }) }),
            }),
        }));
        const { broadcastDataChange } = await import("@/lib/realtime/broadcast");
        await expect(broadcastDataChange(["orders"])).resolves.toBe(false);
    });

    it("boş alan listesinde istek atmaz", async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
        const httpSend = vi.fn();
        vi.doMock("@supabase/supabase-js", () => ({
            createClient: () => ({ channel: () => ({ httpSend }) }),
        }));
        const { broadcastDataChange } = await import("@/lib/realtime/broadcast");
        await expect(broadcastDataChange([])).resolves.toBe(false);
        expect(httpSend).not.toHaveBeenCalled();
    });

    it("başarılı yayında doğru kanal/olay/payload gider", async () => {
        process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";
        process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
        const httpSend = vi.fn().mockResolvedValue({ success: true });
        const channel = vi.fn().mockReturnValue({ httpSend });
        vi.doMock("@supabase/supabase-js", () => ({ createClient: () => ({ channel }) }));
        const { broadcastDataChange } = await import("@/lib/realtime/broadcast");

        await expect(broadcastDataChange(["orders", "products"], "t_kerem")).resolves.toBe(true);
        expect(channel).toHaveBeenCalledWith(REALTIME_CHANNEL);
        expect(httpSend).toHaveBeenCalledWith(
            REALTIME_EVENT,
            expect.objectContaining({ domains: ["orders", "products"], origin: "t_kerem" }),
        );
    });
});

describe("mutasyon rotaları yayın yapıyor", () => {
    // Rota → beklenen alan(lar). Bunlar ofis ekibinin gerçekten çakıştığı yüzey.
    const ROTALAR: Array<[string, RealtimeDomain[]]> = [
        ["src/app/api/orders/route.ts", ["orders", "products"]],
        ["src/app/api/production/route.ts", ["production", "products"]],
        ["src/app/api/inventory/recount/route.ts", ["products"]],
        ["src/app/api/inventory/movements/route.ts", ["products"]],
        ["src/app/api/customers/route.ts", ["customers"]],
        ["src/app/api/vendors/route.ts", ["vendors"]],
        ["src/app/api/products/route.ts", ["products"]],
    ];

    for (const [yol, alanlar] of ROTALAR) {
        it(`${yol.replace("src/app/api/", "").replace("/route.ts", "")} → ${alanlar.join("+")}`, async () => {
            const src = code(await readFile(join(process.cwd(), yol), "utf-8"));
            expect(src, "broadcastDataChange import edilmemiş").toMatch(/broadcastDataChange/);
            for (const a of alanlar) {
                expect(src, `"${a}" alanı yayınlanmıyor`).toMatch(new RegExp(`"${a}"`));
            }
            // `void` = ateşle-unut: yayın beklenmemeli, mutasyonu geciktirmemeli.
            expect(src, "yayın await ediliyor — mutasyonu geciktirir").toMatch(/void broadcastDataChange\(/);
        });
    }
});

describe("istemci — kendi değişikliğini gereksiz çekmemeli", () => {
    it("origin bu sekmeyse tazeleme atlanır", async () => {
        const src = code(await readFile(join(process.cwd(), "src/lib/realtime/useRealtimeSync.ts"), "utf-8"));
        expect(src).toMatch(/payload\.origin === benim/);
    });

    it("sekme kimliği sessionStorage kapalıyken de üretilir (gizli sekme)", async () => {
        const src = code(await readFile(join(process.cwd(), "src/lib/realtime/useRealtimeSync.ts"), "utf-8"));
        expect(src).toMatch(/catch\s*{/);
    });

    it("çıkışta kanal kapatılır (sızıntı yok)", async () => {
        const src = code(await readFile(join(process.cwd(), "src/lib/realtime/useRealtimeSync.ts"), "utf-8"));
        expect(src).toMatch(/removeChannel/);
    });
});
