/**
 * POST /api/production/transcribe — Route Testleri
 * Auth (401), boyut limiti (400), boş audio (400), MIME tip (400), key eksik (503), başarı (200)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Auth mock ─────────────────────────────────────────────────────────────────

const mockGetUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
    createClient: () => Promise.resolve({
        auth: { getUser: () => mockGetUser() },
    }),
}));

// ── Diğer bağımlılıklar ───────────────────────────────────────────────────────

vi.mock("next/headers", () => ({
    cookies: () => Promise.resolve({ get: () => undefined }),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbListAllActiveProducts: vi.fn().mockResolvedValue([
        { id: "prod-1", name: "DN50 Vana", sku: "DN50", on_hand: 100, reserved: 10, available_now: 90, is_active: true },
    ]),
}));

const mockTranscribe = vi.fn();
const mockExtract = vi.fn();
const mockBuildPrompt = vi.fn().mockReturnValue("DN50 DN50 Vana");
let mockVoiceAvailable = true;

vi.mock("@/lib/services/voice-service", () => ({
    transcribeAudio: (...args: unknown[]) => mockTranscribe(...args),
    extractProductionData: (...args: unknown[]) => mockExtract(...args),
    buildWhisperPrompt: (...args: unknown[]) => mockBuildPrompt(...args),
    isVoiceAvailable: () => mockVoiceAvailable,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFormDataRequest(file: File | null): Request {
    const formData = new FormData();
    if (file) formData.append("audio", file, file.name);
    return new Request("http://localhost/api/production/transcribe", {
        method: "POST",
        body: formData,
    });
}

function makeAudioFile(size = 1000, name = "recording.webm", type = "audio/webm"): File {
    const buf = new Uint8Array(size).fill(0);
    return new File([buf], name, { type });
}

// ── Testler ───────────────────────────────────────────────────────────────────

describe("POST /api/production/transcribe", () => {
    beforeEach(() => {
        mockGetUser.mockReset();
        mockTranscribe.mockReset();
        mockExtract.mockReset();
        mockVoiceAvailable = true;
    });

    it("Session yoksa 401 döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: null } });

        const { POST } = await import("@/app/api/production/transcribe/route");
        const res = await POST(makeFormDataRequest(makeAudioFile()));

        expect(res.status).toBe(401);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("Oturum");
    });

    it("audio alanı eksikse 400 döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

        const { POST } = await import("@/app/api/production/transcribe/route");
        const req = new Request("http://localhost/api/production/transcribe", {
            method: "POST",
            body: new FormData(), // audio yok
        });
        const res = await POST(req);

        expect(res.status).toBe(400);
    });

    it("Ses dosyası 10MB'ı aşarsa 400 döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

        const bigFile = makeAudioFile(11 * 1024 * 1024); // 11MB
        const { POST } = await import("@/app/api/production/transcribe/route");
        const res = await POST(makeFormDataRequest(bigFile));

        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("10MB");
    });

    it("OPENAI_API_KEY yoksa (isVoiceAvailable=false) 503 döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
        mockVoiceAvailable = false;

        const { POST } = await import("@/app/api/production/transcribe/route");
        const res = await POST(makeFormDataRequest(makeAudioFile()));

        expect(res.status).toBe(503);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("yapılandırılmamış");
    });

    it("Ses olmayan MIME type gelirse 400 döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

        const formData = new FormData();
        const pdfFile = new File([new Uint8Array(1000)], "doc.pdf", { type: "application/pdf" });
        formData.append("audio", pdfFile, pdfFile.name);
        const req = new Request("http://localhost/api/production/transcribe", {
            method: "POST",
            body: formData,
        });

        const { POST } = await import("@/app/api/production/transcribe/route");
        const res = await POST(req);

        expect(res.status).toBe(400);
        const body = await res.json() as { error: string };
        expect(body.error).toContain("Geçersiz dosya formatı");
    });

    it("Başarılı çağrıda 200 ve { text, entries, sessionNote } döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1", email: "usta@pmt.com" } } });

        mockTranscribe.mockResolvedValue("50 adet DN50 vana ürettik");
        mockExtract.mockResolvedValue({
            entries: [{
                productId: "prod-1",
                productName: "DN50 Vana",
                productSku: "DN50",
                quantity: 50,
                fireNotes: "",
                confidence: 0.95,
            }],
            sessionNote: "",
            rawText: "50 adet DN50 vana ürettik",
        });

        const { POST } = await import("@/app/api/production/transcribe/route");
        const res = await POST(makeFormDataRequest(makeAudioFile()));

        expect(res.status).toBe(200);
        const body = await res.json() as { text: string; entries: { productId: string; quantity: number }[]; sessionNote: string };
        expect(body.text).toBe("50 adet DN50 vana ürettik");
        expect(Array.isArray(body.entries)).toBe(true);
        expect(body.entries[0].productId).toBe("prod-1");
        expect(body.entries[0].quantity).toBe(50);
        expect(typeof body.sessionNote).toBe("string");
    });

    it("Boş ses dosyası (0 byte) 400 döner", async () => {
        mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } } });

        const emptyFile = makeAudioFile(0);
        const { POST } = await import("@/app/api/production/transcribe/route");
        const res = await POST(makeFormDataRequest(emptyFile));

        expect(res.status).toBe(400);
    });
});
