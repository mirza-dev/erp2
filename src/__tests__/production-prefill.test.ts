/**
 * Faz 10 — production page ?productId=...&qty=... prefill
 *
 * Pure helper davranış matrisi (prefillLineFromQuery) +
 * source-regex Suspense wrapper + useSearchParams entegrasyonu.
 */
import { describe, it, expect, beforeAll, vi } from "vitest";

vi.mock("next/navigation", () => ({
    useSearchParams: () => new URLSearchParams(),
}));

// Side-effect import chain (production page useData global)
vi.mock("@/lib/data-context", () => ({
    useData: () => ({
        products: [], uretimKayitlari: [],
        addUretimKaydi: () => {}, deleteUretimKaydi: () => {}, loadError: null,
    }),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: () => {} }) }));
vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false,
    DEMO_DISABLED_TOOLTIP: "",
    DEMO_BLOCK_TOAST: { type: "info", message: "" },
}));
vi.mock("@/hooks/useVoiceRecorder", () => ({
    useVoiceRecorder: () => ({
        isRecording: false, isProcessing: false, duration: 0, volume: 0,
        error: null, startRecording: () => {}, stopRecording: () => {}, cancelRecording: () => {},
    }),
}));

describe("Faz 10 — prefillLineFromQuery (pure helper)", () => {
    it("productId null → null döner", async () => {
        const { prefillLineFromQuery } = await import("@/app/dashboard/production/page");
        expect(prefillLineFromQuery(null, "10", new Set(["p-1"]))).toBeNull();
    });

    it("productId aktif listede yok → null döner (silinmiş/pasif ürün koruması)", async () => {
        const { prefillLineFromQuery } = await import("@/app/dashboard/production/page");
        expect(prefillLineFromQuery("p-deleted", "10", new Set(["p-1", "p-2"]))).toBeNull();
    });

    it("productId aktif + qty pozitif int → FormLine", async () => {
        const { prefillLineFromQuery } = await import("@/app/dashboard/production/page");
        const result = prefillLineFromQuery("p-1", "100", new Set(["p-1", "p-2"]));
        expect(result).not.toBeNull();
        expect(result!.productId).toBe("p-1");
        expect(result!.adet).toBe("100");
        expect(result!.notlar).toBe("");
    });

    it("productId aktif + qty pozitif decimal → FormLine (decimal kabul)", async () => {
        const { prefillLineFromQuery } = await import("@/app/dashboard/production/page");
        const result = prefillLineFromQuery("p-1", "12.5", new Set(["p-1"]));
        expect(result?.adet).toBe("12.5");
    });

    it("qty geçersiz (alfa) → adet='' (silent fallback, helper crash etmez)", async () => {
        const { prefillLineFromQuery } = await import("@/app/dashboard/production/page");
        const result = prefillLineFromQuery("p-1", "abc", new Set(["p-1"]));
        expect(result?.productId).toBe("p-1");
        expect(result?.adet).toBe("");
    });

    it("qty null/empty → adet='' (productId yine doldurulur)", async () => {
        const { prefillLineFromQuery } = await import("@/app/dashboard/production/page");
        expect(prefillLineFromQuery("p-1", null, new Set(["p-1"]))?.adet).toBe("");
        expect(prefillLineFromQuery("p-1", "", new Set(["p-1"]))?.adet).toBe("");
    });

    it("qty 0 veya negatif → adet='' (manipülasyona karşı koruma)", async () => {
        const { prefillLineFromQuery } = await import("@/app/dashboard/production/page");
        expect(prefillLineFromQuery("p-1", "0", new Set(["p-1"]))?.adet).toBe("");
        expect(prefillLineFromQuery("p-1", "-5", new Set(["p-1"]))?.adet).toBe("");
    });
});

describe("Üretim tarihi — formatProductionDateLabel", () => {
    it("ISO tarihi Türkçe okunabilir başlığa çevirir", async () => {
        const { formatProductionDateLabel } = await import("@/app/dashboard/production/page");
        expect(formatProductionDateLabel("2026-06-10")).toMatch(/10.*Haziran.*2026/i);
    });

    it("geçersiz tarihi değiştirmeden döndürür", async () => {
        const { formatProductionDateLabel } = await import("@/app/dashboard/production/page");
        expect(formatProductionDateLabel("2026-02-31")).toBe("2026-02-31");
        expect(formatProductionDateLabel("geçersiz")).toBe("geçersiz");
    });
});

describe("Faz 10 — production page source-regex", () => {
    let src = "";

    beforeAll(async () => {
        const fs = await import("fs/promises");
        const path = await import("path");
        src = await fs.readFile(
            path.resolve(process.cwd(), "src/app/dashboard/production/page.tsx"),
            "utf-8",
        );
    });

    it("Suspense wrapper + ProductionPageInner pattern (Next 15 useSearchParams)", () => {
        expect(src).toMatch(/import \{ Suspense,/);
        expect(src).toContain("function ProductionPageInner");
        expect(src).toMatch(/export default function ProductionPage\(\) \{[\s\S]*?<Suspense\b/);
    });

    it("useSearchParams import + kullanım", () => {
        expect(src).toContain('useSearchParams } from "next/navigation"');
        expect(src).toContain("useSearchParams()");
    });

    it("prefilledRef.current guard ile tek seferlik prefill", () => {
        expect(src).toContain("prefilledRef");
        expect(src).toMatch(/if \(prefilledRef\.current\) return/);
        expect(src).toMatch(/prefilledRef\.current = true/);
    });

    it("prefill useEffect: products.length=0 → erken return (henüz yüklenmedi)", () => {
        expect(src).toMatch(/if \(products\.length === 0\) return/);
    });

    it("prefill: searchParams.get('productId') + searchParams.get('qty') okunur", () => {
        expect(src).toContain('searchParams.get("productId")');
        expect(src).toContain('searchParams.get("qty")');
    });

    it("prefill: ilk satır boşsa override; doluysa prepend pattern", () => {
        expect(src).toMatch(/firstEmpty/);
        expect(src).toMatch(/\[newLineEntry, \.\.\.prev\]/);
    });
});
