/**
 * Faz 3b — aiExtractProductsFromDocument + parseExtractionResponse tests.
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

const VANA_CTX = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "Vana",
    fields: [
        { field_key: "dn", label_tr: "DN", field_type: "number", unit: "mm", options: null },
        { field_key: "pn_class", label_tr: "PN/Sınıf", field_type: "select", unit: null, options: ["PN16", "PN25"] },
        { field_key: "body_material", label_tr: "Gövde Malzemesi", field_type: "text", unit: null, options: null },
    ],
};

describe("parseExtractionResponse", () => {
    it("valid JSON → items mapped", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [
                    { line: 1, name: "Vana DN50", sku: "KV-DN50", attributes: { dn: 50, pn_class: "PN16" }, confidence: 0.9 },
                ],
            }),
            new Set(["dn", "pn_class"]),
        );
        expect(r.items.length).toBe(1);
        expect(r.items[0].name).toBe("Vana DN50");
        expect(r.items[0].attributes.dn).toBe(50);
        expect(r.items[0].confidence).toBe(0.9);
    });

    it("filters unknown attribute keys", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({
                items: [
                    { line: 1, name: "X", sku: null, attributes: { dn: 50, foo_bar: "ignored" }, confidence: 0.5 },
                ],
            }),
            new Set(["dn"]),
        );
        expect(r.items[0].attributes.dn).toBe(50);
        expect(r.items[0].attributes.foo_bar).toBeUndefined();
    });

    it("invalid JSON → empty items", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        expect(parseExtractionResponse("not json at all", new Set()).items).toEqual([]);
    });

    it("missing items array → empty", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        expect(parseExtractionResponse('{"foo":1}', new Set()).items).toEqual([]);
    });

    it("confidence clamped to [0,1]", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({ items: [{ line: 1, name: "X", sku: null, attributes: {}, confidence: 2.5 }] }),
            new Set(),
        );
        expect(r.items[0].confidence).toBe(1);
    });

    it("missing line number → auto-assign by index", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({ items: [{ name: "A" }, { name: "B" }] }),
            new Set(),
        );
        expect(r.items[0].line).toBe(1);
        expect(r.items[1].line).toBe(2);
    });

    it("empty allowed keys → all attributes pass through (free-form)", async () => {
        const { parseExtractionResponse } = await import("@/lib/services/ai-service");
        const r = parseExtractionResponse(
            JSON.stringify({ items: [{ line: 1, name: "X", attributes: { random_key: "x" }, confidence: 0.5 }] }),
            new Set(),
        );
        // empty set → no whitelist → all pass
        expect(r.items[0].attributes.random_key).toBe("x");
    });
});

describe("aiExtractProductsFromDocument — behavior", () => {
    it("AI unavailable → empty items (no API call)", async () => {
        vi.unstubAllEnvs();
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const r = await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypeContext: VANA_CTX, multiRow: true,
        });
        expect(r.items).toEqual([]);
        expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it("happy path: catalog PDF → items + logAiRun called with feature=import_extract_products", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            items: [
                { line: 1, name: "Vana DN50", sku: "KV-DN50", attributes: { dn: 50, pn_class: "PN16" }, confidence: 0.92 },
                { line: 2, name: "Vana DN100", sku: "KV-DN100", attributes: { dn: 100, pn_class: "PN16" }, confidence: 0.88 },
            ],
        }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const r = await aiExtractProductsFromDocument({
            buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf",
            fileName: "catalog.pdf", productTypeContext: VANA_CTX, multiRow: true,
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
            fileName: "x.pdf", productTypeContext: VANA_CTX, multiRow: true,
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
            fileName: "x.pdf", productTypeContext: VANA_CTX, multiRow: true,
        }, ctl.signal)).rejects.toThrow(/abort/i);
        vi.unstubAllEnvs();
    });

    it("generic AI error → graceful empty items", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockRejectedValueOnce(new Error("network"));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        const r = await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypeContext: VANA_CTX, multiRow: true,
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
            productTypeContext: VANA_CTX, multiRow: true,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
        expect(call.messages[0].content[0].type).toBe("text");
        vi.unstubAllEnvs();
    });

    it("system prompt contains product type context fields", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypeContext: VANA_CTX, multiRow: true,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { system: string };
        expect(call.system).toContain("Vana");
        expect(call.system).toContain("dn");
        expect(call.system).toContain("pn_class");
        expect(call.system).toContain("PN16");
        vi.unstubAllEnvs();
    });

    it("multiRow=false → datasheet hint in prompt (single item)", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "datasheet.pdf", productTypeContext: VANA_CTX, multiRow: false,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { system: string };
        expect(call.system).toMatch(/VERİ SAYFASI|tek bir ürün/i);
        vi.unstubAllEnvs();
    });

    it("null productTypeContext → free-form prompt note", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({ items: [] }));
        const { aiExtractProductsFromDocument } = await import("@/lib/services/ai-service");
        await aiExtractProductsFromDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypeContext: null, multiRow: true,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { system: string };
        expect(call.system).toMatch(/belirsiz|name \+ sku/i);
        vi.unstubAllEnvs();
    });
});
