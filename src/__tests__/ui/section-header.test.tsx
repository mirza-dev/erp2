// @vitest-environment jsdom
/**
 * Ortak `ui/SectionHeader` davranış testleri.
 *
 * Varlık sebebi ölçülmüş: 44 bölüm etiketi `<div>` olarak yazılmıştı — başlık
 * gibi görünüp başlık olmayan yüzeyler. `orders/[id]` ve `quotes/[id]`
 * sayfalarının h1/h2/h3 sayısı SIFIRDI.
 *
 * Bu yüzden burada kilitlenen KAYNAK METNİ değil GERÇEK RENDER: bir yüzeyin
 * başlık gibi GÖRÜNMESİ, başlık OLDUĞU anlamına gelmez.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import SectionHeader from "@/components/ui/SectionHeader";

beforeEach(() => cleanup());

describe("SectionHeader — başlık SEMANTİĞİ", () => {
    it("her varyant GERÇEK başlık elemanı basar", () => {
        for (const variant of ["label", "title", "dialog"] as const) {
            cleanup();
            render(<SectionHeader variant={variant}>Genel Bilgiler</SectionHeader>);
            // Turun tamamının sebebi bu satır: `<div>` DEĞİL.
            expect(screen.getByRole("heading", { name: "Genel Bilgiler" }).tagName).toBe("H2");
        }
    });

    it("level=3 kart İÇİ alt grup için h3 verir", () => {
        render(<SectionHeader level={3}>Teknik Özellikler</SectionHeader>);
        expect(screen.getByRole("heading", { level: 3 }).tagName).toBe("H3");
    });

    it("id basılır — `aria-labelledby` hedefi olabilsin", () => {
        render(<SectionHeader variant="dialog" id="vendor-form-title">Yeni Tedarikçi</SectionHeader>);
        expect(screen.getByRole("heading").id).toBe("vendor-form-title");
    });
});

describe("SectionHeader — üç rol, üç ölçek", () => {
    it("label: 11px BÜYÜK HARF tertiary — yoğun panel dili", () => {
        render(<SectionHeader>Ticari Süreç</SectionHeader>);
        const h = screen.getByRole("heading");
        expect(h.style.fontSize).toBe("11px");
        expect(h.style.textTransform).toBe("uppercase");
        expect(h.style.color).toBe("var(--text-tertiary)");
        expect(h.style.letterSpacing).toBe("0.04em");
    });

    it("title: 13px cümle düzeni primary — kartın KENDİ adı", () => {
        render(<SectionHeader variant="title">Servis Durumu</SectionHeader>);
        const h = screen.getByRole("heading");
        expect(h.style.fontSize).toBe("13px");
        expect(h.style.textTransform).toBe("");
        expect(h.style.color).toBe("var(--text-primary)");
    });

    it("dialog: 16px — diyalog/çekmece adı", () => {
        render(<SectionHeader variant="dialog">Siparişi İptal Et</SectionHeader>);
        expect(screen.getByRole("heading").style.fontSize).toBe("16px");
    });

    it("ağırlıklar SAYI değil TOKEN — tema ayarlanınca birlikte hareket eder", () => {
        cleanup();
        render(<SectionHeader>etiket</SectionHeader>);
        expect(screen.getByRole("heading").style.fontWeight).toBe("var(--font-label-weight)");
        cleanup();
        render(<SectionHeader variant="title">başlık</SectionHeader>);
        expect(screen.getByRole("heading").style.fontWeight).toBe("var(--font-heading-weight)");
    });
});

describe("SectionHeader — yuvalar", () => {
    it("yuva yokken TEK eleman basar — sarmalayıcı eklenmez", () => {
        // Blast radius kontrolü: 85 çağrı yerinin çoğu yalın. Fazladan bir
        // sarmalayıcı ızgara/flex çocuğu olan başlıkların yerleşimini kaydırırdı.
        const { container } = render(<SectionHeader>Notlar</SectionHeader>);
        expect(container.children.length).toBe(1);
        expect(container.firstElementChild?.tagName).toBe("H2");
    });

    it("action sağa yaslanır ve başlık ROLÜNÜ kaybetmez", () => {
        render(
            <SectionHeader variant="title" action={<button>Tümü →</button>}>
                Son Olaylar
            </SectionHeader>,
        );
        expect(screen.getByRole("heading", { name: "Son Olaylar" })).toBeTruthy();
        expect(screen.getByRole("button", { name: "Tümü →" })).toBeTruthy();
    });

    it("description başlığın DIŞINDA — erişilebilir ada karışmaz", () => {
        render(
            <SectionHeader variant="title" description="Son 7 günün dökümü">
                Modül kullanımı
            </SectionHeader>,
        );
        // Açıklama başlık metnine sızarsa ekran okuyucu iki cümleyi tek ad okur.
        expect(screen.getByRole("heading").textContent).toBe("Modül kullanımı");
        expect(screen.getByText("Son 7 günün dökümü").tagName).toBe("P");
    });

    it("description BÜYÜK HARF mirası ALMAZ", () => {
        // Sarmalayıcı tipografiyi devralsaydı açıklama satırı sessizce
        // BÜYÜK HARF olurdu — `label` varyantında bu görünür bir kusur olurdu.
        render(<SectionHeader description="küçük harf kalmalı">Stok Yönetimi</SectionHeader>);
        const p = screen.getByText("küçük harf kalmalı");
        expect(p.style.textTransform).toBe("");
        expect(p.style.fontSize).toBe("12px");
    });

    it("rule ayracı SARMALAYICIDA — action varsa satırın tamamını kaplar", () => {
        const { container } = render(
            <SectionHeader rule action={<span>3</span>}>Aktif Teklifler</SectionHeader>,
        );
        const wrap = container.firstElementChild as HTMLElement;
        expect(wrap.tagName).toBe("DIV");
        expect(wrap.style.borderBottom).toContain("var(--border-tertiary)");
        expect(wrap.style.paddingBottom).toBe("6px");
    });

    it("icon başlığın İÇİNDE kalır — ayrı bir düğüme taşınmaz", () => {
        render(
            <SectionHeader variant="title" icon={<i data-testid="ikon" />}>Aktif Suppression</SectionHeader>,
        );
        expect(screen.getByRole("heading").querySelector("[data-testid='ikon']")).toBeTruthy();
    });
});

describe("SectionHeader — style kaçış kapısı", () => {
    it("yuva yokken başlığın KENDİSİNE iner", () => {
        render(<SectionHeader style={{ marginTop: "20px" }}>Karar</SectionHeader>);
        expect(screen.getByRole("heading").style.marginTop).toBe("20px");
    });

    it("yuva varken SARMALAYICIYA iner — ikisi de en DIŞ eleman", () => {
        const { container } = render(
            <SectionHeader style={{ marginTop: "20px" }} action={<span>x</span>}>Karar</SectionHeader>,
        );
        expect((container.firstElementChild as HTMLElement).style.marginTop).toBe("20px");
        // Başlık sıfırlanır (`margin: 0`) — boşluk sarmalayıcının işi.
        expect(screen.getByRole("heading").style.marginTop).toBe("0px");
    });
});
