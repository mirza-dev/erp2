/**
 * Faz 3a — aiClassifyDocument behavior tests.
 *
 * Coverage:
 *   - PDF → document content block with base64
 *   - Image → image content block
 *   - Excel (text sample) → text block
 *   - isAIAvailable() false → unknown fallback (no network)
 *   - Anthropic throw → graceful unknown
 *   - JSON parse fail → unknown + sanitize
 *   - clampConfidence bounds
 *   - suggested_product_type_id validation (uuid + whitelist)
 *   - logAiRun called with feature="import_classify"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockMessagesCreate = vi.fn();
const mockLogAiRun = vi.fn();

vi.mock("@anthropic-ai/sdk", () => {
    return {
        default: class MockAnthropic {
            messages = { create: (...a: unknown[]) => mockMessagesCreate(...a) };
        },
    };
});

vi.mock("@/lib/supabase/ai-runs", () => ({
    logAiRun: (...a: unknown[]) => mockLogAiRun(...a),
    hashInput: (s: string) => `hash:${s.slice(0, 16)}`,
}));

vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({ from: () => ({ update: () => ({ eq: vi.fn() }) }) }),
}));

beforeEach(() => {
    mockMessagesCreate.mockReset();
    mockLogAiRun.mockReset();
});

const PT_ID = "00000000-0000-4000-8000-000000000001";
const productTypes = [{ id: PT_ID, name: "Vana" }];

function aiResponse(body: Record<string, unknown>) {
    return {
        content: [{ type: "text", text: JSON.stringify(body) }],
    };
}

describe("aiClassifyDocument — content block routing", () => {
    it("PDF input → document content block with base64", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "product_catalog", confidence: 0.9, language: "tr",
            summary: "Spiral wound katalog", suggested_product_type_id: PT_ID,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        await aiClassifyDocument({
            buffer: Buffer.from("%PDF-1.4 fake"),
            mimeType: "application/pdf",
            fileName: "catalog.pdf",
            productTypes,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ type: string; source?: { media_type?: string } }> }> };
        expect(call.messages[0].content[0].type).toBe("document");
        expect(call.messages[0].content[0].source?.media_type).toBe("application/pdf");
        vi.unstubAllEnvs();
    });

    it("Image input → image content block", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "product_photo", confidence: 0.7, language: "unknown",
            summary: "Vana fotoğrafı", suggested_product_type_id: PT_ID,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        await aiClassifyDocument({
            buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]), // PNG magic
            mimeType: "image/png",
            fileName: "valve.png",
            productTypes,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ type: string; source?: { media_type?: string } }> }> };
        expect(call.messages[0].content[0].type).toBe("image");
        expect(call.messages[0].content[0].source?.media_type).toBe("image/png");
        vi.unstubAllEnvs();
    });

    it("Excel input → text content block with excelTextSample", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "migration_excel", confidence: 0.85, language: "tr",
            summary: "Eski sistem", suggested_product_type_id: null,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        await aiClassifyDocument({
            buffer: Buffer.from("xlsx binary"),
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            fileName: "stok.xlsx",
            excelTextSample: "SKU,Adı,Stok\nA1,Vana,100",
            productTypes,
        });
        const call = mockMessagesCreate.mock.calls[0]?.[0] as { messages: Array<{ content: Array<{ type: string; text?: string }> }> };
        expect(call.messages[0].content[0].type).toBe("text");
        expect(call.messages[0].content[0].text).toContain("SKU,Adı,Stok");
        vi.unstubAllEnvs();
    });

    it("includes selected operation context in system prompt and result", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "product_datasheet", confidence: 0.9, language: "tr",
            summary: "Teknik sayfa", suggested_product_type_id: null,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const result = await aiClassifyDocument({
            buffer: Buffer.from("%PDF-1.4 fake"),
            mimeType: "application/pdf",
            fileName: "datasheet.pdf",
            productTypes,
            operationType: "product_technical_update",
        });

        const call = mockMessagesCreate.mock.calls[0]?.[0] as { system: string };
        expect(call.system).toContain("Teknik bilgileri güncelle");
        expect(call.system).toContain("Fiyat/maliyet");
        expect(result.operation_type).toBe("product_technical_update");
        vi.unstubAllEnvs();
    });
});

describe("aiClassifyDocument — graceful fallback", () => {
    it("returns unknown without calling Anthropic when ANTHROPIC_API_KEY missing", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "");
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const result = await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(result.document_type).toBe("unknown");
        expect(result.confidence).toBe(0);
        expect(mockMessagesCreate).not.toHaveBeenCalled();
        vi.unstubAllEnvs();
    });

    it("returns unknown when Anthropic throws", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockRejectedValueOnce(new Error("rate limit"));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const result = await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(result.document_type).toBe("unknown");
        expect(result.confidence).toBe(0);
        vi.unstubAllEnvs();
    });

    it("returns unknown when AI returns non-JSON", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce({
            content: [{ type: "text", text: "Bu PDF'i sınıflandıramadım." }],
        });
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const result = await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(result.document_type).toBe("unknown");
        vi.unstubAllEnvs();
    });
});

describe("aiClassifyDocument — validation + logging", () => {
    it("logs the run with feature='import_classify'", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "product_catalog", confidence: 0.95, language: "tr",
            summary: "ok", suggested_product_type_id: PT_ID,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(mockLogAiRun).toHaveBeenCalled();
        const args = mockLogAiRun.mock.calls[0]?.[0] as { feature: string };
        expect(args.feature).toBe("import_classify");
        vi.unstubAllEnvs();
    });

    it("clamps confidence > 1 down to 1", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "product_catalog", confidence: 2.5, language: "tr",
            summary: "ok", suggested_product_type_id: null,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const result = await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(result.confidence).toBe(1);
        vi.unstubAllEnvs();
    });

    it("ignores suggested_product_type_id when not a UUID or not whitelisted", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "product_datasheet", confidence: 0.8, language: "tr",
            summary: "ok", suggested_product_type_id: "not-a-uuid",
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const result = await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(result.suggested_product_type_id).toBeNull();
        vi.unstubAllEnvs();
    });

    it("ignores suggested_product_type_id when UUID is not in productTypes whitelist", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        const OTHER = "11111111-1111-4111-8111-111111111111";
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "product_datasheet", confidence: 0.8, language: "tr",
            summary: "ok", suggested_product_type_id: OTHER,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const result = await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(result.suggested_product_type_id).toBeNull();
        vi.unstubAllEnvs();
    });
});

// ── Faz 3a Review 3.c — Server-side hard cancel (P3) ─────────────────────────

describe("aiClassifyDocument — abort signal forwarding (Review 3.c P3)", () => {
    it("forwards signal to Anthropic SDK messages.create as RequestOptions.signal", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            document_type: "unknown", confidence: 0, language: "unknown",
            summary: "x", suggested_product_type_id: null,
        }));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const ctl = new AbortController();
        await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        }, ctl.signal);
        // SDK call: (params, options); options.signal === ctl.signal
        const opts = mockMessagesCreate.mock.calls[0]?.[1] as { signal?: AbortSignal };
        expect(opts).toBeDefined();
        expect(opts.signal).toBe(ctl.signal);
        vi.unstubAllEnvs();
    });

    it("re-throws AbortError instead of graceful fallback (route delegates DB skip)", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockImplementationOnce(async () => {
            const err = new Error("Request was aborted");
            (err as Error & { name: string }).name = "AbortError";
            throw err;
        });
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        const ctl = new AbortController();
        ctl.abort();
        await expect(
            aiClassifyDocument({
                buffer: Buffer.from("x"), mimeType: "application/pdf",
                fileName: "x.pdf", productTypes,
            }, ctl.signal),
        ).rejects.toThrow(/abort/i);
        vi.unstubAllEnvs();
    });

    it("without signal, abort path inert — graceful fallback for generic errors continues", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockRejectedValueOnce(new Error("network unreachable"));
        const { aiClassifyDocument } = await import("@/lib/services/ai-service");
        // signal yok → AbortError DEĞİL → eski graceful fallback davranışı korunur
        const result = await aiClassifyDocument({
            buffer: Buffer.from("x"), mimeType: "application/pdf",
            fileName: "x.pdf", productTypes,
        });
        expect(result.document_type).toBe("unknown");
        expect(result.confidence).toBe(0);
        vi.unstubAllEnvs();
    });
});
