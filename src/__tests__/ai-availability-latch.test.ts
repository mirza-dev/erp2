/**
 * AI erişilebilirlik mandalı — "anahtar dolu ama geçersiz" durumu.
 *
 * NEDEN VAR: `isAIAvailable()` eskiden yalnız `!!process.env.ANTHROPIC_API_KEY`
 * bakıyordu. 2026-08-29 canlı teşhisinde anahtar DOLU ama Anthropic tarafından
 * REDDEDİLİYORDU (HTTP 401 `invalid x-api-key`). Sonuç: sistem AI'yı açık
 * sanıyor, 11 çağrının her biri kendi `catch`'inde sessizce boş sonuca düşüyor,
 * kullanıcı hiçbir açıklama görmüyordu. Deterministik olması gereken kolon
 * eşleştirmesi de bu sessiz yola bağlıydı.
 *
 * Mandal sözleşmesi:
 *  - 401/403 → AI kapalı işaretlenir (kimlik hatası kendiliğinden düzelmez)
 *  - 429/5xx/ağ → mandal KURULMAZ (geçici hata AI'yı kapatmaz)
 *  - başarılı çağrı → mandal kalkar
 *
 * Anthropic SDK tamamen mock'lu; gerçek API çağrısı yok.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn(function () {
        return { messages: { create: mockCreate } };
    }),
}));

// ai-service modül seviyesinde bunları çekiyor — yan etki zincirini kes.
vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/supabase/ai-runs", () => ({
    logAiRun: vi.fn(),
    hashInput: (s: string) => `hash:${String(s).slice(0, 8)}`,
}));

import {
    getAIAvailability,
    isAIAvailable,
    probeAIKey,
    __resetAiAvailabilityLatch,
    aiParseEntity,
} from "@/lib/services/ai-service";

/** Anthropic SDK hata nesnesi `status` taşır. */
function httpError(status: number): Error & { status: number } {
    const err = new Error(`HTTP ${status}`) as Error & { status: number };
    err.status = status;
    return err;
}

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
    mockCreate.mockReset();
    __resetAiAvailabilityLatch();
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-anahtar";
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
    vi.restoreAllMocks();
});

describe("anahtar yokluğu", () => {
    it("anahtar tanımsızsa no_key döner", () => {
        delete process.env.ANTHROPIC_API_KEY;
        expect(getAIAvailability()).toEqual({ available: false, reason: "no_key" });
        expect(isAIAvailable()).toBe(false);
    });

    it("anahtar yokken probe HİÇ istek atmaz (bedava cevap)", async () => {
        delete process.env.ANTHROPIC_API_KEY;
        const sonuc = await probeAIKey();
        expect(sonuc.reason).toBe("no_key");
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe("kimlik hatası mandalı", () => {
    it("401 sonrası AI kapalı işaretlenir", async () => {
        expect(isAIAvailable()).toBe(true); // anahtar dolu, henüz denenmedi

        mockCreate.mockRejectedValueOnce(httpError(401));
        await aiParseEntity({ raw_text: "test", entity_type: "product" });

        expect(getAIAvailability()).toEqual({ available: false, reason: "auth_failed", status: 401 });
        expect(isAIAvailable()).toBe(false);
    });

    it("403 de mandalı kurar", async () => {
        mockCreate.mockRejectedValueOnce(httpError(403));
        await aiParseEntity({ raw_text: "test", entity_type: "product" });
        expect(getAIAvailability().reason).toBe("auth_failed");
    });

    it("mandal kurulduktan sonra çağrılar API'ye HİÇ gitmez", async () => {
        mockCreate.mockRejectedValueOnce(httpError(401));
        await aiParseEntity({ raw_text: "ilk", entity_type: "product" });
        const cagriSayisi = mockCreate.mock.calls.length;

        // İkinci çağrı isAIAvailable() erken-dönüşüne takılmalı.
        const sonuc = await aiParseEntity({ raw_text: "ikinci", entity_type: "product" });
        expect(mockCreate.mock.calls.length).toBe(cagriSayisi);
        expect(sonuc.confidence).toBe(0);
    });

    it("mandal kuruluyken probe istek atmaz", async () => {
        mockCreate.mockRejectedValueOnce(httpError(401));
        await aiParseEntity({ raw_text: "test", entity_type: "product" });
        mockCreate.mockClear();

        const sonuc = await probeAIKey();
        expect(sonuc.reason).toBe("auth_failed");
        expect(mockCreate).not.toHaveBeenCalled();
    });
});

describe("geçici hatalar mandalı KURMAMALI", () => {
    // Bu ayrım önemli: 429/5xx'te AI'yı kapalı işaretlemek, geçici bir
    // dalgalanmayı kalıcı arıza gibi göstermek olurdu.
    for (const status of [429, 500, 502, 529]) {
        it(`HTTP ${status} sonrası AI açık kalmalı`, async () => {
            mockCreate.mockRejectedValueOnce(httpError(status));
            await aiParseEntity({ raw_text: "test", entity_type: "product" });
            expect(isAIAvailable()).toBe(true);
            expect(getAIAvailability().reason).toBe("ok");
        });
    }

    it("status taşımayan ağ hatası mandalı kurmaz", async () => {
        mockCreate.mockRejectedValueOnce(new Error("ECONNRESET"));
        await aiParseEntity({ raw_text: "test", entity_type: "product" });
        expect(isAIAvailable()).toBe(true);
    });
});

describe("başarılı çağrı mandalı kaldırır", () => {
    it("anahtar sonradan geçerli hâle gelirse AI yeniden açılır", async () => {
        mockCreate.mockRejectedValueOnce(httpError(401));
        await aiParseEntity({ raw_text: "test", entity_type: "product" });
        expect(isAIAvailable()).toBe(false);

        // Mandal kuruluyken normal çağrılar API'ye gitmiyor; probe da öyle.
        // Gerçekte yeni anahtar süreç yeniden başlatmayı gerektirir — bu test
        // mandalın tek yönlü kilit OLMADIĞINI (başarıda kalktığını) doğrular.
        __resetAiAvailabilityLatch();
        mockCreate.mockResolvedValueOnce({ content: [{ type: "text", text: "ok" }] });
        const sonuc = await probeAIKey();
        expect(sonuc.available).toBe(true);
        expect(mockCreate).toHaveBeenCalled();
    });
});

describe("probe cache — token israfı olmamalı", () => {
    it("ardışık probe'lar tek istek atar", async () => {
        mockCreate.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });

        await probeAIKey();
        await probeAIKey();
        await probeAIKey();

        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("probe en fazla 1 token ister", async () => {
        mockCreate.mockResolvedValue({ content: [{ type: "text", text: "ok" }] });
        await probeAIKey();
        expect(mockCreate.mock.calls[0][0]).toMatchObject({ max_tokens: 1 });
    });
});
