/**
 * Faz 3b — aiExtractProductsFromDocument + parseExtractionResponse tests.
 * Review 3.tur: multi-type (availableProductTypes array, per-item product_type_id).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMessagesCreate = vi.fn();
const mockLogAiRun = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
    default: class MockAnthropic {
        messages = { create: (...a: unknown[]) => mockMessagesCreate(...a) };
    },
}));

vi.mock("@/lib/supabase/ai-runs", () => ({
    logAiRun: (...a: unknown[]) => mockLogAiRun(...a),
    hashInput: (s: string) => `h:${s.slice(0, 12)}`,
}));

vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: () => ({ update: () => ({ eq: vi.fn() }) }) }),
}));

beforeEach(() => {
    mockMessagesCreate.mockReset();
    mockLogAiRun.mockReset();
});

function aiResponse(body: Record<string, unknown>) {
    return { content: [{ type: "text", text: JSON.stringify(body) }] };
}

const VANA_ID = "00000000-0000-4000-8000-000000000001";
const CONTA_ID = "00000000-0000-4000-8000-000000000002";

const AVAILABLE_TYPES = [
    {
        id: VANA_ID,
        name: "Vana",
        fields: [
            { field_key: "dn", label_tr: "DN", field_type: "number", unit: "mm", options: null },
            { field_key: "pn_class", label_tr: "PN/Sınıf", field_type: "select", unit: null, options: ["PN16", "PN25"] },
        ],
    },
    {
        id: CONTA_ID,
        name: "Conta",
        fields: [
            { field_key: "dn", label_tr: "DN", field_type: "number", unit: "mm", options: null },
            { field_key: "thickness", label_tr: "Kalınlık", field_type: "number", unit: "mm", options: null },
        ],
    },
];

describe("parseExtractionResponse (multi-type)", () => {
    it("valid JSON → items mapped with product_type_id", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [
                    { line: 1, name: "Vana DN50", sku: "KV-50", product_type_id: VANA_ID,
                      attributes: { dn: 50, pn_class: "PN16" }, confidence: 0.9 },
                ],
            }),
            AVAILABLE_TYPES,
        );
        expect(r.items.length).toBe(1);
        expect(r.items[0].name).toBe("Vana DN50");
        expect(r.items[0].product_type_id).toBe(VANA_ID);
        expect(r.items[0].attributes.dn).toBe(50);
        expect(r.items[0].confidence).toBe(0.9);
    });

    it("attribute whitelist item başına dinamik — vana item conta field'ı reddedilir", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [
                    { line: 1, name: "Vana", sku: null, product_type_id: VANA_ID,
                      attributes: { dn: 50, thickness: 3, foo: "x" }, confidence: 0.5 },
                ],
            }),
            AVAILABLE_TYPES,
        );
        // Vana fields = [dn, pn_class]; thickness Conta'nın, foo hiçbir tipin değil
        expect(r.items[0].attributes.dn).toBe(50);
        expect(r.items[0].attributes.thickness).toBeUndefined();
        expect(r.items[0].attributes.foo).toBeUndefined();
    });

    it("product_type_id whitelist dışı → null + attributes boş", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [
                    { line: 1, name: "X", sku: null, product_type_id: "99999999-9999-4999-8999-999999999999",
                      attributes: { dn: 50 }, confidence: 0.5 },
                ],
            }),
            AVAILABLE_TYPES,
        );
        expect(r.items[0].product_type_id).toBeNull();
        // tip null → attributes whitelist boş set → hiçbir alan kalmaz
        expect(r.items[0].attributes.dn).toBeUndefined();
    });

    it("product_type_id non-UUID → null", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [{ line: 1, name: "X", product_type_id: "not-a-uuid", attributes: {}, confidence: 0.5 }],
            }),
            AVAILABLE_TYPES,
        );
        expect(r.items[0].product_type_id).toBeNull();
    });

    it("invalid JSON → empty items", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        expect(parseExtractionResponse("not json at all", AVAILABLE_TYPES).items).toEqual([]);
    });

    it("missing items array → empty", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        expect(parseExtractionResponse('{"foo":1}', AVAILABLE_TYPES).items).toEqual([]);
    });

    it("confidence clamped to [0,1]", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({ items: [{ line: 1, name: "X", product_type_id: VANA_ID, attributes: {}, confidence: 2.5 }] }),
            AVAILABLE_TYPES,
        );
        expect(r.items[0].confidence).toBe(1);
    });

    it("missing line number → auto-assign by index", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({ items: [{ name: "A", product_type_id: VANA_ID }, { name: "B", product_type_id: CONTA_ID }] }),
            AVAILABLE_TYPES,
        );
        expect(r.items[0].line).toBe(1);
        expect(r.items[1].line).toBe(2);
    });

    it("availableProductTypes boş → product_type_id null + attributes drop", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({ items: [{ line: 1, name: "X", product_type_id: VANA_ID, attributes: { random_key: "x" }, confidence: 0.5 }] }),
            [],
        );
        expect(r.items[0].product_type_id).toBeNull();
        expect(r.items[0].attributes.random_key).toBeUndefined();
    });

    it("multi-type mixed: aynı response içinde vana ve conta items", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [
                    { line: 1, name: "Vana DN50", product_type_id: VANA_ID, attributes: { dn: 50, pn_class: "PN16" }, confidence: 0.9 },
                    { line: 2, name: "Conta DN50", product_type_id: CONTA_ID, attributes: { dn: 50, thickness: 3 }, confidence: 0.85 },
                ],
            }),
            AVAILABLE_TYPES,
        );
        expect(r.items.length).toBe(2);
        expect(r.items[0].product_type_id).toBe(VANA_ID);
        expect(r.items[0].attributes.pn_class).toBe("PN16");
        expect(r.items[1].product_type_id).toBe(CONTA_ID);
        expect(r.items[1].attributes.thickness).toBe(3);
    });
});

describe("aiExtractProductsFromDocument — behavior (multi-type)", () => {
    it("AI unavailable → empty items (no API call)", async () => {
        vi.unstubAllEnvs();
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const r = await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", availableProductTypes: AVAILABLE_TYPES, multiRow: true,
        });
        expect(r.items).toEqual([]);
        expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it("happy path: catalog PDF → items + logAiRun called", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            items: [
                { line: 1, name: "Vana DN50", sku: "KV-50", product_type_id: VANA_ID,
                  attributes: { dn: 50, pn_class: "PN16" }, confidence: 0.92 },
                { line: 2, name: "Vana DN100", sku: "KV-100", product_type_id: VANA_ID,
                  attributes: { dn: 100, pn_class: "PN16" }, confidence: 0.88 },
            ],
        }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const r = await aiExtractProductsFromDocument({
            buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf",
            fileName: "catalog.pdf", availableProductTypes: AVAILABLE_TYPES, multiRow: true,
        });
        expect(r.items.length).toBe(2);
        expect(mockLogAiRun).toHaveBeenCalledTimes(1);
        expect(mockLogAiRun.mock.calls[0]?.[0]?.feature).toBe("import_extract_products");
        vi.unstubAllEnvs();
    });

    it("passes signal to Anthropic SDK RequestOptions", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const ctl = new AbortController();
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", availableProductTypes: AVAILABLE_TYPES, multiRow: true,
        }, ctl.signal);
        const opts = mockMessagesCreate.mock.calls[0]?.[1] as { signal?: AbortSignal };
        expect(opts.signal).toBe(ctl.signal);
        vi.unstubAllEnvs();
    });

    it("re-throws AbortError (not graceful)", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockImplementationOnce(async () => {
            const e = new Error("aborted");
            (e as Error & { name: string }).name = "AbortError";
            throw e;
        });
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const ctl = new AbortController(); ctl.abort();
        await expect(aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", availableProductTypes: AVAILABLE_TYPES, multiRow: true,
        }, ctl.signal)).rejects.toThrow(/abort/i);
        vi.unstubAllEnvs();
    });

    it("generic AI error → graceful empty items", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockRejectedValueOnce(new Error("network"));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const r = await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", availableProductTypes: AVAILABLE_TYPES, multiRow: true,
        });
        expect(r.items).toEqual([]);
        vi.unstubAllEnvs();
    });

    it("excel mime → content block routed to text", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("xxx"),
            mimeType: "text/csv",
            fileName: "catalog.csv",
            excelTextSample: "col1,col2\nVal1,Val2",
            availableProductTypes: AVAILABLE_TYPES, multiRow: true,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
        expect(call.messages[0].content[0].type).toBe("text");
        vi.unstubAllEnvs();
    });

    it("system prompt tüm tipleri ve UUID'lerini listeler (multi-type context)", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", availableProductTypes: AVAILABLE_TYPES, multiRow: true,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { system: string };
        // Her iki tip + her tipin UUID'si + field_key'leri prompt'ta olmalı
        expect(call.system).toContain("Vana");
        expect(call.system).toContain("Conta");
        expect(call.system).toContain(VANA_ID);
        expect(call.system).toContain(CONTA_ID);
        expect(call.system).toContain("dn");
        expect(call.system).toContain("pn_class");
        expect(call.system).toContain("thickness");
        expect(call.system).toContain("PN16");
        // AI'ya product_type_id seçtirme talimatı var mı
        expect(call.system).toContain("product_type_id");
        vi.unstubAllEnvs();
    });

    it("multiRow=false → datasheet hint in prompt (single item)", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "datasheet.pdf", availableProductTypes: AVAILABLE_TYPES, multiRow: false,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { system: string };
        expect(call.system).toMatch(/VERİ SAYFASI|tek bir ürün/i);
        vi.unstubAllEnvs();
    });

    it("availableProductTypes boş → free-form prompt notu", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", availableProductTypes: [], multiRow: true,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { system: string };
        expect(call.system).toMatch(/sistem tipi yok|name \+ sku/i);
        vi.unstubAllEnvs();
    });
});
