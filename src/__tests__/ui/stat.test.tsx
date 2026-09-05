// @vitest-environment jsdom
/**
 * Ortak `ui/Stat` davranış testleri.
 *
 * Varlık sebebi ölçülmüş: 26 elle yazılmış blok + 7 dosya-yerel bileşen,
 * **20 farklı değer tipografisi** ve 9 yüzey reçetesi. Beş yüzey kutu zemini
 * olarak `--bg-secondary` kullanıyordu — `gate/surface-consistency`in kendi
 * "kuralın DAYANAĞI" testinin kanıtladığı gibi iki temada da sayfa zeminiyle
 * BİREBİR aynı renk: görünmez kutu.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Stat, { StatGrid } from "@/components/ui/Stat";

beforeEach(() => cleanup());

const valueOf = (t: string) => screen.getByText(t) as HTMLElement;

describe("Stat — değer ve etiket", () => {
    it("etiket ve değeri birlikte basar", () => {
        render(<Stat label="Toplam SKU" value={42} />);
        expect(screen.getByText("Toplam SKU")).toBeTruthy();
        expect(screen.getByText("42")).toBeTruthy();
    });

    it("kanonik değer ölçeği: 21px + heading token + tabular-nums", () => {
        // Izgarada alt alta duran sayılar hizalanmalı; ölçümde yüzeylerin
        // ÇOĞUNDA `tabular-nums` yoktu.
        render(<Stat label="x" value={1234} />);
        const v = valueOf("1234");
        expect(v.style.fontSize).toBe("21px");
        expect(v.style.fontWeight).toBe("var(--font-heading-weight)");
        expect(v.style.fontVariantNumeric).toBe("tabular-nums");
    });

    it("etiket BÜYÜK HARF DEĞİL — kanonik etiket kuralıyla aynı", () => {
        // 26 yüzeyin yalnız 6'sı uppercase kullanıyordu ve `form-consistency`
        // kanonik etiketin `textTransform` taşımamasını kasten kilitliyor.
        render(<Stat label="Bağlanan Sermaye" value="—" />);
        expect(screen.getByText("Bağlanan Sermaye").style.textTransform).toBe("");
    });
});

describe("Stat — ölçülmemiş değer", () => {
    it("null → varsayılan tire, KÜÇÜK ve italik", () => {
        // 21px'lik boş bir kutu yerine "değer yok" olduğunu söyleyen bir işaret.
        render(<Stat label="Ort. Bekleme" value={null} />);
        const v = valueOf("—");
        expect(v.style.fontSize).toBe("13px");
        expect(v.style.fontStyle).toBe("italic");
    });

    it("emptyText ezilebilir — konsol 'Ölçülmüyor' diyor", () => {
        render(<Stat label="p95" value={null} emptyText="Ölçülmüyor" />);
        expect(screen.getByText("Ölçülmüyor")).toBeTruthy();
    });

    it("SIFIR ölçülmüş bir değerdir — boş sayılmaz", () => {
        // `value !== null` yerine falsy kontrolü yapılsaydı 0 stok "—" olurdu.
        render(<Stat label="Hurda" value={0} />);
        const v = valueOf("0");
        expect(v.style.fontSize).toBe("21px");
        expect(v.style.fontStyle).not.toBe("italic");
    });
});

describe("Stat — ton", () => {
    it("tone YALNIZ değeri renklendirir, etiketi değil", () => {
        render(<Stat label="Kritik" value={7} tone="danger" />);
        expect(valueOf("7").style.color).toBe("var(--danger-text)");
        expect(screen.getByText("Kritik").style.color).toBe("var(--text-tertiary)");
    });

    it("tone yokken değer primary", () => {
        render(<Stat label="x" value={3} />);
        expect(valueOf("3").style.color).toBe("var(--text-primary)");
    });

    it("subTone alt satırı ayrı renklendirir", () => {
        render(<Stat label="x" value={1} sub="fire %12" subTone="warning" />);
        expect(screen.getByText("fire %12").style.color).toBe("var(--warning-text)");
    });

    it("ton haritası Badge ile ORTAK — dört kopyanın tekilleşmesi", () => {
        cleanup();
        render(<Stat label="a" value={1} tone="success" />);
        expect(valueOf("1").style.color).toBe("var(--success-text)");
        cleanup();
        render(<Stat label="b" value={2} tone="accent" />);
        expect(valueOf("2").style.color).toBe("var(--accent-text)");
    });
});

describe("Stat — yuvalar ve yüzey", () => {
    it("yüzey Card'dan gelir — üçlü ikinci kez yazılmaz", () => {
        const { container } = render(<Stat label="x" value={1} />);
        const box = container.firstElementChild as HTMLElement;
        expect(box.style.background).toBe("var(--surface-raised)");
        expect(box.style.border).toContain("var(--surface-border)");
        expect(box.style.boxShadow).toBe("var(--surface-shadow-sm)");
    });

    it("surfaceStyle yalnız YÜZEYİ ezer; tipografi çerçevede kalır", () => {
        render(
            <Stat label="Kritik" value={9} tone="danger"
                surfaceStyle={{ border: "1px solid var(--danger-border)" }} />,
        );
        expect(valueOf("9").style.fontSize).toBe("21px");
        expect(screen.getByText("Kritik")).toBeTruthy();
    });

    it("action etiket satırının sağ ucuna gider", () => {
        render(<Stat label="Faturalar" value={12} action={<button>Sync Et</button>} />);
        expect(screen.getByRole("button", { name: "Sync Et" })).toBeTruthy();
        expect(screen.getByText("Faturalar")).toBeTruthy();
    });

    it("icon etiketin yanında kalır", () => {
        render(<Stat label="Sorunlu" value={2} icon={<i data-testid="ikon" />} />);
        expect(screen.getByTestId("ikon")).toBeTruthy();
    });

    it("sub verilmezse alt satır BASILMAZ", () => {
        const { container } = render(<Stat label="x" value={1} />);
        expect((container.firstElementChild as HTMLElement).children.length).toBe(2);
    });
});

describe("StatGrid", () => {
    it("auto-fill + minmax — sabit kolon sayısı yazmaz", () => {
        // Ölçümde on ayrı ızgara vardı ve yarısı SABİT kolon yazıyordu
        // (`repeat(3, 1fr)`), yani dar ekranda kutular eziliyordu.
        const { container } = render(<StatGrid><Stat label="x" value={1} /></StatGrid>);
        const grid = container.firstElementChild as HTMLElement;
        expect(grid.style.display).toBe("grid");
        expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fill, minmax(170px, 1fr))");
    });

    it("min ve style ezilebilir — sabit kolon gerçekten gerekince", () => {
        const { container } = render(
            <StatGrid min="0" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <Stat label="x" value={1} />
            </StatGrid>,
        );
        expect((container.firstElementChild as HTMLElement).style.gridTemplateColumns).toBe("1fr 1fr 1fr");
    });
});
