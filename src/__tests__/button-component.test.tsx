// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createRef, type ReactNode } from "react";
import Button, { ButtonLink } from "@/components/ui/Button";
import { Plus, RefreshCw } from "lucide-react";

vi.mock("next/link", () => ({
    default: ({ href, children, ...props }: { href: string | { pathname?: string }; children: ReactNode; [key: string]: unknown }) => (
        <a href={typeof href === "string" ? href : href.pathname ?? "#"} {...props}>{children}</a>
    ),
}));

afterEach(() => {
    cleanup();
});

describe("Button premium system", () => {
    it("primary CTA dolu mavi, ikonlu ve temiz label ile render edilir", () => {
        render(
            <Button size="cta" leftIcon={<Plus size={15} />}>
                Yeni Tedarikçi
            </Button>,
        );

        const button = screen.getByRole("button", { name: "Yeni Tedarikçi" });
        expect(button.textContent).toBe("Yeni Tedarikçi");
        expect(button.textContent).not.toContain("+ Yeni");
        expect(button.style.minHeight).toBe("40px");
        expect(button.style.minWidth).toBe("124px");
        expect(button.style.borderRadius).toBe("8px");
        expect(button.style.background).toBe("var(--button-primary-bg)");
    });

    it("modal ve lightbox aksiyonları için ref'i native button'a taşır", () => {
        const ref = createRef<HTMLButtonElement>();
        render(<Button ref={ref}>Kapat</Button>);

        expect(ref.current).toBeInstanceOf(HTMLButtonElement);
        expect(ref.current?.textContent).toBe("Kapat");
    });

    it("toolbar buton hover'da sakin yüzey rengini korur", () => {
        render(
            <Button variant="toolbar" size="md" leftIcon={<RefreshCw size={15} />}>
                Yenile
            </Button>,
        );

        const button = screen.getByRole("button", { name: "Yenile" });
        expect(button.style.background).toBe("transparent");
        fireEvent.mouseEnter(button);
        // Tema-bilir highlight token (koyu: beyaz inset, aydınlık: koyu inset).
        expect(button.style.background).toBe("var(--highlight-inset)");
        fireEvent.mouseLeave(button);
        expect(button.style.background).toBe("transparent");
    });

    it("dangerSoft normal ekrandaki yıkıcı aksiyonları sakin tutar", () => {
        render(<Button variant="dangerSoft">Devre Dışı Bırak</Button>);

        const button = screen.getByRole("button", { name: "Devre Dışı Bırak" });
        expect(button.style.background).toBe("var(--button-danger-soft-bg)");
        expect(button.style.border).toContain("var(--button-danger-soft-border)");
        expect(button.style.color).toBe("var(--button-danger-soft-text)");
    });

    it("danger son onay aksiyonunda güçlü ve beyaz metinli kalır", () => {
        render(<Button variant="danger">Sil</Button>);

        const button = screen.getByRole("button", { name: "Sil" });
        expect(button.style.background).toBe("var(--button-danger-bg)");
        expect(button.style.color).toBe("rgb(255, 255, 255)");
        expect(button.style.fontWeight).toBe("650");
    });

    it("secondary premium yüzey ve klavye focus halkası kullanır", () => {
        render(<Button variant="secondary">Düzenle</Button>);

        const button = screen.getByRole("button", { name: "Düzenle" });
        expect(button.style.background).toBe("var(--button-secondary-bg)");
        expect(button.style.boxShadow).toBe("var(--button-secondary-shadow)");
        fireEvent.focus(button);
        expect(button.style.outline).toBe("2px solid var(--accent-border)");
        fireEvent.blur(button);
        expect(button.style.outline).toBe("none");
    });

    it("form içinde yanlışlıkla submit tetiklememek için default type button'dır", () => {
        render(<Button>Vazgeç</Button>);

        const button = screen.getByRole("button", { name: "Vazgeç" });
        expect((button as HTMLButtonElement).type).toBe("button");
    });

    it("loading durumunda disabled olur ve spinner gösterir", () => {
        const { container } = render(<Button loading>Kaydet</Button>);

        const button = screen.getByRole("button", { name: "Kaydet" });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(container.querySelector(".spinner")).toBeTruthy();
    });

    it("iconOnly buton erişilebilir ad ister ve kare ölçü kullanır", () => {
        render(
            <Button iconOnly aria-label="Yenile" leftIcon={<RefreshCw size={14} />} variant="icon" />,
        );

        const button = screen.getByLabelText("Yenile");
        expect(button.style.width).toBe("32px");
        expect(button.style.minWidth).toBe("32px");
        const iconWrapper = button.querySelector('span[aria-hidden="true"]');
        expect(iconWrapper).toBeTruthy();
        expect(iconWrapper?.getAttribute("aria-hidden")).toBe("true");
    });

    it("ButtonLink disabled ise odak dışı kalır ve navigasyonu engeller", () => {
        const onClick = vi.fn();
        render(
            <ButtonLink href="/dashboard/vendors" disabled onClick={onClick}>
                Tedarikçiler
            </ButtonLink>,
        );

        const link = screen.getByRole("link", { name: "Tedarikçiler" });
        expect(link.getAttribute("aria-disabled")).toBe("true");
        expect(link.getAttribute("tabindex")).toBe("-1");
        fireEvent.click(link);
        expect(onClick).not.toHaveBeenCalled();
    });

    it("ButtonLink dangerSoft varyantını destekler", () => {
        render(
            <ButtonLink href="/dashboard/products" variant="dangerSoft">
                Pasifleştir
            </ButtonLink>,
        );

        const link = screen.getByRole("link", { name: "Pasifleştir" });
        expect(link.style.background).toBe("var(--button-danger-soft-bg)");
        expect(link.style.color).toBe("var(--button-danger-soft-text)");
    });
});
