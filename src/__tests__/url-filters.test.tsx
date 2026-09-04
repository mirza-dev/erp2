// @vitest-environment jsdom
/**
 * A4 — Developer Console filtrelerini taşıyan `useUrlFilters` sözleşmesi.
 *
 * Kilitlenen davranış tek cümle: **parametre YOKSA varsayılan, VARSA (boş
 * olsa bile) o değer.** Bu ayrım olmadan varsayılanı boş-olmayan bir filtre
 * (Hatalar → `status=open`) hiçbir zaman "hepsi"ne çekilemezdi.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { useUrlFilters } from "@/hooks/useUrlFilters";

const mockReplace = vi.fn();
let currentSearch = "";

vi.mock("next/navigation", () => ({
    useRouter: () => ({ replace: mockReplace, push: vi.fn(), refresh: vi.fn() }),
    usePathname: () => "/dashboard/developer/errors",
    useSearchParams: () => new URLSearchParams(currentSearch),
}));

afterEach(() => { cleanup(); mockReplace.mockReset(); currentSearch = ""; });

const DEFAULTS = { range: "24h", status: "open", search: "" };

function Harness({ onValues }: { onValues?: (v: Record<string, string>) => void }) {
    const { values, set } = useUrlFilters(DEFAULTS);
    onValues?.(values);
    return (
        <>
            <span data-testid="range">{values.range}</span>
            <span data-testid="status">{`[${values.status}]`}</span>
            <span data-testid="search">{`[${values.search}]`}</span>
            <button onClick={() => set({ range: "7d" })}>range7d</button>
            <button onClick={() => set({ status: "" })}>statusAll</button>
            <button onClick={() => set({ status: "open" })}>statusOpen</button>
            <button onClick={() => set({ search: "timeout" })}>searchTimeout</button>
        </>
    );
}

describe("useUrlFilters", () => {
    it("parametre yokken varsayılanı verir", () => {
        render(<Harness />);
        expect(screen.getByTestId("range").textContent).toBe("24h");
        expect(screen.getByTestId("status").textContent).toBe("[open]");
    });

    it("varsayılana eşit değer URL'e yazılmaz — link kısa kalır", () => {
        render(<Harness />);
        fireEvent.click(screen.getByText("statusOpen"));
        expect(mockReplace).toHaveBeenCalledWith("/dashboard/developer/errors", { scroll: false });
    });

    it("varsayılandan farklı değer URL'e yazılır", () => {
        render(<Harness />);
        fireEvent.click(screen.getByText("range7d"));
        expect(mockReplace).toHaveBeenCalledWith("/dashboard/developer/errors?range=7d", { scroll: false });
    });

    it("BOŞ değer, YOKLUKTAN farklıdır: varsayılanı open olan filtre boşa çekilebilir", () => {
        render(<Harness />);
        fireEvent.click(screen.getByText("statusAll"));
        // `status=` yazılır — parametre VAR ama boş. Yazılmasaydı okuma
        // varsayılana (`open`) düşer, "Tüm durumlar" hiç seçilemezdi.
        expect(mockReplace).toHaveBeenCalledWith("/dashboard/developer/errors?status=", { scroll: false });
    });

    it("URL'deki boş değer varsayılanı EZER (yokluk değil)", () => {
        currentSearch = "status=";
        render(<Harness />);
        expect(screen.getByTestId("status").textContent).toBe("[]");
    });

    it("URL'deki değerler okunur ve kısmi güncellemede korunur", () => {
        currentSearch = "range=7d";
        render(<Harness />);
        expect(screen.getByTestId("range").textContent).toBe("7d");
        fireEvent.click(screen.getByText("searchTimeout"));
        expect(mockReplace).toHaveBeenCalledWith(
            "/dashboard/developer/errors?range=7d&search=timeout", { scroll: false },
        );
    });

    it("tanınmayan parametreler taşınmaz — yalnız bildirilen filtreler yazılır", () => {
        currentSearch = "range=7d&hedefsiz=1";
        render(<Harness />);
        fireEvent.click(screen.getByText("searchTimeout"));
        expect(mockReplace).toHaveBeenCalledWith(
            "/dashboard/developer/errors?range=7d&search=timeout", { scroll: false },
        );
    });
});
