/**
 * Faz 12 — adapter fabrikası ve import döngüsünün kırılması.
 *
 * Faz 12 öncesi `getParasutAdapter()` gerçek modda THROW ediyordu; tüm Paraşüt
 * entegrasyonu in-memory mock'a karşı çalışıyordu. Bu dosya fişin gerçekten
 * takıldığını ve mimarinin döngüsüz kaldığını kilitler.
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "fs";

const OLD = process.env.PARASUT_USE_MOCK;
afterEach(async () => {
    if (OLD === undefined) delete process.env.PARASUT_USE_MOCK;
    else process.env.PARASUT_USE_MOCK = OLD;
    (await import("@/lib/parasut")).resetParasutAdapterCache();
});

describe("getParasutAdapter", () => {
    it("varsayılan (dev/test) mock döner", async () => {
        delete process.env.PARASUT_USE_MOCK;
        const { getParasutAdapter, mockParasutAdapter } = await import("@/lib/parasut");
        expect(getParasutAdapter()).toBe(mockParasutAdapter);
    });

    it("PARASUT_USE_MOCK=false → GERÇEK HTTP adapter (artık throw etmiyor)", async () => {
        process.env.PARASUT_USE_MOCK = "false";
        const { getParasutAdapter, resetParasutAdapterCache } = await import("@/lib/parasut");
        const { HttpParasutAdapter } = await import("@/lib/parasut-http-adapter");
        resetParasutAdapterCache();
        expect(getParasutAdapter()).toBeInstanceOf(HttpParasutAdapter);
    });

    it("gerçek adapter singleton — her çağrıda yeni istemci kurulmaz", async () => {
        process.env.PARASUT_USE_MOCK = "false";
        const { getParasutAdapter, resetParasutAdapterCache } = await import("@/lib/parasut");
        resetParasutAdapterCache();
        expect(getParasutAdapter()).toBe(getParasutAdapter());
    });

    it("mock ile gerçek adapter aynı sözleşmenin tüm metotlarını taşır", async () => {
        const { mockParasutAdapter } = await import("@/lib/parasut");
        const { HttpParasutAdapter } = await import("@/lib/parasut-http-adapter");
        const http = new HttpParasutAdapter({ getAccessToken: async () => "T" });

        const methods = [
            "exchangeAuthCode", "refreshToken",
            "findContactsByTaxNumber", "findContactsByEmail", "createContact", "updateContact",
            "findProductsByCode", "createProduct",
            "findSalesInvoicesByNumber", "createSalesInvoice", "getSalesInvoiceWithActiveEDocument",
            "listRecentShipmentDocuments", "createShipmentDocument",
            "listEInvoiceInboxesByVkn", "createEInvoice", "createEArchive", "getTrackableJob",
        ] as const;

        for (const m of methods) {
            expect(typeof (mockParasutAdapter as unknown as Record<string, unknown>)[m], `mock.${m}`).toBe("function");
            expect(typeof (http as unknown as Record<string, unknown>)[m], `http.${m}`).toBe("function");
        }
    });
});

describe("import döngüsü kırıldı", () => {
    // Zincir: parasut.ts → parasut-http-adapter.ts → parasut-oauth.ts
    // Eğer parasut-oauth.ts geri `@/lib/parasut`'a bağlanırsa döngü kapanır ve
    // modül yükleme sırasına bağlı "undefined is not a function" hataları doğar.
    it("parasut-oauth.ts adapter FABRİKASINI import ETMEZ", () => {
        const src = readFileSync("src/lib/services/parasut-oauth.ts", "utf8");
        expect(src).not.toMatch(/import\s+\{[^}]*getParasutAdapter[^}]*\}\s+from\s+["']@\/lib\/parasut["']/);
        // Tip importu serbest — çalışma zamanı bağımlılığı yaratmaz.
        expect(src).toContain('import type { ParasutAdapter } from "@/lib/parasut-adapter"');
    });

    it("serviceParasutOAuthRefresh adapter'ı PARAMETRE olarak alır", () => {
        const src = readFileSync("src/lib/services/parasut-oauth.ts", "utf8");
        expect(src).toMatch(/export async function serviceParasutOAuthRefresh\(adapter: ParasutAdapter\)/);
        expect(src).toContain("await getAccessToken(adapter);");
    });

    it("her iki çağıran da adapter'ı geçirir", () => {
        for (const path of [
            "src/app/api/parasut/oauth/refresh/route.ts",
            "src/app/api/alerts/[id]/sync-retry/route.ts",
        ]) {
            const src = readFileSync(path, "utf8");
            expect(src, path).toContain("serviceParasutOAuthRefresh(getParasutAdapter())");
            expect(src, path).toContain('from "@/lib/parasut"');
        }
    });

    it("http adapter jetonu oauth servisinden alır (lease/CAS tek yerde kalır)", () => {
        const src = readFileSync("src/lib/parasut.ts", "utf8");
        expect(src).toContain("getAccessToken: () => getAccessToken(adapter)");
    });
});
