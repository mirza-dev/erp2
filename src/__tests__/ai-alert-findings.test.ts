/**
 * aiGenerateAlertFindings — tool-use yapılandırılmış AI bulgu üretimi.
 *
 * Sözleşme:
 *  - Çıktı tool_use bloğundan okunur (regex JSON yakalama YOK)
 *  - product_id girdi listesinde yoksa bulgu ATILIR (halüsinasyon koruması)
 *  - En fazla 6 bulgu; confidence 0-1'e clamp'lenir; severity whitelist
 *  - Ürün listesi boşsa API çağrısı atılmaz
 *  - API hatasında graceful degradation (boş sonuç, throw yok)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
    default: vi.fn(function () {
        return { messages: { create: mockCreate } };
    }),
}));

vi.mock("@/lib/supabase/orders", () => ({ dbGetOrderById: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { aiGenerateAlertFindings, type AlertFindingsInput } from "@/lib/services/ai-service";

function input(products: Partial<AlertFindingsInput["products"][0]>[] = []): AlertFindingsInput {
    return {
        aggregates: {
            criticalStockCount: 1, warningStockCount: 2,
            pendingOrderCount: 3, approvedOrderCount: 4, openAlertCount: 5,
        },
        products: products.map((p, i) => ({
            id: p.id ?? `prod-${i}`,
            sku: p.sku ?? `SKU-${i}`,
            name: p.name ?? `Ürün ${i}`,
            unit: "adet",
            available: p.available ?? 10,
            promisable: p.promisable ?? 8,
            min: p.min ?? 5,
            dailyUsage: p.dailyUsage ?? 2,
            coverageDays: p.coverageDays ?? 5,
            leadTimeDays: p.leadTimeDays ?? 7,
            openShortageQty: p.openShortageQty ?? 0,
            incomingPoQty: p.incomingPoQty ?? 0,
        })),
    };
}

function toolResponse(findings: unknown[], summary = "özet") {
    return {
        content: [{ type: "tool_use", name: "uyari_bulgulari", input: { summary, findings } }],
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
});

describe("aiGenerateAlertFindings", () => {
    it("tool_use bloğundan bulguları okur; tool_choice şemayı zorlar", async () => {
        mockCreate.mockResolvedValue(toolResponse([{
            product_id: "prod-0", title: "Bulgu", detail: "Detay", action: "Aksiyon",
            severity: "warning", confidence: 0.8,
        }]));

        const result = await aiGenerateAlertFindings(input([{ id: "prod-0" }]));

        expect(result.findings).toHaveLength(1);
        expect(result.findings[0]).toMatchObject({
            productId: "prod-0", severity: "warning", confidence: 0.8,
        });
        expect(result.summary).toBe("özet");
        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.tool_choice).toEqual({ type: "tool", name: "uyari_bulgulari" });
        expect(callArgs.tools[0].name).toBe("uyari_bulgulari");
    });

    it("girdi listesinde olmayan product_id'li bulgu ATILIR (halüsinasyon)", async () => {
        mockCreate.mockResolvedValue(toolResponse([
            { product_id: "prod-0", title: "Geçerli", detail: "d", action: "a", severity: "info", confidence: 0.5 },
            { product_id: "uydurma-id", title: "Halüsinasyon", detail: "d", action: "a", severity: "warning", confidence: 0.9 },
        ]));

        const result = await aiGenerateAlertFindings(input([{ id: "prod-0" }]));

        expect(result.findings).toHaveLength(1);
        expect(result.findings[0].productId).toBe("prod-0");
    });

    it("6'dan fazla bulgu kırpılır; confidence clamp; bilinmeyen severity → info", async () => {
        const many = Array.from({ length: 10 }, (_, i) => ({
            product_id: `prod-${i}`, title: `B${i}`, detail: "d", action: "a",
            severity: i === 0 ? "critical" : "warning", // critical şemada yok → info'ya düşmeli
            confidence: 5, // clamp → 1
        }));
        mockCreate.mockResolvedValue(toolResponse(many));

        const result = await aiGenerateAlertFindings(input(many.map((_, i) => ({ id: `prod-${i}` }))));

        expect(result.findings).toHaveLength(6);
        expect(result.findings[0].severity).toBe("info"); // kırmızı üretmez (domain-rules §6.3)
        expect(result.findings.every(f => f.confidence <= 1)).toBe(true);
    });

    it("ürün listesi boşsa API çağrısı ATILMAZ (degraded DEĞİL — gerçekten bulgu yok)", async () => {
        const result = await aiGenerateAlertFindings(input([]));
        expect(result.findings).toEqual([]);
        expect(result.degraded).toBe(false);
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("API hatası → graceful degradation (boş sonuç + degraded:true, throw yok)", async () => {
        mockCreate.mockRejectedValue(new Error("api down"));
        const result = await aiGenerateAlertFindings(input([{ id: "prod-0" }]));
        expect(result.findings).toEqual([]);
        expect(result.summary).toBe("");
        expect(result.degraded).toBe(true);
    });

    it("başarılı çağrı → degraded:false", async () => {
        mockCreate.mockResolvedValue(toolResponse([]));
        const result = await aiGenerateAlertFindings(input([{ id: "prod-0" }]));
        expect(result.degraded).toBe(false);
    });

    it("system prompt kural-tekrarını yasaklar (prompt sözleşmesi)", async () => {
        mockCreate.mockResolvedValue(toolResponse([]));
        await aiGenerateAlertFindings(input([{ id: "prod-0" }]));
        const callArgs = mockCreate.mock.calls[0][0];
        expect(callArgs.system).toContain("TEKRARLAMA");
        expect(callArgs.system).toContain("kuralların GÖREMEDİĞİ");
    });
});
