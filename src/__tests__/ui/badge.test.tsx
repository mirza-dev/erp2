// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Badge from "@/components/ui/Badge";

afterEach(cleanup);

describe("Badge", () => {
    it("içeriği render eder ve default neutral tonu uygular", () => {
        render(<Badge>TRY</Badge>);
        const el = screen.getByText("TRY");
        expect(el.style.background).toBe("var(--bg-tertiary)");
        expect(el.style.color).toBe("var(--text-secondary)");
    });

    it("success tonu doğru token çiftini uygular", () => {
        render(<Badge tone="success">Aktif</Badge>);
        const el = screen.getByText("Aktif");
        expect(el.style.background).toBe("var(--success-bg)");
        expect(el.style.color).toBe("var(--success-text)");
    });

    it("danger/warning/accent tonları ayrı token çiftleri uygular", () => {
        const { rerender } = render(<Badge tone="danger">x</Badge>);
        expect(screen.getByText("x").style.color).toBe("var(--danger-text)");
        rerender(<Badge tone="warning">x</Badge>);
        expect(screen.getByText("x").style.color).toBe("var(--warning-text)");
        rerender(<Badge tone="accent">x</Badge>);
        expect(screen.getByText("x").style.color).toBe("var(--accent-text)");
    });

    it("custom style merge edilir", () => {
        render(<Badge style={{ marginLeft: "4px" }}>y</Badge>);
        expect(screen.getByText("y").style.marginLeft).toBe("4px");
    });
});
