/**
 * Voice Service Tests
 * transcribeAudio — Whisper API fetch pattern
 * extractProductionData — Claude Haiku JSON çıkarımı, guardrail'ler, fire → notes
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/ai-guards", () => ({
    sanitizeAiInput: (v: string) => v,
    clampConfidence: (v: unknown) => {
        const n = Number(v);
        if (isNaN(n)) return 0.5;
        return Math.min(1, Math.max(0, n));
    },
}));

vi.mock("@/lib/supabase/ai-runs", () => ({
    logAiRun: vi.fn(),
    hashInput: (s: string) => `hash:${s.slice(0, 8)}`,
}));

const mockCreate = vi.fn();

// Anthropic'i class olarak mock'la
vi.mock("@anthropic-ai/sdk", () => {
    return {
        default: class MockAnthropic {
            messages = { create: mockCreate };
        },
    };
});

// global fetch mock
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeAnthropicResponse(text: string) {
    return {
        content: [{ type: "text", text }],
    };
}

const PRODUCTS = [
    { id: "prod-1", name: "DN50 Vana", sku: "DN50" },
    { id: "prod-2", name: "DN65 Vana", sku: "DN65" },
];

// ── transcribeAudio ───────────────────────────────────────────────────────────

describe("transcribeAudio", () => {
    beforeEach(() => {
        mockFetch.mockReset();
        process.env.OPENAI_API_KEY = "test-openai-key";
    });

    it("Whisper API'ye doğru FormData ve Authorization header gönderir", async () => {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ text: "50 adet DN50 vana ürettik" }),
        });

        const { transcribeAudio } = await import("@/lib/services/voice-service");
        const buf = Buffer.from("fake-audio");
        const result = await transcribeAudio(buf, "recording.webm", "DN50 DN65");

        expect(result).toBe("50 adet DN50 vana ürettik");
        expect(mockFetch).toHaveBeenCalledOnce();

        const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("https://api.openai.com/v1/audio/transcriptions");
        expect((options.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-openai-key");
    });

    it("OPENAI_API_KEY yoksa hata fırlatır", async () => {
        delete process.env.OPENAI_API_KEY;
        const { transcribeAudio } = await import("@/lib/services/voice-service");
        await expect(transcribeAudio(Buffer.from("x"), "recording.webm")).rejects.toThrow("OPENAI_API_KEY eksik");
    });

    it("Whisper API hata dönünce anlaşılır hata mesajı verir", async () => {
        process.env.OPENAI_API_KEY = "test-key";
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 429,
            text: async () => "rate limit exceeded",
        });
        const { transcribeAudio } = await import("@/lib/services/voice-service");
        await expect(transcribeAudio(Buffer.from("x"), "recording.webm")).rejects.toThrow("Whisper API hatası 429");
    });
});

// ── extractProductionData ─────────────────────────────────────────────────────

describe("extractProductionData", () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it("Ürün doğru eşleşince productId ve quantity döner", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: 50,
            notes: "",
            confidence: 0.95,
        })));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entry } = await extractProductionData("50 adet DN50 vana ürettik", PRODUCTS);

        expect(entry.productId).toBe("prod-1");
        expect(entry.quantity).toBe(50);
        expect(entry.confidence).toBe(0.95);
        expect(entry.notes).toBe("");
    });

    it('"fire" içeren transkripsiyon notes\'a yansır', async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: 50,
            notes: "fire: 2 adet",
            confidence: 0.90,
        })));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entry } = await extractProductionData("50 adet DN50 vana, 2 fire var", PRODUCTS);

        expect(entry.notes).toContain("fire: 2 adet");
        expect(entry.quantity).toBe(50);
    });

    it("Ürün eşleşmezse productId null döner", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({
            productId: null,
            productName: "bilinmeyen ürün",
            productSku: "",
            quantity: 10,
            notes: "",
            confidence: 0.3,
        })));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entry } = await extractProductionData("bilinmeyen ürün ürettik", PRODUCTS);

        expect(entry.productId).toBeNull();
        expect(entry.confidence).toBe(0.3);
    });

    it("Claude ```json ``` bloğu döndürse bile parse edilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(
            "```json\n" + JSON.stringify({
                productId: "prod-2",
                productName: "DN65 Vana",
                productSku: "DN65",
                quantity: 20,
                notes: "",
                confidence: 0.88,
            }) + "\n```"
        ));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entry } = await extractProductionData("20 DN65 vana", PRODUCTS);

        expect(entry.productId).toBe("prod-2");
        expect(entry.quantity).toBe(20);
    });

    it("Claude bilinen ürün listesi dışında productId döndürürse null olarak düzelir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({
            productId: "00000000-0000-0000-0000-nonexistent",
            productName: "Bilinmeyen Ürün",
            productSku: "XX99",
            quantity: 10,
            notes: "",
            confidence: 0.8,
        })));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entry } = await extractProductionData("10 adet XX99", PRODUCTS);

        expect(entry.productId).toBeNull();
    });

    it("Geçersiz JSON gelince anlaşılır hata fırlatır", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse("bu JSON değil"));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        await expect(extractProductionData("DN50 vana", PRODUCTS)).rejects.toThrow("JSON parse edilemedi");
    });

    it("confidence 0-1 dışındaysa clampConfidence ile düzeltilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: 30,
            notes: "",
            confidence: 1.5,
        })));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entry } = await extractProductionData("30 DN50", PRODUCTS);

        expect(entry.confidence).toBeLessThanOrEqual(1);
    });

    it("quantity negatif/sıfır gelirse 1 olarak düzeltirilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: -5,
            notes: "",
            confidence: 0.9,
        })));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entry } = await extractProductionData("DN50 vana", PRODUCTS);

        expect(entry.quantity).toBe(1);
    });
});

// ── buildWhisperPrompt ────────────────────────────────────────────────────────

describe("buildWhisperPrompt", () => {
    it("SKU ve isimleri birleştirir", async () => {
        const { buildWhisperPrompt } = await import("@/lib/services/voice-service");
        const prompt = buildWhisperPrompt(PRODUCTS);
        expect(prompt).toContain("DN50");
        expect(prompt).toContain("DN65");
        expect(prompt).toContain("DN50 Vana");
    });
});
