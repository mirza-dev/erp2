/**
 * Faz 16 — KAPALI TESLİM KANITI.
 *
 * Ürün fabrikaya `PARASUT_ENABLED=false` ile teslim ediliyor (kullanıcı kararı):
 * mali müşavir/hesap hazır olunca açılacak. Bu dosya, Faz 12-15'te eklenen
 * HİÇBİR yolun kapalıyken çalışmadığını kanıtlar — yani fabrikanın ilk günü
 * yanlış bir fatura kesilmesi YAPISAL OLARAK imkânsız.
 *
 * İki kat savunma test edilir:
 *   1. Her servis kendi `PARASUT_ENABLED` guard'ında erken döner.
 *   2. `parasutApiCall` sarmalayıcısı guard'ı ikinci kez uygular — bir servis
 *      guard'ı unutulsa bile ağa çıkılmaz.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "fs";

const OLD_ENABLED = process.env.PARASUT_ENABLED;
const OLD_MOCK    = process.env.PARASUT_USE_MOCK;

beforeEach(() => {
    // Teslim yapılandırması.
    process.env.PARASUT_ENABLED = "false";
    process.env.PARASUT_USE_MOCK = "true";
});

afterEach(() => {
    if (OLD_ENABLED === undefined) delete process.env.PARASUT_ENABLED;
    else process.env.PARASUT_ENABLED = OLD_ENABLED;
    if (OLD_MOCK === undefined) delete process.env.PARASUT_USE_MOCK;
    else process.env.PARASUT_USE_MOCK = OLD_MOCK;
    vi.restoreAllMocks();
});

describe("kapalıyken hiçbir Paraşüt servisi iş yapmaz", () => {
    it("alış faturası senkronu erken döner", async () => {
        const { serviceSyncPurchaseOrderToParasut } = await import("@/lib/services/parasut-purchase-service");
        const r = await serviceSyncPurchaseOrderToParasut("po-1");
        expect(r.success).toBe(false);
        expect(r.error).toContain("devre dışı");
    });

    it("alış CRON'u sıfır işler", async () => {
        const { serviceSyncAllPendingPurchaseBills } = await import("@/lib/services/parasut-purchase-service");
        expect(await serviceSyncAllPendingPurchaseBills()).toEqual({ processed: 0, succeeded: 0, failed: 0 });
    });

    it("tahsilat poll'ü sıfır işler ve `disabled` bildirir", async () => {
        const { serviceParasutPollPayments } = await import("@/lib/services/parasut-payment-service");
        const r = await serviceParasutPollPayments();
        expect(r.disabled).toBe(true);
        expect(r.checked).toBe(0);
    });

    it("stok mutabakatı sıfır işler ve `disabled` bildirir", async () => {
        const { serviceReconcileParasutStock } = await import("@/lib/services/parasut-stock-service");
        const r = await serviceReconcileParasutStock();
        expect(r.disabled).toBe(true);
        expect(r.checked).toBe(0);
        expect(r.corrected).toBe(0);
    });

    it("satış senkronu erken döner (mevcut davranış korunuyor)", async () => {
        const { serviceSyncOrderToParasut } = await import("@/lib/services/parasut-service");
        const r = await serviceSyncOrderToParasut("ord-1");
        expect(r.success).toBe(false);
        expect(r.error).toContain("devre dışı");
    });
});

describe("ikinci savunma hattı: parasutApiCall", () => {
    it("kapalıyken sarılan fonksiyon HİÇ çağrılmaz", async () => {
        const { parasutApiCall } = await import("@/lib/services/parasut-api-call");
        const inner = vi.fn();
        await expect(
            parasutApiCall({ op: "test" }, inner as unknown as () => Promise<void>),
        ).rejects.toThrow(/devre dışı/);
        expect(inner).not.toHaveBeenCalled();
    });
});

describe("kur çözümü kapalıyken ağa çıkmaz", () => {
    it("mock modda TCMB isteği yapılmaz", async () => {
        const { resolveInvoiceExchangeRate } = await import("@/lib/services/parasut-exchange-rate");
        const fetchImpl = vi.fn();
        const rate = await resolveInvoiceExchangeRate("USD", "2026-08-28", fetchImpl as unknown as typeof fetch);
        expect(rate).toBeUndefined();
        expect(fetchImpl).not.toHaveBeenCalled();
    });
});

describe("teslim yapılandırması belgelenmiş", () => {
    const env = readFileSync(".env.example", "utf8");

    it("iki anahtarın da gerektiği açıkça yazılı", () => {
        expect(env).toContain("İKİ ANAHTAR DA GEREKLİ");
        expect(env).toContain("Fabrika teslimi ikisi de kapalı yapılır");
    });

    it("gerçek API'nin canlı fatura keseceği uyarısı var", () => {
        expect(env).toContain("GERÇEK Paraşüt API'si (canlı fatura keser!)");
    });

    it("otomatik stok düzeltmesi varsayılan kapalı olarak belgelenmiş", () => {
        expect(env).toContain("PARASUT_STOCK_AUTOCORRECT=false");
    });
});

describe("gate script'i go-live'ı bloklar", () => {
    const gate = readFileSync("scripts/parasut-gate.ts", "utf8");

    it("mock'a karşı koşmayı REDDEDER (anlamsız doğrulama)", () => {
        expect(gate).toContain('if (process.env.PARASUT_USE_MOCK !== "false")');
        expect(gate).toContain("gate MOCK'a karşı anlamsızdır");
    });

    it("yazma maddeleri açık bayrak ister (kazara belge oluşmasın)", () => {
        expect(gate).toContain('const WRITE = process.argv.includes("--write");');
        expect(gate).toContain("--write verilmedi (gerçek belge oluşturmaz)");
    });

    it("stok invariant ihlalinde AÇIKÇA 'canlıya GEÇİLMEZ' der", () => {
        expect(gate).toContain("FATURA DA STOK DÜŞÜRDÜ");
        expect(gate).toContain("canlıya GEÇİLMEZ");
    });

    it("mutlak-yazım varsayımını iki kez yazarak sınar", () => {
        // Delta olsaydı ikinci yazım değeri katlardı.
        expect(gate).toContain("MUTLAK değil, DELTA davranışı!");
    });

    it("alış faturasının stok artırmadığını da ölçer", () => {
        expect(gate).toContain("ALIŞ FATURASI STOK ARTIRDI");
    });

    it("başarısız maddede exit 1 (CI/operatör bloklanır)", () => {
        expect(gate).toContain("GATE BAŞARISIZ — canlıya GEÇİLMEZ.");
        expect(gate).toContain("process.exit(1);");
    });

    it("npm script'i kayıtlı", () => {
        const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
        expect(pkg.scripts["parasut:gate"]).toBe("tsx scripts/parasut-gate.ts");
    });
});
