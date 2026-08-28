// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import PageHeader from "@/components/ui/PageHeader";

afterEach(cleanup);

/**
 * PageHeader (2026-08-24) — 9 liste sayfasının üst şeridi elle yazılmıştı ve
 * İKİ AYRI kalıba ayrılmıştı: 20px `<h1>` (orders/vendors/PO/rfqs/suggested) ve
 * 14px `<div>` (quotes/customers/products/production). Yani dört sayfanın
 * başlığı diğerlerinin ALT BAŞLIĞI kadardı ve o sayfalarda hiç `<h1>` yoktu.
 *
 * Bu dosya, sayfa bazlı `<h1>` kaynak-kilitlerinin yerini alır: garanti artık
 * tek tek sayfalarda değil component'te — dolayısıyla component'i kullanan HER
 * sayfa için geçerli.
 */
describe("PageHeader", () => {
    it("başlığı HER ZAMAN <h1> olarak basar (başlık hiyerarşisi)", () => {
        render(<PageHeader title="Teklifler" />);
        const h1 = screen.getByRole("heading", { level: 1 });
        expect(h1.textContent).toBe("Teklifler");
    });

    it("başlık tek boyutta — 20px/600 (14px varyantı geri gelmesin)", () => {
        render(<PageHeader title="Cariler" />);
        const h1 = screen.getByRole("heading", { level: 1 }) as HTMLElement;
        expect(h1.style.fontSize).toBe("20px");
        expect(h1.style.fontWeight).toBe("600");
    });

    it("subtitle verilince gösterilir, verilmezse DOM'a hiç girmez", () => {
        const { container, rerender } = render(
            <PageHeader title="Teklifler" subtitle="16 teklif · 6 taslak" />,
        );
        expect(screen.getByText("16 teklif · 6 taslak")).toBeTruthy();
        rerender(<PageHeader title="Teklifler" />);
        expect(container.querySelector("p")).toBeNull();
    });

    it("boş subtitle boş <p> bırakmaz", () => {
        const { container } = render(<PageHeader title="X" subtitle="" />);
        expect(container.querySelector("p")).toBeNull();
    });

    it("subtitle zengin içerik alabilir (products'ın koşullu sayaçları)", () => {
        render(
            <PageHeader
                title="Stok & Ürünler"
                subtitle={<>20 ürün<span> · 3 kritik</span></>}
            />,
        );
        expect(screen.getByText(/20 ürün/)).toBeTruthy();
        expect(screen.getByText("· 3 kritik")).toBeTruthy();
    });
});

describe("Yenile butonu", () => {
    it("onRefresh yoksa buton HİÇ render edilmez", () => {
        render(<PageHeader title="Teklifler" />);
        expect(screen.queryByRole("button")).toBeNull();
    });

    it("onRefresh verilince tıklanınca çağrılır", () => {
        const onRefresh = vi.fn();
        render(<PageHeader title="Teklifler" onRefresh={onRefresh} />);
        fireEvent.click(screen.getByRole("button"));
        expect(onRefresh).toHaveBeenCalledOnce();
    });

    it("refreshing iken kilitlenir ve etiket değişir", () => {
        render(<PageHeader title="Teklifler" onRefresh={() => {}} refreshing />);
        const btn = screen.getByRole("button") as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.textContent).toContain("Yenileniyor");
    });

    it("erişilebilir ad prop'tan gelir (sayfaya özel metin korunur)", () => {
        render(
            <PageHeader title="Teklifler" onRefresh={() => {}} refreshAriaLabel="Teklifleri yenile" />,
        );
        expect(screen.getByRole("button", { name: "Teklifleri yenile" })).toBeTruthy();
    });

    it("aria-label verilmezse başlıktan türetilir (adsız buton kalmaz)", () => {
        render(<PageHeader title="Cariler" onRefresh={() => {}} />);
        expect(screen.getByRole("button", { name: /Cariler/ })).toBeTruthy();
    });
});

describe("actions alanı", () => {
    it("verilen içerik sağda render edilir", () => {
        render(<PageHeader title="Teklifler" actions={<button>Yeni Teklif</button>} />);
        expect(screen.getByText("Yeni Teklif")).toBeTruthy();
    });

    it("actions null olabilir (yetkisiz kullanıcı) — kap boş kalmaz", () => {
        const { container } = render(<PageHeader title="Teklifler" actions={null} />);
        // onRefresh de yoksa sağ kap hiç oluşturulmaz.
        expect(container.querySelectorAll("div").length).toBeLessThanOrEqual(2);
    });

    it("Yenile ve actions birlikte çalışır", () => {
        render(
            <PageHeader title="Teklifler" onRefresh={() => {}} actions={<button>Yeni</button>} />,
        );
        expect(screen.getAllByRole("button")).toHaveLength(2);
    });
});
