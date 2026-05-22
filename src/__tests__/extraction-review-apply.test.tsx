// @vitest-environment jsdom
/**
 * Faz 3c — ExtractionReview Apply button + result panel RTL tests.
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
    default: ({ children, onClick, disabled, title, ...rest }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string } & Record<string, unknown>) => (
        <button onClick={onClick} disabled={disabled} title={title} {...rest}>{children}</button>
    ),
}));

beforeEach(() => {
    vi.restoreAllMocks();
    mockToast.mockReset();
    mockRouterRefresh.mockReset();
});

afterEach(() => cleanup());

const DOC: ImportDocumentRow = {
    id: "doc-1",
    batch_id: null,
    file_path: "import-staging/doc-1.pdf",
    file_name: "catalog.pdf",
    file_size: 100,
    mime_type: "application/pdf",
    classification: {
        document_type: "product_catalog", confidence: 0.9, language: "tr",
        summary: "test", suggested_product_type_id: null,
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
        extracted_name: `Vana ${id}`,
        extracted_sku: `SKU-${id}`,
        extracted_attributes: {},
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

describe("ExtractionReview — Faz 3c Apply", () => {
    it("hasApplicable=false (tüm satırlar pending) → 'Uygula' disabled", () => {
        vi.stubGlobal("fetch", vi.fn());
        render(<ExtractionReview
            document={DOC}
            initialLines={[makeLine("1", { match_action: "pending" })]}
            productTypes={[]}
        />);
        const btn = screen.getByRole("button", { name: /^Uygula$/ });
        expect(btn).toHaveProperty("disabled", true);
        expect(btn.getAttribute("title")).toMatch(/yok/i);
    });

    it("hasApplicable=true + classified → 'Uygula' enabled", () => {
        vi.stubGlobal("fetch", vi.fn());
        render(<ExtractionReview document={DOC} initialLines={[makeLine("1")]} productTypes={[]} />);
        const btn = screen.getByRole("button", { name: /^Uygula$/ });
        expect(btn).toHaveProperty("disabled", false);
    });

    it("apply başarılı → fetch POST + sonuç paneli render + success toast + setDocApplied", async () => {
        const fetchSpy = vi.fn(async () => new Response(JSON.stringify({
            ok: true,
            result: { products_created: 2, products_updated: 1, attachments_created: 0, skipped: 1, errors: [], untyped_products: 0 },
        }), { status: 200 }));
        vi.stubGlobal("fetch", fetchSpy);

        render(<ExtractionReview document={DOC} initialLines={[makeLine("1"), makeLine("2"), makeLine("3")]} productTypes={[]} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Uygula$/ }));
        });

        await waitFor(() => {
            // Sonuç paneli render
            expect(screen.getByRole("status")).toBeTruthy();
            // Counts
            expect(screen.getByText(/2 yeni ürün/)).toBeTruthy();
            expect(screen.getByText(/1 güncelleme/)).toBeTruthy();
        });

        // Endpoint URL doğru
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toContain("/api/import/documents/doc-1/apply");
        expect(init.method).toBe("POST");

        // Success toast
        expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ type: "success" }));

        // Button artık disabled (docStatus → applied)
        await waitFor(() => {
            const btn = screen.getByRole("button", { name: /^Uygula$/ });
            expect(btn).toHaveProperty("disabled", true);
        });
    });

    it("untyped_products > 0 → warning bilgisi panelde görünür", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            ok: true,
            result: { products_created: 3, products_updated: 0, attachments_created: 0, skipped: 0, errors: [], untyped_products: 2 },
        }), { status: 200 })));

        render(<ExtractionReview
            document={DOC}
            initialLines={[makeLine("1", { match_action: "new_product" })]}
            productTypes={[]}
        />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Uygula$/ }));
        });

        await waitFor(() => {
            expect(screen.getByText(/2 ürün tipsiz/)).toBeTruthy();
        });
    });

    it("apply başarısız (500) → error toast, sonuç paneli yok, doc 'classified' kalır", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            error: "DB exploded",
        }), { status: 500 })));

        render(<ExtractionReview document={DOC} initialLines={[makeLine("1")]} productTypes={[]} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Uygula$/ }));
        });

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                type: "error",
                message: expect.stringMatching(/DB exploded/),
            }));
        });
        expect(screen.queryByRole("status")).toBeNull();
        // Button hâlâ enabled (doc applied'a geçmedi)
        expect(screen.getByRole("button", { name: /^Uygula$/ })).toHaveProperty("disabled", false);
    });

    it("doc.status='applied' → 'Uygula' disabled + 'Belge uygulandı' bilgisi", () => {
        vi.stubGlobal("fetch", vi.fn());
        render(<ExtractionReview
            document={{ ...DOC, status: "applied" }}
            initialLines={[makeLine("1")]}
            productTypes={[]}
        />);
        const btn = screen.getByRole("button", { name: /^Uygula$/ });
        expect(btn).toHaveProperty("disabled", true);
        expect(btn.getAttribute("title")).toMatch(/uygulandı/i);
        expect(screen.getByText(/Belge uygulandı/)).toBeTruthy();
    });

    it("doc.status='applied' → 'Yeniden Çıkar' disabled + 'tekrar çıkarılamaz' tooltip (Faz 3c Review 2.tur)", () => {
        vi.stubGlobal("fetch", vi.fn());
        render(<ExtractionReview
            document={{ ...DOC, status: "applied" }}
            initialLines={[makeLine("1")]}
            productTypes={[]}
        />);
        const btn = screen.getByRole("button", { name: /Yeniden Çıkar|^Çıkar$/ });
        expect(btn).toHaveProperty("disabled", true);
        expect(btn.getAttribute("title")).toMatch(/tekrar çıkarılamaz/i);
    });

    // ── Faz 3c Review — all-fail policy + attachments_superseded ──

    it("all-fail (successCount=0) → button enabled kalır, warning toast, doc applied'a geçmez", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            ok: true,
            result: {
                products_created: 0, products_updated: 0, attachments_created: 0,
                attachments_superseded: 0, skipped: 1,
                errors: ["Satır 1: SKU eksik"], untyped_products: 0,
            },
        }), { status: 200 })));

        render(<ExtractionReview document={DOC} initialLines={[makeLine("1")]} productTypes={[]} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Uygula$/ }));
        });

        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                type: "warning",
                message: expect.stringMatching(/Hiçbir satır uygulanamadı/i),
            }));
        });
        // Button hâlâ enabled (doc 'classified' kalır, retry mümkün)
        expect(screen.getByRole("button", { name: /^Uygula$/ })).toHaveProperty("disabled", false);
        // "Belge uygulandı" hint görünmez
        expect(screen.queryByText(/Belge uygulandı/)).toBeNull();
    });

    it("attachments_superseded > 0 → sonuç panelinde 'önceki versiyon' bilgisi", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            ok: true,
            result: {
                products_created: 0, products_updated: 0, attachments_created: 1,
                attachments_superseded: 2, skipped: 0, errors: [], untyped_products: 0,
            },
        }), { status: 200 })));

        render(<ExtractionReview document={DOC} initialLines={[makeLine("1")]} productTypes={[]} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Uygula$/ }));
        });

        await waitFor(() => {
            expect(screen.getByText(/2 eski sertifika önceki versiyona alındı/)).toBeTruthy();
        });
    });

    // ── Faz 3c Review 4.tur (P3) — applying state UX ─────────────────────

    it("doc.status='applying' → Uygula disabled + 'devam ediyor' tooltip + warning footer", () => {
        vi.stubGlobal("fetch", vi.fn());
        render(<ExtractionReview
            document={{ ...DOC, status: "applying" }}
            initialLines={[makeLine("1")]}
            productTypes={[]}
        />);
        const applyBtn = screen.getByRole("button", { name: /^Uygula$/ });
        expect(applyBtn).toHaveProperty("disabled", true);
        expect(applyBtn.getAttribute("title")).toMatch(/uygulanıyor/i);
        // Footer warning mesajı
        expect(screen.getByText(/uygulanıyor — başka bir oturumda/i)).toBeTruthy();
        // "Belge uygulandı" mesajı GÖRÜNMEMELI (applied terminal değil, applying transient)
        expect(screen.queryByText(/Belge uygulandı/)).toBeNull();
        // Yeniden Çıkar de disabled
        const extractBtn = screen.getByRole("button", { name: /Yeniden Çıkar|^Çıkar$/ });
        expect(extractBtn).toHaveProperty("disabled", true);
        expect(extractBtn.getAttribute("title")).toMatch(/uygulanıyor/i);
    });

    it("handleApply 409 (başka oturum) → info toast + setDocStatus('applying') + buton disable", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
            error: "Belge şu anda başka bir oturumda uygulanıyor. Lütfen sayfayı yenileyin.",
        }), { status: 409 })));

        render(<ExtractionReview document={DOC} initialLines={[makeLine("1")]} productTypes={[]} />);

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /^Uygula$/ }));
        });

        // Info toast (error değil)
        await waitFor(() => {
            expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
                type: "info",
                message: expect.stringMatching(/başka bir oturumda uygulanıyor/i),
            }));
        });

        // setDocStatus('applying') sonrası buton disable + warning footer görünür
        await waitFor(() => {
            const btn = screen.getByRole("button", { name: /^Uygula$/ });
            expect(btn).toHaveProperty("disabled", true);
            expect(btn.getAttribute("title")).toMatch(/uygulanıyor/i);
        });
        expect(screen.getByText(/uygulanıyor — başka bir oturumda/i)).toBeTruthy();
    });
});
