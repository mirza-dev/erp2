/**
 * G11 — Stale drift badge UI kontratı (frontend simülasyon).
 *
 * /api/ai/purchase-copilot response.recommendations[].currentDrift field'ı:
 *   - decided rec + state değişti → { suggestQty, urgencyLevel } objesi
 *   - decided rec + state değişmedi → null
 *   - 'suggested' rec → null (her CRON'da metadata refresh ediliyor)
 *
 * UI: recMap[productId].currentDrift varsa StaleDriftBadge render edilir.
 * Bu test response shape'ini ve frontend recMap kontratını doğrular.
 */
import { describe, it, expect } from "vitest";

type UrgencyLevel = "critical" | "high" | "moderate";

interface RecResponseEntry {
    productId: string;
    recommendationId: string | null;
    status: string;
    decidedAt?: string | null;
    editedMetadata?: Record<string, unknown> | null;
    currentDrift?: { suggestQty: number; urgencyLevel: UrgencyLevel } | null;
}

// Page.tsx loadAiData içindeki Map populate mantığını birebir taklit eden helper
function populateRecMap(recommendations: RecResponseEntry[]) {
    const map = new Map<string, {
        id: string;
        status: string;
        decidedAt: string | null;
        currentDrift: { suggestQty: number; urgencyLevel: UrgencyLevel } | null;
        editedQty?: number;
    }>();
    for (const r of recommendations) {
        if (!r.recommendationId) continue;
        const editedQty = r.status === "edited"
            ? (r.editedMetadata?.suggestQty as number | undefined)
            : undefined;
        map.set(r.productId, {
            id: r.recommendationId,
            status: r.status,
            decidedAt: r.decidedAt ?? null,
            currentDrift: r.currentDrift ?? null,
            ...(editedQty != null && { editedQty }),
        });
    }
    return map;
}

// UI render kararını taklit eden helper — RecActionCell mantığı
function shouldShowDriftBadge(rec: { status: string; currentDrift: unknown }): boolean {
    if (rec.currentDrift == null) return false;
    return rec.status === "accepted" || rec.status === "edited" || rec.status === "rejected";
}

describe("G11 stale drift badge — UI kontratı", () => {
    it("decided rec + currentDrift dolu → recMap entry'si drift içerir", () => {
        const map = populateRecMap([{
            productId: "p-1",
            recommendationId: "rec-1",
            status: "accepted",
            decidedAt: "2026-05-01T10:00:00Z",
            currentDrift: { suggestQty: 60, urgencyLevel: "critical" },
        }]);
        const entry = map.get("p-1");
        expect(entry?.currentDrift).toEqual({ suggestQty: 60, urgencyLevel: "critical" });
    });

    it("decided rec + drift null → entry currentDrift null", () => {
        const map = populateRecMap([{
            productId: "p-1",
            recommendationId: "rec-1",
            status: "accepted",
            currentDrift: null,
        }]);
        expect(map.get("p-1")?.currentDrift).toBeNull();
    });

    it("decided rec + currentDrift field eksikse → null normalize edilir", () => {
        const map = populateRecMap([{
            productId: "p-1",
            recommendationId: "rec-1",
            status: "accepted",
            // currentDrift undefined
        }]);
        expect(map.get("p-1")?.currentDrift).toBeNull();
    });

    it("'suggested' rec için drift hiçbir zaman gösterilmez (UI guard)", () => {
        const rec = {
            status: "suggested",
            currentDrift: { suggestQty: 60, urgencyLevel: "high" as UrgencyLevel },
        };
        // Backend zaten suggested için null gönderir; ama UI guard ek savunma:
        expect(shouldShowDriftBadge(rec)).toBe(false);
    });

    it("accepted/edited/rejected + drift dolu → badge render edilir", () => {
        const drift = { suggestQty: 60, urgencyLevel: "critical" as UrgencyLevel };
        expect(shouldShowDriftBadge({ status: "accepted", currentDrift: drift })).toBe(true);
        expect(shouldShowDriftBadge({ status: "edited", currentDrift: drift })).toBe(true);
        expect(shouldShowDriftBadge({ status: "rejected", currentDrift: drift })).toBe(true);
    });

    it("decided + drift null → badge gizlenir", () => {
        expect(shouldShowDriftBadge({ status: "accepted", currentDrift: null })).toBe(false);
        expect(shouldShowDriftBadge({ status: "rejected", currentDrift: null })).toBe(false);
    });

    it("editedMetadata.suggestQty edited status'ünde editedQty alanına yansır", () => {
        const map = populateRecMap([{
            productId: "p-1",
            recommendationId: "rec-1",
            status: "edited",
            editedMetadata: { suggestQty: 75 },
            currentDrift: null,
        }]);
        const entry = map.get("p-1");
        expect(entry?.editedQty).toBe(75);
    });

    it("recommendationId null ise map'e eklenmez", () => {
        const map = populateRecMap([{
            productId: "p-error",
            recommendationId: null,
            status: "error",
        }]);
        expect(map.has("p-error")).toBe(false);
    });
});
