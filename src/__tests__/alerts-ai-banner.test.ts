/**
 * Sprint A G3 — AI servisi kullanılamıyorken serviceGenerateAiAlerts aiAvailable:false döner.
 *
 * Plan kriteri: "AI servisi kullanılamıyor banner — kırmızı toast yerine sarı banner"
 * Backend kontrat: aiAvailable:boolean (camelCase) — route servis sonucunu doğrudan döner.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockIsAIAvailable = vi.fn();

const mockAiGenerateAlertFindings = vi.fn();

vi.mock("@/lib/services/ai-service", () => ({
    isAIAvailable: () => mockIsAIAvailable(),
    aiGenerateAlertFindings: (...a: unknown[]) => mockAiGenerateAlertFindings(...a),
}));

vi.mock("@/lib/supabase/products", () => ({
    dbListProducts: vi.fn().mockResolvedValue([]),
    dbListAllActiveProducts: vi.fn().mockResolvedValue([]),
    dbGetOpenShortagesByProduct: vi.fn().mockResolvedValue(new Map()),
    dbGetQuotedQuantities: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("@/lib/supabase/purchase-orders", () => ({
    dbGetIncomingPOQuantities: vi.fn().mockResolvedValue(new Map()),
    dbListOverduePurchaseOrders: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/supabase/alerts", () => ({
    dbListAlerts: vi.fn().mockResolvedValue([]),
    dbListActiveAlerts: vi.fn().mockResolvedValue([]),
    dbCreateAlert: vi.fn().mockResolvedValue({ id: "alert-1" }),
    dbBatchResolveAlerts: vi.fn().mockResolvedValue(0),
    dbDismissAlertsBySource: vi.fn().mockResolvedValue(0),
    dbListRecentlyDismissed: vi.fn().mockResolvedValue([]),
    dbUpdateAlertStatus: vi.fn().mockResolvedValue({}),
    dbUpdateActiveAlertContent: vi.fn().mockResolvedValue(1),
}));

vi.mock("@/lib/supabase/orders", () => ({
    dbListOrders: vi.fn().mockResolvedValue([]),
}));

import { serviceGenerateAiAlerts } from "@/lib/services/alert-service";

beforeEach(() => {
    vi.clearAllMocks();
    mockAiGenerateAlertFindings.mockResolvedValue({
        findings: [],
        summary: "Özet",
        modelVersion: "test-model",
        degraded: false,
    });
});

describe("serviceGenerateAiAlerts — aiAvailable flag (G3 kontrat)", () => {
    it("AI yapılandırılmamışsa aiAvailable:false döner, 0 öneri oluşturulur", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        const result = await serviceGenerateAiAlerts();

        expect(result.aiAvailable).toBe(false);
        expect(result.created).toBe(0);
        expect(result.dismissed).toBe(0);
    });

    it("AI yapılandırılmışsa aiAvailable:true döner", async () => {
        mockIsAIAvailable.mockReturnValue(true);
        const result = await serviceGenerateAiAlerts();

        expect(result.aiAvailable).toBe(true);
    });

    it("response shape'inde 'ai_available' snake_case field bulunmaz", async () => {
        mockIsAIAvailable.mockReturnValue(false);
        const result = await serviceGenerateAiAlerts();

        expect((result as Record<string, unknown>)["ai_available"]).toBeUndefined();
    });
});
