// @vitest-environment jsdom
/**
 * Ortak gezinme rayı (`ui/NavLink`) davranış testleri.
 *
 * Varlık sebebi ölçülmüş bir eksiklik: 2026-09-05'e kadar Sidebar'ın 16-18
 * bağlantısında aktif durum ekran okuyucuya HİÇ bildirilmiyordu. Altı işaret
 * (zemin · metin rengi · kenarlık · kalınlık · 2px şerit · ikon opaklığı)
 * vardı ve altısı da yalnız görseldi. `aria-current` yalnız Ayarlar ve
 * Developer yüzeylerinde vardı.
 *
 * Bu yüzden burada kilitlenen KAYNAK METNİ değil GERÇEK RENDER — Drawer
 * turunun dersi: bir yüzeyin niteliği "ilan etmesi" onu gerçekten bastığı
 * anlamına gelmez.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NavLink, NavButton, isActiveHref } from "@/components/ui/NavLink";

beforeEach(() => cleanup());

describe("isActiveHref", () => {
    it("exact=true YALNIZ kendi rotasında aktif", () => {
        // `/dashboard` ve `/dashboard/settings` bunu kullanır: olmasaydı her alt
        // sayfa iki öğeyi birden yakardı.
        expect(isActiveHref("/dashboard", "/dashboard", true)).toBe(true);
        expect(isActiveHref("/dashboard/orders", "/dashboard", true)).toBe(false);
    });

    it("exact yokken alt rotalar da aktif eder", () => {
        expect(isActiveHref("/dashboard/orders", "/dashboard/orders")).toBe(true);
        expect(isActiveHref("/dashboard/orders/42", "/dashboard/orders")).toBe(true);
    });

    it("önek benzerliği aktif ETMEZ — sınır `/` ile çizilir", () => {
        // `/dashboard/products` ile `/dashboard/products-aging` karışmasın.
        expect(isActiveHref("/dashboard/orders-archive", "/dashboard/orders")).toBe(false);
    });
});

describe("NavLink — bağlantı yüzeyi (Sidebar)", () => {
    it("aktifken aria-current=page basar", () => {
        render(<NavLink href="/dashboard" active>Dashboard</NavLink>);
        expect(screen.getByRole("link").getAttribute("aria-current")).toBe("page");
    });

    it("pasifken aria-current HİÇ basılmaz (false değil, yok)", () => {
        render(<NavLink href="/dashboard" active={false}>Dashboard</NavLink>);
        expect(screen.getByRole("link").getAttribute("aria-current")).toBeNull();
    });

    it("link ROLÜ korunur — `dashboard.spec.ts` üç öğeyi getByRole(\"link\") ile arıyor", () => {
        render(<NavLink href="/dashboard/orders" active={false}>Satış Siparişleri</NavLink>);
        expect(screen.getByRole("link", { name: "Satış Siparişleri" })).toBeTruthy();
    });

    it("aktiflik `is-active` sınıfıyla taşınır — görünüm CSS'ten gelir, JS'ten değil", () => {
        // Turun asıl kazancı: Sidebar hover'ı `onMouseEnter` içinde SIX satır
        // `e.currentTarget.style.…` ataması yapıyordu.
        const { rerender } = render(<NavLink href="/x" active={false}>X</NavLink>);
        expect(screen.getByRole("link").className).toBe("nav-rail-item");
        rerender(<NavLink href="/x" active>X</NavLink>);
        expect(screen.getByRole("link").className).toBe("nav-rail-item is-active");
    });

    it("onClick çalışır (mobil çekmeceyi kapatan kanca)", () => {
        const onClick = vi.fn();
        render(<NavLink href="/x" active={false} onClick={onClick}>X</NavLink>);
        fireEvent.click(screen.getByRole("link"));
        expect(onClick).toHaveBeenCalledTimes(1);
    });

    it("sondaki yuva DEĞİŞKEN genişlikte olabilir (sayaç rozeti)", () => {
        // Ayarlar'ın eski ızgarası sondaki kolonu 8px'e sabitliyordu; Sidebar'ın
        // rozeti değişken genişlikte. Ray bu yüzden flex.
        render(
            <NavLink href="/x" active={false} trailing={<span data-testid="rozet">128</span>}>
                Uyarılar
            </NavLink>,
        );
        expect(screen.getByTestId("rozet").textContent).toBe("128");
    });

    it("etiket kendi `<span>`inde — kısaltma ikona ve rozete uygulanmaz", () => {
        const { container } = render(
            <NavLink href="/x" active={false} icon={<i data-testid="ikon" />}>Uzun Etiket</NavLink>,
        );
        const label = container.querySelector(".nav-rail-label");
        expect(label?.textContent).toBe("Uzun Etiket");
        expect(label?.querySelector("[data-testid='ikon']")).toBeNull();
    });
});

describe("NavButton — buton yüzeyi (Ayarlar şeridi)", () => {
    it("aynı ray sınıfını ve aria-current'ı paylaşır", () => {
        render(<NavButton active onClick={() => {}}>Firma</NavButton>);
        const btn = screen.getByRole("button");
        expect(btn.className).toBe("nav-rail-item is-active");
        expect(btn.getAttribute("aria-current")).toBe("page");
    });

    it("type=button — form içinde gönderim tetiklemez", () => {
        render(<NavButton active={false} onClick={() => {}}>Firma</NavButton>);
        expect(screen.getByRole("button").getAttribute("type")).toBe("button");
    });

    it("ariaLabel görünen etiketi EZER (kaydedilmemiş değişiklik durumu)", () => {
        render(
            <NavButton active={false} onClick={() => {}} ariaLabel="Firma (kaydedilmemiş değişiklikler)">
                Firma
            </NavButton>,
        );
        expect(screen.getByRole("button", { name: "Firma (kaydedilmemiş değişiklikler)" })).toBeTruthy();
    });

    it("ref iletilir — Ayarlar aktif sekmeyi görünüre kaydırmak için kullanıyor", () => {
        let node: HTMLButtonElement | null = null;
        render(<NavButton active onClick={() => {}} ref={n => { node = n; }}>Firma</NavButton>);
        expect(node).toBe(screen.getByRole("button"));
    });

    it("yüzeye özgü ek sınıf ray sınıfını EZMEZ, ona EKLENİR", () => {
        render(<NavButton active={false} onClick={() => {}} className="ozel">Firma</NavButton>);
        expect(screen.getByRole("button").className).toBe("nav-rail-item ozel");
    });
});
