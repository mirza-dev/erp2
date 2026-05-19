// @vitest-environment jsdom
/**
 * Faz 3a Review 2 — ClassifierQueue interaction tests (RTL).
 *
 * Doğruladıkları:
 *   - P2 fix: render-phase'de fetch yok; useEffect içinde fetch
 *   - Strict Mode double-render: fetch hâlâ 1 kez (duplicate POST yok)
 *   - mountedRef fix: queue patch effect re-run sonrası fetch.then() iptal olmaz
 *     → state classifying → classified geçer (Faz 3a Review 2 bug)
 *   - P3-008 fix: "Listeyi Temizle" internal queue'yu temizler
 *   - Retry/Remove akışları
 *
 * Not: concurrency-cap testi düşürüldü — jsdom microtask flush ile manual
 * resolver tabanlı testler flaky; davranış helper testi classifier-queue.test.ts
 * içinde `selectClassifyCandidates` ile kanıtlandı.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, waitFor, cleanup } from "@testing-library/react";
import { StrictMode } from "react";
import ClassifierQueue from "@/components/import/ClassifierQueue";

vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false,
    DEMO_BLOCK_TOAST: "x",
    DEMO_DISABLED_TOOLTIP: "x",
}));

vi.mock("@/components/ui/Toast", () => ({
    useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/ui/Button", () => ({
    default: ({ children, onClick, disabled, ...rest }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean } & Record<string, unknown>) => (
        <button onClick={onClick} disabled={disabled} {...rest}>{children}</button>
    ),
}));

function makeFile(name: string, type = "application/pdf", size = 100): File {
    return new File([new Uint8Array(size)], name, { type });
}

const PT = { id: "00000000-0000-4000-8000-000000000001", name: "Vana" };

function okResponse(documentId = "doc-1", confidence = 0.92) {
    return new Response(JSON.stringify({
        ok: true,
        document: {
            id: documentId,
            classification: {
                document_type: "product_catalog",
                confidence,
                language: "tr",
                summary: "Test özet",
                suggested_product_type_id: PT.id,
            },
        },
    }), { status: 201, headers: { "Content-Type": "application/json" } });
}

function errResponse(message = "AI down") {
    return new Response(JSON.stringify({ error: message }), {
        status: 500, headers: { "Content-Type": "application/json" },
    });
}

beforeEach(() => {
    vi.restoreAllMocks();
});

afterEach(() => {
    cleanup();
});

describe("ClassifierQueue — happy path (P2 + mountedRef fix)", () => {
    it("single file: renders one card, fetch ONCE, transitions to 'classified' badge", async () => {
        const fetchSpy = vi.fn(async () => okResponse("doc-1"));
        vi.stubGlobal("fetch", fetchSpy);

        render(<ClassifierQueue files={[makeFile("a.pdf")]} suggestedProductTypes={[PT]} />);

        // Classified badge: "Ürün Kataloğu · %92"
        await screen.findByText(/Ürün Kataloğu · %92/, {}, { timeout: 3000 });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
        expect(url).toBe("/api/import/classify");
        expect(init.method).toBe("POST");
    });

    it("Strict Mode double-render: fetch STILL called only once (no duplicate POST)", async () => {
        const fetchSpy = vi.fn(async () => okResponse("doc-2"));
        vi.stubGlobal("fetch", fetchSpy);

        render(
            <StrictMode>
                <ClassifierQueue files={[makeFile("a.pdf")]} suggestedProductTypes={[PT]} />
            </StrictMode>,
        );

        await screen.findByText(/Ürün Kataloğu/, {}, { timeout: 3000 });

        // Strict Mode useEffect'i 2× çağırır (dev); `started` flag duplicate fetch'i engellemeli.
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
});

describe("ClassifierQueue — retry", () => {
    it("first request fails → retry button → second request succeeds", async () => {
        let callCount = 0;
        const fetchSpy = vi.fn(async () => {
            callCount += 1;
            return callCount === 1 ? errResponse("AI down") : okResponse("doc-3", 0.85);
        });
        vi.stubGlobal("fetch", fetchSpy);

        render(<ClassifierQueue files={[makeFile("a.pdf")]} suggestedProductTypes={[PT]} />);

        // Error state'i göster
        await screen.findByText(/AI down/, {}, { timeout: 3000 });

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Yeniden dene/ }));
        });

        await screen.findByText(/Ürün Kataloğu · %85/, {}, { timeout: 3000 });
        expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
});

describe("ClassifierQueue — remove + clear (P3-008 fix)", () => {
    it("× button removes a single card from the queue", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => okResponse("doc-4")));
        render(<ClassifierQueue files={[makeFile("a.pdf"), makeFile("b.pdf")]} suggestedProductTypes={[PT]} />);

        await screen.findByText(/Sınıflandırma kuyruğu \(2\)/, {}, { timeout: 3000 });

        await act(async () => {
            const removeBtns = screen.getAllByRole("button", { name: /Kuyruktan kaldır/ });
            fireEvent.click(removeBtns[0]);
        });

        await waitFor(() => {
            expect(screen.getByText(/Sınıflandırma kuyruğu \(1\)/)).toBeTruthy();
        });
    });

    it("Listeyi Temizle empties INTERNAL queue (P3-008): component unmounts", async () => {
        vi.stubGlobal("fetch", vi.fn(async () => okResponse("doc-5")));
        const onClear = vi.fn();
        render(
            <ClassifierQueue
                files={[makeFile("a.pdf"), makeFile("b.pdf")]}
                suggestedProductTypes={[PT]}
                onClear={onClear}
            />,
        );

        await screen.findByText(/Sınıflandırma kuyruğu \(2\)/, {}, { timeout: 3000 });

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /Listeyi Temizle/ }));
        });

        // internal queue boş → component null render eder; başlık DOM'da kalmaz
        await waitFor(() => {
            expect(screen.queryByText(/Sınıflandırma kuyruğu/)).toBeNull();
        });
        expect(onClear).toHaveBeenCalledTimes(1);
    });
});
