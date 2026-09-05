// @vitest-environment jsdom
/**
 * Ortak `ui/Drawer` davranış testleri.
 *
 * `modal-ui.test.tsx`'in kardeşi ve varlık sebebi aynı sınıftan: 2026-09-05
 * ölçümünde repoda YEDİ yan çekmece vardı, dördünde Escape yoktu, altısında
 * odak tuzağı yoktu, altısında odak dönüşü yoktu — üstelik beşi `role="dialog"`
 * İLAN EDİYORDU. İşaretlemenin varlığı davranışın varlığı değildir; o yüzden
 * burada kilitlenen kaynak değil GERÇEK RENDER.
 *
 * Davranışın kendisi `Modal` ile ortak (`dialog-a11y.ts`). Bu dosya iki şeyi
 * ayrı ayrı kanıtlıyor: (a) çekirdek `Drawer`da da bağlı, (b) çekmeceye ÖZGÜ
 * yerleşim değişmezleri duruyor.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Drawer from "@/components/ui/Drawer";

beforeEach(() => cleanup());

describe("Drawer — kapatma yolları", () => {
    it("Escape onClose çağırır", () => {
        const onClose = vi.fn();
        render(<Drawer onClose={onClose} ariaLabel="Test">içerik</Drawer>);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("backdrop tıklaması onClose çağırır", () => {
        const onClose = vi.fn();
        const { container } = render(<Drawer onClose={onClose} ariaLabel="Test">içerik</Drawer>);
        // Backdrop, panelden önceki kardeş — `Modal` ile aynı yapı.
        fireEvent.click(container.firstElementChild as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("içeriğe tıklamak kapatmaz", () => {
        const onClose = vi.fn();
        render(<Drawer onClose={onClose} ariaLabel="Test"><button>içerideki</button></Drawer>);
        fireEvent.click(screen.getByText("içerideki"));
        expect(onClose).not.toHaveBeenCalled();
    });

    it("dismissible=false iken Escape de backdrop da kapatmaz", () => {
        // Tedarikçi formu çekmecesi bunu `dismissible={!saving}` ile kullanıyor:
        // kayıt sürerken yarım form Escape'le kaybolmasın.
        const onClose = vi.fn();
        const { container } = render(
            <Drawer onClose={onClose} ariaLabel="Test" dismissible={false}>içerik</Drawer>,
        );
        fireEvent.keyDown(window, { key: "Escape" });
        fireEvent.click(container.firstElementChild as HTMLElement);
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe("Drawer — erişilebilir ad", () => {
    it("ariaLabel verilince aria-label basar", () => {
        render(<Drawer onClose={() => {}} ariaLabel="Sipariş oluştur">içerik</Drawer>);
        expect(screen.getByRole("dialog").ariaLabel).toBe("Sipariş oluştur");
    });

    it("labelledBy verilince aria-labelledby kazanır (aria-label basılmaz)", () => {
        render(
            <Drawer onClose={() => {}} labelledBy="baslik" ariaLabel="yoksayılmalı">
                <h2 id="baslik">Görünen başlık</h2>
            </Drawer>,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog.getAttribute("aria-labelledby")).toBe("baslik");
        expect(dialog.getAttribute("aria-label")).toBeNull();
    });

    it("aria-modal her zaman true", () => {
        render(<Drawer onClose={() => {}} ariaLabel="Test">içerik</Drawer>);
        expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    });
});

describe("Drawer — odak yönetimi", () => {
    it("açılışta ilk odaklanabilir öğeye odaklanır", () => {
        // `AIDetailDrawer` ve `AlertCalendarDrawer` eskiden bunu `closeBtnRef`
        // ile ELLE yapıyordu; kapat butonu DOM sırasında zaten ilk odaklanabilir
        // öğe olduğu için sonuç aynı, ref gereksizdi.
        render(
            <Drawer onClose={() => {}} ariaLabel="Test">
                <button>ilk</button><button>ikinci</button>
            </Drawer>,
        );
        expect(document.activeElement).toBe(screen.getByText("ilk"));
    });

    it("kapanışta odak açan elemana döner", () => {
        const opener = document.createElement("button");
        document.body.appendChild(opener);
        opener.focus();
        const { unmount } = render(
            <Drawer onClose={() => {}} ariaLabel="Test"><button>içeride</button></Drawer>,
        );
        unmount();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it("Tab son elemandan ilkine sarar (focus tuzağı)", () => {
        render(
            <Drawer onClose={() => {}} ariaLabel="Test">
                <button>ilk</button><button>son</button>
            </Drawer>,
        );
        screen.getByText("son").focus();
        fireEvent.keyDown(window, { key: "Tab" });
        expect(document.activeElement).toBe(screen.getByText("ilk"));
    });

    it("Shift+Tab ilk elemandan sona sarar", () => {
        render(
            <Drawer onClose={() => {}} ariaLabel="Test">
                <button>ilk</button><button>son</button>
            </Drawer>,
        );
        screen.getByText("ilk").focus();
        fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
        expect(document.activeElement).toBe(screen.getByText("son"));
    });
});

describe("Drawer — çekmeceye özgü yerleşim değişmezleri", () => {
    it("dikey uzanım top+bottom ile kurulur — `height` YAZILMAZ", () => {
        // Turun asıl kazancı. Üç çekmece `height: 100vh` kullanıyordu; `100vh`
        // iOS Safari'de görüntü alanından BÜYÜKTÜR (tarayıcı çubuğu sayılmaz),
        // panelin dibi çubuğun altında kalır ve oraya kaydırılamaz. `bottom: 0`
        // birim tartışmasını komple bitirir — `100dvh`ten de iyi.
        render(<Drawer onClose={() => {}} ariaLabel="Test">içerik</Drawer>);
        const panel = screen.getByRole("dialog");
        expect(panel.style.top).toBe("0px");
        expect(panel.style.bottom).toBe("0px");
        expect(panel.style.right).toBe("0px");
        expect(panel.style.height).toBe("");
    });

    it("katman Modal ile aynı: backdrop 200 / panel 201", () => {
        // Eskiden dört ayrı katman vardı (50 · 80/81 · 200/201). 50'dekiler
        // kabuğun kendi mobil menüsünün (z=99/100) ALTINDA kalıyordu.
        const { container } = render(<Drawer onClose={() => {}} ariaLabel="Test">içerik</Drawer>);
        expect((container.firstElementChild as HTMLElement).style.zIndex).toBe("200");
        expect(screen.getByRole("dialog").style.zIndex).toBe("201");
    });

    it("padded={false} boşluğu kaldırır ama FLEX SÜTUNU korur", () => {
        // `Modal`ın aynı kapısından bilinçli fark: orada `padded={false}`
        // `display:block`a düşer. Çekmecede dikey iskelet (sabit başlık +
        // esneyen gövde) flex sütuna bağlı; `block`a düşerse başlık şeridi
        // kayar ve gövde kaydırması bozulur.
        render(<Drawer onClose={() => {}} ariaLabel="Test" padded={false}>içerik</Drawer>);
        const panel = screen.getByRole("dialog");
        expect(panel.style.padding).toBe("");
        expect(panel.style.display).toBe("flex");
        expect(panel.style.flexDirection).toBe("column");
    });

    it("surfaceStyle yalnız GÖRÜNÜMÜ ezer; erişilebilirlik ve konum korunur", () => {
        render(
            <Drawer onClose={() => {}} ariaLabel="Test" surfaceStyle={{ background: "red" }}>
                içerik
            </Drawer>,
        );
        const panel = screen.getByRole("dialog");
        expect(panel.style.background).toBe("red");
        expect(panel.getAttribute("aria-modal")).toBe("true");
        expect(panel.getAttribute("aria-label")).toBe("Test");
        expect(panel.style.position).toBe("fixed");
    });
});
