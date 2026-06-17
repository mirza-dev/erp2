// @vitest-environment jsdom
/**
 * A1 paylaşılan liste URL-state altyapısı:
 *  - useListUrlState: navigate(partial) → router.replace(serialized).
 *  - useDebouncedSearch: yazınca duraklamada onCommit (navigate'e bağlı).
 *  - list-query: firstStr / parsePage saf yardımcılar.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useListUrlState, useDebouncedSearch } from "@/hooks/useListUrlState";
import { firstStr, parsePage } from "@/lib/list-query";

const mockReplace = vi.fn();
vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: mockReplace, refresh: vi.fn(), push: vi.fn() }),
    usePathname: () => "/dashboard/test",
}));

afterEach(() => { cleanup(); mockReplace.mockReset(); });

interface P { page: number; search: string }
const serialize = (p: P) => {
    const q = new URLSearchParams();
    if (p.page > 1) q.set("page", String(p.page));
    if (p.search) q.set("search", p.search);
    return q;
};

function Harness({ search = "" }: { search?: string }) {
    const { navigate } = useListUrlState<P>({ page: 1, search }, serialize);
    const { value, setValue } = useDebouncedSearch(search, (v) => navigate({ search: v, page: 1 }));
    return (
        <>
            <button onClick={() => navigate({ page: 2 })}>go</button>
            <input aria-label="s" value={value} onChange={(e) => setValue(e.target.value)} />
        </>
    );
}

describe("useListUrlState", () => {
    it("navigate(partial) → router.replace(serialized qs)", () => {
        render(<Harness />);
        fireEvent.click(screen.getByText("go"));
        expect(mockReplace).toHaveBeenCalledWith("/dashboard/test?page=2", { scroll: false });
    });

    it("boş param → bare path (querystring yok)", () => {
        render(<Harness search="x" />);
        // search'i temizleyen bir navigate: input'u boşalt → debounce commit
        fireEvent.change(screen.getByLabelText("s"), { target: { value: "" } });
        return waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/dashboard/test", { scroll: false }));
    });
});

describe("useDebouncedSearch", () => {
    it("yazınca duraklamada commit eder (navigate→replace)", async () => {
        render(<Harness />);
        fireEvent.change(screen.getByLabelText("s"), { target: { value: "acme" } });
        await waitFor(() =>
            expect(mockReplace).toHaveBeenCalledWith("/dashboard/test?search=acme", { scroll: false }),
        );
    });
});

describe("list-query", () => {
    it("firstStr: string / dizi[0] / undefined→''", () => {
        expect(firstStr("a")).toBe("a");
        expect(firstStr(["a", "b"])).toBe("a");
        expect(firstStr(undefined)).toBe("");
    });
    it("parsePage: geçersiz/eksik → 1, negatif → 1", () => {
        expect(parsePage(undefined)).toBe(1);
        expect(parsePage("3")).toBe(3);
        expect(parsePage("0")).toBe(1);
        expect(parsePage("-5")).toBe(1);
        expect(parsePage("abc")).toBe(1);
    });
});
