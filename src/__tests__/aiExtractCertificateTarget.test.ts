/**
 * Faz 3b — aiExtractCertificateTarget + parseCertificateTargetResponse tests.
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

describe("parseCertificateTargetResponse", () => {
    it("valid JSON → fields mapped", async () => {
        const { parseCertificateTargetResponse } = await import("@/lib/services/ai-service");
        const r = parseCertificateTargetResponse(JSON.stringify({
            target_name: "Vana DN100", target_sku: "KV-DN100", confidence: 0.85,
        }));
        expect(r.target_name).toBe("Vana DN100");
        expect(r.target_sku).toBe("KV-DN100");
        expect(r.confidence).toBe(0.85);
    });

    it("invalid JSON → fallback (nulls + 0)", async () => {
        const { parseCertificateTargetResponse } = await import("@/lib/services/ai-service");
        const r = parseCertificateTargetResponse("not json");
        expect(r.target_name).toBeNull();
        expect(r.confidence).toBe(0);
    });

    it("confidence clamped", async () => {
        const { parseCertificateTargetResponse } = await import("@/lib/services/ai-service");
        const r = parseCertificateTargetResponse(JSON.stringify({ confidence: 5 }));
        expect(r.confidence).toBe(1);
    });
});

describe("aiExtractCertificateTarget — behavior", () => {
    it("AI unavailable → fallback no API call", async () => {
        vi.unstubAllEnvs();
        const { aiExtractCertificateTarget } = await import("@/lib/services/ai-service");
        const r = await aiExtractCertificateTarget({
            buffer: Buffer.from("x"), mimeType: "application/pdf", fileName: "cert.pdf",
        });
        expect(r.target_name).toBeNull();
        expect(mockMessagesCreate).not.toHaveBeenCalled();
    });

    it("happy path → logAiRun with feature=import_extract_certificate", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            target_name: "Vana DN100", target_sku: "KV-100", confidence: 0.9,
        }));
        const { aiExtractCertificateTarget } = await import("@/lib/services/ai-service");
        const r = await aiExtractCertificateTarget({
            buffer: Buffer.from("%PDF"), mimeType: "application/pdf", fileName: "cert.pdf",
        });
        expect(r.target_name).toBe("Vana DN100");
        expect(mockLogAiRun.mock.calls[0]?.[0]?.feature).toBe("import_extract_certificate");
        vi.unstubAllEnvs();
    });

    it("re-throws AbortError instead of graceful", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockImplementationOnce(async () => {
            const e = new Error("abort");
            (e as Error & { name: string }).name = "AbortError";
            throw e;
        });
        const { aiExtractCertificateTarget } = await import("@/lib/services/ai-service");
        const ctl = new AbortController(); ctl.abort();
        await expect(aiExtractCertificateTarget({
            buffer: Buffer.from("x"), mimeType: "application/pdf", fileName: "c.pdf",
        }, ctl.signal)).rejects.toThrow(/abort/i);
        vi.unstubAllEnvs();
    });

    it("generic error → graceful fallback", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockRejectedValueOnce(new Error("network"));
        const { aiExtractCertificateTarget } = await import("@/lib/services/ai-service");
        const r = await aiExtractCertificateTarget({
            buffer: Buffer.from("x"), mimeType: "application/pdf", fileName: "c.pdf",
        });
        expect(r.target_name).toBeNull();
        expect(r.confidence).toBe(0);
        vi.unstubAllEnvs();
    });

    it("forwards signal to SDK", async () => {
        vi.stubEnv("ANTHROPIC_API_KEY", "key");
        mockMessagesCreate.mockResolvedValueOnce(aiResponse({
            target_name: "X", target_sku: null, confidence: 0.5,
        }));
        const { aiExtractCertificateTarget } = await import("@/lib/services/ai-service");
        const ctl = new AbortController();
        await aiExtractCertificateTarget({
            buffer: Buffer.from("x"), mimeType: "application/pdf", fileName: "c.pdf",
        }, ctl.signal);
        const opts = mockMessagesCreate.mock.calls[0]?.[1] as { signal?: AbortSignal };
        expect(opts.signal).toBe(ctl.signal);
        vi.unstubAllEnvs();
    });
});
