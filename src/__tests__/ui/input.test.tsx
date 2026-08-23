// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import Input, { Select, Textarea } from "@/components/ui/Input";

afterEach(cleanup);

describe("Input", () => {
    it("taban stili input'a uygular (default boyut md)", () => {
        const { container } = render(<Input defaultValue="x" />);
        const el = container.querySelector("input") as HTMLInputElement;
        expect(el.style.padding).toBe("6px 10px");
        expect(el.style.fontSize).toBe("13px");
        expect(el.style.width).toBe("100%");
        expect(el.style.boxSizing).toBe("border-box");
    });

    it("input'a özel tema token'larını kullanır (drift kilidi)", () => {
        // Aydınlık temada --input-bg/--input-border, --bg-tertiary/--border-secondary'den
        // FARKLI. 18 yerel inputStyle sabitinin çoğu yanlış token'daydı; burada kilitlenir.
        const { container } = render(<Input />);
        const el = container.querySelector("input") as HTMLInputElement;
        expect(el.style.background).toBe("var(--input-bg)");
        expect(el.style.border).toBe("var(--line-width) solid var(--input-border)");
        expect(el.style.borderRadius).toBe("var(--radius-md)");
        // REGRESSION: eski/yanlış token ve hardcode kalınlık geri gelmemeli
        expect(el.style.background).not.toContain("bg-tertiary");
        expect(el.style.border).not.toContain("border-secondary");
        expect(el.style.border).not.toContain("0.5px");
    });

    it("inputSize padding eksenini değiştirir", () => {
        const { container } = render(
            <>
                <Input data-testid="s" inputSize="sm" />
                <Input data-testid="l" inputSize="lg" />
            </>,
        );
        const [sm, lg] = Array.from(container.querySelectorAll("input"));
        expect(sm.style.padding).toBe("5px 8px");
        expect(lg.style.padding).toBe("8px 10px");
    });

    it("style prop'u taban stili override eder (son merge)", () => {
        const { container } = render(<Input style={{ padding: "0px", width: "120px" }} />);
        const el = container.querySelector("input") as HTMLInputElement;
        expect(el.style.padding).toBe("0px");
        expect(el.style.width).toBe("120px");
        // Override edilmeyen taban alanlar korunur
        expect(el.style.background).toBe("var(--input-bg)");
    });

    it("native input attribute'ları ve olayları geçer", () => {
        const onChange = vi.fn();
        const { container } = render(
            <Input type="number" placeholder="Adet" aria-label="Adet" disabled={false} onChange={onChange} />,
        );
        const el = container.querySelector("input") as HTMLInputElement;
        expect(el.type).toBe("number");
        expect(el.placeholder).toBe("Adet");
        expect(el.getAttribute("aria-label")).toBe("Adet");
        fireEvent.change(el, { target: { value: "5" } });
        expect(onChange).toHaveBeenCalled();
    });

    it("ref input elementine ulaşır (React 19 ref-as-prop)", () => {
        let node: HTMLInputElement | null = null;
        render(<Input ref={el => { node = el; }} />);
        expect(node).not.toBeNull();
        expect((node as unknown as HTMLInputElement).tagName).toBe("INPUT");
    });
});

describe("Textarea / Select", () => {
    it("Textarea aynı taban stili textarea elementine uygular", () => {
        const { container } = render(<Textarea rows={3} />);
        const el = container.querySelector("textarea") as HTMLTextAreaElement;
        expect(el.rows).toBe(3);
        expect(el.style.background).toBe("var(--input-bg)");
        expect(el.style.padding).toBe("6px 10px");
        // Bilinçli olarak dahil edilmeyen opinion'lar taban stilde YOK
        expect(el.style.resize).toBe("");
        expect(el.style.fontWeight).toBe("");
    });

    it("Select aynı taban stili select elementine uygular", () => {
        const { container } = render(
            <Select defaultValue="a"><option value="a">A</option></Select>,
        );
        const el = container.querySelector("select") as HTMLSelectElement;
        expect(el.value).toBe("a");
        expect(el.style.border).toBe("var(--line-width) solid var(--input-border)");
        expect(el.style.cursor).toBe("");
    });

    it("Textarea ve Select de inputSize kabul eder", () => {
        const { container } = render(
            <>
                <Textarea inputSize="sm" />
                <Select inputSize="lg"><option>A</option></Select>
            </>,
        );
        expect((container.querySelector("textarea") as HTMLTextAreaElement).style.padding).toBe("5px 8px");
        expect((container.querySelector("select") as HTMLSelectElement).style.padding).toBe("8px 10px");
    });
});
