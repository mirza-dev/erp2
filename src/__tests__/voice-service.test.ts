/**
 * Voice Service Tests
 * transcribeAudio — Whisper API fetch pattern
 * extractProductionData — Claude Haiku JSON çıkarımı, guardrail'ler, fire → fireNotes, çoklu ürün
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/ai-guards", () => ({
    sanitizeAiInput: (v: string) => v,
    sanitizeAiOutput: (v: unknown, _maxLen: number) => (typeof v === "string" ? v : ""),
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

/** V2/V3 formatında çıktı — entries[] + sessionNote */
function makeEntries(entries: object[], sessionNote = "") {
    return JSON.stringify({ entries, sessionNote });
}

/** Varsayılan entry alanlarına note ekler (boş) */
function entry(overrides: Record<string, unknown>): Record<string, unknown> {
    return { note: "", fireNotes: "", ...overrides };
}

const PRODUCTS = [
    { id: "prod-1", name: "DN50 Vana", sku: "DN50", category: "Sürgülü Vanalar" },
    { id: "prod-2", name: "DN65 Vana", sku: "DN65", category: "Kelebek Vanalar" },
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
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: 50,
            fireNotes: "",
            confidence: 0.95,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("50 adet DN50 vana ürettik", PRODUCTS);

        expect(entries[0].productId).toBe("prod-1");
        expect(entries[0].quantity).toBe(50);
        expect(entries[0].confidence).toBe(0.95);
        expect(entries[0].fireNotes).toBe("");
    });

    it('"fire" içeren transkripsiyon fireNotes\'a yansır', async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: 50,
            fireNotes: "fire: 2 adet",
            confidence: 0.90,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("50 adet DN50 vana, 2 fire var", PRODUCTS);

        expect(entries[0].fireNotes).toContain("fire: 2 adet");
        expect(entries[0].quantity).toBe(50);
    });

    it("Ürün eşleşmezse productId null döner", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: null,
            productName: "bilinmeyen ürün",
            productSku: "",
            quantity: 10,
            fireNotes: "",
            confidence: 0.3,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("bilinmeyen ürün ürettik", PRODUCTS);

        expect(entries[0].productId).toBeNull();
        expect(entries[0].confidence).toBe(0.3);
    });

    it("Claude ```json ``` bloğu döndürse bile parse edilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(
            "```json\n" + makeEntries([{
                productId: "prod-2",
                productName: "DN65 Vana",
                productSku: "DN65",
                quantity: 20,
                fireNotes: "",
                confidence: 0.88,
            }]) + "\n```"
        ));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("20 DN65 vana", PRODUCTS);

        expect(entries[0].productId).toBe("prod-2");
        expect(entries[0].quantity).toBe(20);
    });

    it("Geçersiz JSON gelince anlaşılır hata fırlatır", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse("bu JSON değil"));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        await expect(extractProductionData("DN50 vana", PRODUCTS)).rejects.toThrow("JSON parse edilemedi");
    });

    it("confidence 0-1 dışındaysa clampConfidence ile düzeltilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: 30,
            fireNotes: "",
            confidence: 1.5,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("30 DN50", PRODUCTS);

        expect(entries[0].confidence).toBeLessThanOrEqual(1);
    });

    it("quantity negatif/sıfır gelirse 1 olarak düzeltirilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1",
            productName: "DN50 Vana",
            productSku: "DN50",
            quantity: -5,
            fireNotes: "",
            confidence: 0.9,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("DN50 vana", PRODUCTS);

        expect(entries[0].quantity).toBe(1);
    });

    it("Claude bilinen ürün listesi dışında productId döndürürse null olarak düzelir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "00000000-0000-0000-0000-nonexistent",
            productName: "Bilinmeyen Ürün",
            productSku: "XX99",
            quantity: 10,
            fireNotes: "",
            confidence: 0.8,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("10 adet XX99", PRODUCTS);

        expect(entries[0].productId).toBeNull();
    });

    it("Çoklu ürün: 2 ürün → entries.length === 2, her ikisi doğru productId", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            { productId: "prod-1", productName: "DN50 Vana", productSku: "DN50", quantity: 30, fireNotes: "", confidence: 0.95 },
            { productId: "prod-2", productName: "DN65 Vana", productSku: "DN65", quantity: 20, fireNotes: "", confidence: 0.92 },
        ])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("30 DN50, 20 DN65 ürettik", PRODUCTS);

        expect(entries).toHaveLength(2);
        expect(entries[0].productId).toBe("prod-1");
        expect(entries[0].quantity).toBe(30);
        expect(entries[1].productId).toBe("prod-2");
        expect(entries[1].quantity).toBe(20);
    });

    it("sessionNote doğru parse edilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1", productName: "DN50 Vana", productSku: "DN50",
            quantity: 50, fireNotes: "", confidence: 0.95,
        }], "hepsi A kalite")));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { sessionNote } = await extractProductionData("50 DN50, not: hepsi A kalite", PRODUCTS);

        expect(sessionNote).toBe("hepsi A kalite");
    });

    it("entries boş gelirse fallback entry döner", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({ entries: [], sessionNote: "" })));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("anlaşılmaz ses", PRODUCTS);

        expect(entries).toHaveLength(1);
        expect(entries[0].productId).toBeNull();
    });
});

// ── Prompt & category doğrulama testleri ─────────────────────────────────────

describe("extractProductionData — prompt & category doğrulama", () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it("Claude'a gönderilen mesajda category bilgisi [Kategori] formatında yer alır", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1", productName: "DN50 Vana", productSku: "DN50",
            quantity: 50, fireNotes: "", confidence: 0.95,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        await extractProductionData("50 DN50", PRODUCTS);

        const callArgs = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
        expect(callArgs.messages[0].content).toContain("[Sürgülü Vanalar]");
        expect(callArgs.messages[0].content).toContain("[Kelebek Vanalar]");
    });

    it("SYSTEM_PROMPT 'TÜM ürünleri bul' ifadesi içermiyor, 'KASITLI OLARAK' içeriyor", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1", productName: "DN50 Vana", productSku: "DN50",
            quantity: 50, fireNotes: "", confidence: 0.95,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        await extractProductionData("50 DN50", PRODUCTS);

        const callArgs = mockCreate.mock.calls[0][0] as { system: string };
        expect(callArgs.system).not.toContain("TÜM ürünleri bul");
        expect(callArgs.system).toContain("KASITLI OLARAK");
    });

    it("Belirsiz girdi (kısmi SKU) → productId null, düşük confidence, TEK entry", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: null,
            productName: "DN50 vana",
            productSku: "DN50",
            quantity: 50,
            fireNotes: "",
            confidence: 0.40,
        }])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("50 adet DN50", PRODUCTS);

        expect(entries).toHaveLength(1);
        expect(entries[0].productId).toBeNull();
        expect(entries[0].confidence).toBeLessThan(0.7);
        expect(entries[0].productName).toBe("DN50 vana");
    });

    it("Claude aynı SKU için çoklu null entry döndürürse guard tek entry'e collapse eder", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            { productId: null, productName: "DN50 PN6 Vana",  productSku: "dn50", quantity: 20, fireNotes: "", confidence: 0.40 },
            { productId: null, productName: "DN50 PN10 Vana", productSku: "dn50", quantity: 20, fireNotes: "", confidence: 0.40 },
            { productId: null, productName: "DN50 PN16 Vana", productSku: "dn50", quantity: 10, fireNotes: "", confidence: 0.35 },
        ])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("50 adet DN50", PRODUCTS);

        expect(entries).toHaveLength(1);
        expect(entries[0].productId).toBeNull();
        expect(entries[0].quantity).toBe(50); // 20+20+10
        expect(entries[0].confidence).toBe(0.35); // en düşük
    });

    it("Farklı SKU'lu null entry'ler collapse edilmez", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            { productId: null, productName: "DN50 vana", productSku: "dn50", quantity: 30, fireNotes: "", confidence: 0.40 },
            { productId: null, productName: "DN65 vana", productSku: "dn65", quantity: 20, fireNotes: "", confidence: 0.40 },
        ])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("30 DN50 ve 20 DN65", PRODUCTS);

        expect(entries).toHaveLength(2); // farklı SKU → collapse yok
    });

    it("category null olan ürün listede köşeli parantez içermez", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([{
            productId: "prod-1", productName: "DN50 Vana", productSku: "DN50",
            quantity: 10, fireNotes: "", confidence: 0.9,
        }])));

        const productsWithNullCategory = [
            { id: "prod-1", name: "DN50 Vana", sku: "DN50", category: null },
        ];

        const { extractProductionData } = await import("@/lib/services/voice-service");
        await extractProductionData("10 DN50", productsWithNullCategory);

        const callArgs = mockCreate.mock.calls[0][0] as { messages: { content: string }[] };
        // category null ise [kategori] formatı olmamalı
        expect(callArgs.messages[0].content).not.toMatch(/\[.*\]/);
    });
});

// ── Per-entry note ────────────────────────────────────────────────────────────

describe("extractProductionData — per-entry note", () => {
    beforeEach(() => {
        mockCreate.mockReset();
    });

    it("Per-entry note parse edilir, doğru entry'e atanır", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            entry({ productId: "prod-1", productName: "DN50 Vana", productSku: "DN50", quantity: 50, confidence: 0.95, note: "A kalite" }),
            entry({ productId: "prod-2", productName: "DN65 Vana", productSku: "DN65", quantity: 30, confidence: 0.92, note: "" }),
        ])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries, sessionNote } = await extractProductionData("50 DN50 için not: A kalite, 30 DN65", PRODUCTS);

        expect(entries[0].note).toBe("A kalite");
        expect(entries[1].note).toBe("");
        expect(sessionNote).toBe("");
    });

    it("Per-entry note sessionNote'tan bağımsızdır — ikisi aynı anda var olabilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            entry({ productId: "prod-1", productName: "DN50 Vana", productSku: "DN50", quantity: 50, confidence: 0.95, note: "A kalite" }),
            entry({ productId: "prod-2", productName: "DN65 Vana", productSku: "DN65", quantity: 30, confidence: 0.92, note: "" }),
        ], "acil sevkiyat")));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries, sessionNote } = await extractProductionData("50 DN50 için not: A kalite, 30 DN65, genel not: acil sevkiyat", PRODUCTS);

        expect(entries[0].note).toBe("A kalite");
        expect(entries[1].note).toBe("");
        expect(sessionNote).toBe("acil sevkiyat");
    });

    it("Genel not sessionNote'a gider, tüm entry note'lar boş kalır", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            entry({ productId: "prod-1", productName: "DN50 Vana", productSku: "DN50", quantity: 50, confidence: 0.95, note: "" }),
            entry({ productId: "prod-2", productName: "DN65 Vana", productSku: "DN65", quantity: 30, confidence: 0.92, note: "" }),
        ], "bugün vardiya erken bitti")));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries, sessionNote } = await extractProductionData("50 DN50, 30 DN65, genel not: bugün vardiya erken bitti", PRODUCTS);

        expect(entries[0].note).toBe("");
        expect(entries[1].note).toBe("");
        expect(sessionNote).toBe("bugün vardiya erken bitti");
    });

    it("SYSTEM_PROMPT 'Ürüne özel not' ifadesini içeriyor", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            entry({ productId: "prod-1", productName: "DN50 Vana", productSku: "DN50", quantity: 50, confidence: 0.95 }),
        ])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        await extractProductionData("50 DN50", PRODUCTS);

        const callArgs = mockCreate.mock.calls[0][0] as { system: string };
        expect(callArgs.system).toContain("Ürüne özel not");
    });

    it("Collapse guard — note alanları birleştirilir", async () => {
        mockCreate.mockResolvedValueOnce(makeAnthropicResponse(makeEntries([
            entry({ productId: null, productName: "DN50 PN6",  productSku: "dn50", quantity: 20, confidence: 0.40, note: "A kalite" }),
            entry({ productId: null, productName: "DN50 PN10", productSku: "dn50", quantity: 20, confidence: 0.40, note: "" }),
            entry({ productId: null, productName: "DN50 PN16", productSku: "dn50", quantity: 10, confidence: 0.35, note: "B kalite" }),
        ])));

        const { extractProductionData } = await import("@/lib/services/voice-service");
        const { entries } = await extractProductionData("50 DN50", PRODUCTS);

        expect(entries).toHaveLength(1);
        expect(entries[0].note).toBe("A kalite; B kalite");
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
