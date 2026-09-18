/**
 * dbUpdateCompanySettings — migration'ı uygulanmamış kolona yazmayı YAZMADAN önce
 * tanır (canlı `dev:live` mig.112 yokken belge rengi kaydı 500 değil, 409 + neden).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const current: { row: Record<string, unknown> | null } = { row: null };
const updateSpy = vi.fn();

vi.mock("@/lib/supabase/service", () => ({
    createServiceClient: () => ({
        from: () => ({
            select: () => ({
                limit: () => ({ single: async () => ({ data: current.row, error: null }) }),
            }),
            update: (patch: unknown) => {
                updateSpy(patch);
                return {
                    eq: () => ({ select: () => ({ single: async () => ({ data: { ...current.row, ...(patch as object) }, error: null }) }) }),
                };
            },
        }),
    }),
}));

import { dbUpdateCompanySettings } from "@/lib/supabase/company-settings";
import { CompanySettingsColumnMissingError, columnMissingMessage } from "@/lib/company-settings-schema";

beforeEach(() => {
    updateSpy.mockClear();
});

describe("dbUpdateCompanySettings — eksik kolon koruması", () => {
    it("kolon satırda yoksa (migration yok) YAZMAZ, tipli hata fırlatır", async () => {
        current.row = { id: "c-1", name: "Firma" }; // document_accent_color yok
        await expect(dbUpdateCompanySettings({ document_accent_color: "#123F73" }))
            .rejects.toBeInstanceOf(CompanySettingsColumnMissingError);
        expect(updateSpy).not.toHaveBeenCalled();
    });

    it("kolon varsa (NULL olsa bile) normal yazar", async () => {
        current.row = { id: "c-1", name: "Firma", document_accent_color: null };
        await dbUpdateCompanySettings({ document_accent_color: "#123F73" });
        expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ document_accent_color: "#123F73" }));
    });

    it("yalnız mevcut kolonlara yazan eski kayıt akışı etkilenmez", async () => {
        current.row = { id: "c-1", name: "Firma", phone: "" };
        await dbUpdateCompanySettings({ name: "Yeni", phone: "123" });
        expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it("mesaj hangi migration'ın eksik olduğunu söyler", () => {
        expect(columnMissingMessage(["document_accent_color"])).toMatch(/112 numaralı migration/);
        expect(columnMissingMessage(["quote_validity_days", "document_accent_color"])).toMatch(/106, 112/);
        expect(columnMissingMessage(["bilinmeyen"])).toMatch(/ilgili migration/);
    });
});
