// @vitest-environment jsdom
/**
 * Faz 3b Review 4.tur — ExtractionReview interaction tests (RTL).
 *
 * Bulk approve davranışı (P3 4.tur):
 *   - Tüm PATCH başarılı → her satır 'Onaylandı' (reviewed) olarak görünür
 *   - Karışık başarı/hata → succeeded satırlar reviewed; failed satırlar matched kalır
 *   - Hiç matched yoksa info toast, PATCH atmaz
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import ExtractionReview from "@/components/import/ExtractionReview";
import type { ImportDocumentRow, ImportDocumentLineRow } from "@/lib/database.types";

vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false,
    DEMO_BLOCK_TOAST: "x",
    DEMO_DISABLED_TOOLTIP: "x",
}));

const mockToast = vi.fn();
vi.mock("@/components/ui/Toast", () => ({
    useToast: () => ({ toast: mockToast }),
}));

const mockRouterRefresh = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ refresh: mockRouterRefresh, push: vi.fn() }),
}));

vi.mock("@/components/ui/Button", () => ({
    default: ({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean } & Record<string, unknown>) => (
        <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
    ),
}));

beforeEach(() => {
    vi.restoreAllMocks();
    mockToast.mockReset();
    mockRouterRefresh.mockReset();
});

afterEach(() => {
    cleanup();
});

const DOC: ImportDocumentRow = {
    id: "doc-1",
    batch_id: null,
    file_path: "import-staging/doc-1.pdf",
    file_name: "catalog.pdf",
    file_size: 100,
    mime_type: "application/pdf",
    classification: {
        document_type: "product_catalog",
        confidence: 0.9,
        language: "tr",
        summary: "test",
        suggested_product_type_id: null,
    },
    status: "classified",
    error_message: null,
    classified_at: "2026-01-01",
    created_by: null,
    created_at: "2026-01-01",
};

function makeLine(id: string, overrides: Partial<ImportDocumentLineRow> = {}): ImportDocumentLineRow {
    return {
        id,
        document_id: "doc-1",
        line_number: Number(id.replace(/\D/g, "")) || 1,
        extraction_type: "product",
        product_type_id: null,
        extracted_name: `Test ${id}`,
        extracted_sku: `SKU-${id}`,
        extracted_attributes: {},
        extraction_evidence: {},
        candidate_matches: [],
        matched_product_id: "p-1",
        match_confidence: 95,
        match_action: "matched",
        extracted_at: "2026-01-01",
        reviewed_at: null,
        reviewed_by: null,
        ...overrides,
    };
}

describe("ExtractionReview — bulk approve (Review 3b 4.tur P3)", () => {
    it("tüm matched satırlar başarılı PATCH → tümü 'Onaylandı' (reviewed) olur", async () => {
        const fetchSpy = vi.fn(async (_url: string) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        vi.stubGlobal("fetch", fetchSpy);

        render(<ExtractionReview document={DOC} initialLines={[makeLine("1"), makeLine("2")]} productTypes={[]} />);

        // İlk renderda iki "Eşleştirildi" badge
        await waitFor(() => {
            expect(screen.getAllByText(/Eşleştirildi/).length).toBe(2);
        });

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Eşleşmeleri Onayla/ }));
        });

        // Optimistic update: her iki satır artık "Onaylandı"
        await waitFor(() => {
            expect(screen.getAllByText(/Onaylandı/).length).toBe(2);
            // Eski matched badge'leri gitmiş olmalı
            expect(screen.queryByText(/Eşleştirildi/)).toBeNull();
        });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });

    it("karışık başarı/hata → succeeded satırlar reviewed, failed satırlar matched kalır", async () => {
        // İlk PATCH 200, ikinci 500
        let call = 0;
        const fetchSpy = vi.fn(async () => {
            call += 1;
            return call === 1
                ? new Response(JSON.stringify({ ok: true }), { status: 200 })
                : new Response(JSON.stringify({ error: "fail" }), { status: 500 });
        });
        vi.stubGlobal("fetch", fetchSpy);

        render(<ExtractionReview document={DOC} initialLines={[makeLine("1"), makeLine("2")]} productTypes={[]} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Eşleşmeleri Onayla/ }));
        });

        await waitFor(() => {
            // 1 satır "Onaylandı" + 1 satır hâlâ "Eşleştirildi"
            expect(screen.getAllByText(/Onaylandı/).length).toBe(1);
            expect(screen.getAllByText(/Eşleştirildi/).length).toBe(1);
        });

        // Hem success hem error toast tetiklendi
        const calls = mockToast.mock.calls.map(c => c[0]);
        expect(calls.some(c => c.type === "success" && /1 satır onaylandı/.test(c.message))).toBe(true);
        expect(calls.some(c => c.type === "error" && /1 satır onaylanamadı/.test(c.message))).toBe(true);
    });

    // Review 3b 5.tur P2: cert-flow productTypeId bypass
    it("cert-flow + suggested_product_type_id set → filter dropdown gizli + body'de productTypeId yok", async () => {
        const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ ok: true, lines: [] }), { status: 201 }));
        vi.stubGlobal("fetch", fetchSpy);

        const certDoc: ImportDocumentRow = {
            ...DOC,
            classification: {
                document_type: "material_certificate",
                confidence: 0.9,
                language: "tr",
                summary: "sertifika",
                suggested_product_type_id: "type-stale-or-deleted",
            },
        };
        const productTypes = [{ id: "type-vana", name: "Vana", fields: [] }];

        render(<ExtractionReview document={certDoc} initialLines={[]} productTypes={productTypes} />);

        // Filter dropdown render edilmemeli
        expect(screen.queryByLabelText(/Ürün tipi filtresi/)).toBeNull();

        // "Çıkar" tıkla
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Çıkar$/ }));
        });

        await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
        const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        const body = JSON.parse((init.body as string) || "{}");
        // Cert-flow'da productTypeId gönderilmemeli (suggested set olsa bile)
        expect(body.productTypeId).toBeUndefined();
    });

    // Review 3b 6.tur P3: cert-flow satırlarda per-row "Tip" kolonu da gizli
    it("cert-flow + satırlar render → tablo'da 'Tip' header yok + satır Tip <select> yok", async () => {
        vi.stubGlobal("fetch", vi.fn());

        const certDoc: ImportDocumentRow = {
            ...DOC,
            classification: {
                document_type: "compliance_doc", confidence: 0.85, language: "tr",
                summary: "uygunluk", suggested_product_type_id: null,
            },
        };
        const certLine = makeLine("1", {
            extraction_type: "certificate_target",
            product_type_id: null,
            match_action: "pending",
            matched_product_id: null,
            match_confidence: 70,
        });

        render(<ExtractionReview document={certDoc} initialLines={[certLine]} productTypes={[{ id: "type-vana", name: "Vana", fields: [] }]} />);

        // Tablo başlığında "Tip" kolonu yok
        const headers = screen.getAllByRole("columnheader").map(h => h.textContent);
        expect(headers).not.toContain("Tip");

        // Per-row Tip <select> de yok
        expect(screen.queryByLabelText(/Satır 1 ürün tipi/)).toBeNull();
    });

    it("matched satır yoksa info toast + PATCH atmaz", async () => {
        const fetchSpy = vi.fn();
        vi.stubGlobal("fetch", fetchSpy);

        render(<ExtractionReview
            document={DOC}
            initialLines={[makeLine("1", { match_action: "skipped", matched_product_id: null })]}
            productTypes={[]}
        />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Eşleşmeleri Onayla/ }));
        });

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
            type: "info",
            message: expect.stringMatching(/Onaylanacak satır yok/i),
        }));
    });
});
