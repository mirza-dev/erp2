// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import FilterChips from "@/components/ui/FilterChips";

afterEach(() => {
    cleanup();
});

/**
 * 2026-08-31: `UnderlinedFilterTabs` yerine geçti. Alt çizgili sekmelerin
 * DOLGUSU yoktu; kullanıcı "kategoriler beyaz olsun, mavi olması gerekenler
 * mavi olsun" dedi. Bu bileşen kendi rengini yazmaz — `Button`'ın
 * `secondary`/`primary` varyantlarını sürer, yani butonlarla TEK palet.
 */
describe("FilterChips", () => {
    const items = [
        { key: "all", label: "Tümü", count: 6 },
        { key: "draft", label: "Taslak", count: 2 },
        { key: "sent", label: "Gönderildi", count: 1 },
    ] as const;

    it("tablist, sayaç ve seçili durumu render eder", () => {
        render(
            <FilterChips
                ariaLabel="Teklif durumu filtresi"
                items={items}
                activeKey="all"
                onChange={vi.fn()}
            />,
        );

        expect(screen.getByRole("tablist", { name: "Teklif durumu filtresi" })).toBeTruthy();
        expect(screen.getByRole("tab", { name: "Tümü (6)" }).getAttribute("aria-selected")).toBe("true");
        expect(screen.getByRole("tab", { name: "Taslak (2)" }).getAttribute("aria-selected")).toBe("false");
    });

    it("pasif çip BEYAZ, aktif çip MAVİ — ikisi de Button varyantından", () => {
        render(
            <FilterChips
                ariaLabel="Durum filtresi"
                items={items}
                activeKey="draft"
                onChange={vi.fn()}
            />,
        );

        const active = screen.getByRole("tab", { name: "Taslak (2)" });
        const inactive = screen.getByRole("tab", { name: "Gönderildi (1)" });

        // primary = mavi gradyan + beyaz metin (login'deki "Giriş Yap")
        expect(active.style.background).toContain("--button-primary-bg");
        expect(active.style.color).toBe("rgb(255, 255, 255)");
        // secondary = beyaz gradyan + koyu metin (login'deki "Google ile devam et")
        expect(inactive.style.background).toContain("--button-secondary-bg");
        expect(inactive.style.color).toBe("var(--text-primary)");
        // Pasif çipin ARTIK dolgusu var — eski hap çiplerinde `transparent`'tı.
        expect(inactive.style.background).not.toBe("transparent");
    });

    it("sayaç verilmezse rozet basılmaz — veri gelmeden sayı iddia edilmez", () => {
        render(
            <FilterChips
                ariaLabel="Sinyal filtresi"
                items={[{ key: "riskli", label: "Riskli", count: null }] as const}
                activeKey="riskli"
                onChange={vi.fn()}
            />,
        );
        expect(screen.getByRole("tab", { name: "Riskli" }).textContent).toBe("Riskli");
    });

    it("tıklanan anahtarla onChange çağırır ve native buton kalır", () => {
        const onChange = vi.fn();
        render(
            <FilterChips
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

    it("dokunma hedefi Button'dan geliyor (elle çiplerde yoktu)", () => {
        render(
            <FilterChips ariaLabel="Filtre" items={items} activeKey="all" onChange={vi.fn()} />,
        );
        expect(screen.getByRole("tab", { name: "Tümü (6)" }).className).toContain("tap-44");
    });
});
