// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UnderlinedFilterTabs from "@/components/ui/UnderlinedFilterTabs";

afterEach(() => {
    cleanup();
});

describe("UnderlinedFilterTabs", () => {
    const items = [
        { key: "all", label: "Tümü", count: 6 },
        { key: "draft", label: "Taslak", count: 2 },
        { key: "sent", label: "Gönderildi", count: 1 },
    ] as const;

    it("renders tablist, counts and selected state", () => {
        render(
            <UnderlinedFilterTabs
                ariaLabel="Teklif durumu filtresi"
                items={items}
                activeKey="all"
                onChange={vi.fn()}
            />,
        );

        const tablist = screen.getByRole("tablist", { name: "Teklif durumu filtresi" });
        expect(tablist).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Tümü (6)" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("tab", { name: "Taslak (2)" }).getAttribute("aria-selected")).toBe("false");
    });

    it("uses the premium underlined active and muted inactive style tokens", () => {
        render(
            <UnderlinedFilterTabs
                ariaLabel="Durum filtresi"
                items={items}
                activeKey="draft"
                onChange={vi.fn()}
            />,
        );

        const active = screen.getByRole("tab", { name: "Taslak (2)" });
        const inactive = screen.getByRole("tab", { name: "Gönderildi (1)" });

        expect(active.style.borderBottom).toBe("2px solid var(--accent)");
        expect(active.style.color).toBe("var(--accent-text)");
        expect(active.style.fontWeight).toBe("600");
        expect(inactive.style.borderBottom).toBe("2px solid transparent");
        expect(inactive.style.color).toBe("var(--text-interactive-muted)");
        expect(inactive.style.fontWeight).toBe("var(--font-ui-weight)");
    });

    it("calls onChange with the clicked key and keeps native keyboard-safe buttons", () => {
        const onChange = vi.fn();
        render(
            <UnderlinedFilterTabs
                ariaLabel="Cari durumu filtresi"
                items={items}
                activeKey="all"
                onChange={onChange}
            />,
        );

        const sent = screen.getByRole("tab", { name: "Gönderildi (1)" });
        expect((sent as HTMLButtonElement).type).toBe("button");
        fireEvent.click(sent);
        expect(onChange).toHaveBeenCalledWith("sent");
    });
});
