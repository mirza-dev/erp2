/**
 * G4 (bulgular 4. tur) — purchase-suggested-demo-mode
 *
 * Sprint C G7: demo modda /api/ai/purchase-copilot POST middleware tarafından
 * 403 ile engelleniyor (regression: demo-mode-middleware.test.ts).
 *
 * UI tarafı da fetch'i hiç yapmamalı (gereksiz network + sessiz toast). Bu
 * davranış shouldSkipAiFetch helper'ı ile loadAiData içinde uygulanıyor.
 *
 * Page-level (jsdom gerektiren) entegrasyon yerine helper kontratını test
 * ediyoruz; middleware regresyonu için demo-mode-middleware.test.ts geçerli.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { shouldSkipAiFetch } from "@/lib/purchase-utils";

describe("shouldSkipAiFetch — demo guard kontratı", () => {
    it("isDemo=true → AI fetch atlanır (true döner)", () => {
        expect(shouldSkipAiFetch(true)).toBe(true);
    });

    it("isDemo=false → AI fetch yapılır (false döner)", () => {
        expect(shouldSkipAiFetch(false)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Frontend kontrat simülasyonu: page'in inline loadAiData logic'inin demo
// branch'ini birebir replikate ederek davranışı doğruluyoruz.
//
// Pattern: if (shouldSkipAiFetch(isDemo)) { return null; } else fetch().
// ─────────────────────────────────────────────────────────────────────────────

async function loadAiDataSimulation(
    isDemo: boolean,
    fetchFn: typeof fetch,
): Promise<unknown> {
    if (shouldSkipAiFetch(isDemo)) return null;
    const res = await fetchFn("/api/ai/purchase-copilot", { method: "POST" });
    return res.json();
}

describe("loadAiData demo guard — frontend kontrat simülasyonu", () => {
    let mockFetch: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mockFetch = vi.fn();
    });

    it("demo modda fetch hiç çağrılmaz", async () => {
        const result = await loadAiDataSimulation(true, mockFetch as unknown as typeof fetch);
        expect(mockFetch).not.toHaveBeenCalled();
        expect(result).toBeNull();
    });

    it("normal modda fetch çağrılır", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ items: [], counts: {} }),
        });
        await loadAiDataSimulation(false, mockFetch as unknown as typeof fetch);
        expect(mockFetch).toHaveBeenCalledWith("/api/ai/purchase-copilot", { method: "POST" });
    });

    it("demo modu açık → kapalı geçişinde fetch yeniden çalışır", async () => {
        mockFetch.mockResolvedValue({
            ok: true,
            json: () => Promise.resolve({ items: [] }),
        });
        await loadAiDataSimulation(true, mockFetch as unknown as typeof fetch);
        expect(mockFetch).not.toHaveBeenCalled();
        await loadAiDataSimulation(false, mockFetch as unknown as typeof fetch);
        expect(mockFetch).toHaveBeenCalledTimes(1);
    });
});
