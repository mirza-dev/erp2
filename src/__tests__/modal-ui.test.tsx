// @vitest-environment jsdom
/**
 * Ortak `ui/Modal` davranış testleri.
 *
 * Bu bileşenin varlık sebebi bir a11y açığıydı: repoda 20 elle yazılmış
 * `role="dialog"` yüzeyi vardı ve yalnız 7'sinde Escape çalışıyordu. O yüzden
 * burada asıl kilitlenen şey görünüm değil, KLAVYE davranışı — kaynak-kilidi
 * yerine gerçek render.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Modal, { ConfirmModal } from "@/components/ui/Modal";

beforeEach(() => cleanup());

describe("Modal — kapatma yolları", () => {
    it("Escape onClose çağırır", () => {
        const onClose = vi.fn();
        render(<Modal onClose={onClose} ariaLabel="Test">içerik</Modal>);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("backdrop tıklaması onClose çağırır", () => {
        const onClose = vi.fn();
        const { container } = render(<Modal onClose={onClose} ariaLabel="Test">içerik</Modal>);
        // Backdrop, dialog'dan önceki kardeş.
        const backdrop = container.firstElementChild as HTMLElement;
        fireEvent.click(backdrop);
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("içeriğe tıklamak kapatmaz", () => {
        const onClose = vi.fn();
        render(<Modal onClose={onClose} ariaLabel="Test"><button>içerideki</button></Modal>);
        fireEvent.click(screen.getByText("içerideki"));
        expect(onClose).not.toHaveBeenCalled();
    });

    it("dismissible=false iken Escape de backdrop da kapatmaz", () => {
        const onClose = vi.fn();
        const { container } = render(
            <Modal onClose={onClose} ariaLabel="Test" dismissible={false}>içerik</Modal>,
        );
        fireEvent.keyDown(window, { key: "Escape" });
        fireEvent.click(container.firstElementChild as HTMLElement);
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe("Modal — erişilebilir ad", () => {
    it("ariaLabel verilince aria-label basar", () => {
        render(<Modal onClose={vi.fn()} ariaLabel="Şablon düzenle">x</Modal>);
        expect(screen.getByRole("dialog")).toHaveProperty("ariaLabel", "Şablon düzenle");
    });

    it("labelledBy verilince aria-labelledby kazanır (ariaLabel basılmaz)", () => {
        render(
            <Modal onClose={vi.fn()} ariaLabel="yok sayılmalı" labelledBy="baslik">
                <h2 id="baslik">Gerçek başlık</h2>
            </Modal>,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog.getAttribute("aria-labelledby")).toBe("baslik");
        expect(dialog.getAttribute("aria-label")).toBeNull();
    });

    it("aria-modal her zaman true", () => {
        render(<Modal onClose={vi.fn()} ariaLabel="Test">x</Modal>);
        expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
    });
});

describe("Modal — odak yönetimi", () => {
    it("açılışta ilk odaklanabilir öğeye odaklanır", () => {
        render(
            <Modal onClose={vi.fn()} ariaLabel="Test">
                <button>ilk</button>
                <button>ikinci</button>
            </Modal>,
        );
        expect(document.activeElement?.textContent).toBe("ilk");
    });

    it("kapanışta odak açan elemana döner", () => {
        const opener = document.createElement("button");
        opener.textContent = "açan";
        document.body.appendChild(opener);
        opener.focus();

        const { unmount } = render(
            <Modal onClose={vi.fn()} ariaLabel="Test"><button>içeride</button></Modal>,
        );
        expect(document.activeElement?.textContent).toBe("içeride");

        unmount();
        expect(document.activeElement).toBe(opener);
        opener.remove();
    });

    it("Tab son elemandan ilkine sarar (focus tuzağı)", () => {
        render(
            <Modal onClose={vi.fn()} ariaLabel="Test">
                <button>ilk</button>
                <button>son</button>
            </Modal>,
        );
        const son = screen.getByText("son");
        son.focus();
        fireEvent.keyDown(window, { key: "Tab" });
        expect(document.activeElement?.textContent).toBe("ilk");
    });

    it("Shift+Tab ilk elemandan sona sarar", () => {
        render(
            <Modal onClose={vi.fn()} ariaLabel="Test">
                <button>ilk</button>
                <button>son</button>
            </Modal>,
        );
        screen.getByText("ilk").focus();
        fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
        expect(document.activeElement?.textContent).toBe("son");
    });
});

describe("ConfirmModal", () => {
    it("başlık + mesaj + etiketler çizilir, onay/iptal çalışır", () => {
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        render(
            <ConfirmModal
                title="Şablonu pasifleştir"
                message='"Vana" şablonunu pasifleştirmek istiyor musunuz?'
                confirmLabel="Pasifleştir"
                onConfirm={onConfirm}
                onCancel={onCancel}
            />,
        );
        expect(screen.getByText("Şablonu pasifleştir")).toBeTruthy();
        expect(screen.getByText('"Vana" şablonunu pasifleştirmek istiyor musunuz?')).toBeTruthy();

        fireEvent.click(screen.getByRole("button", { name: "Pasifleştir" }));
        expect(onConfirm).toHaveBeenCalledTimes(1);
        fireEvent.click(screen.getByRole("button", { name: "İptal" }));
        expect(onCancel).toHaveBeenCalledTimes(1);
    });

    it("başlığı aria-labelledby ile bağlar (uydurma etiket yok)", () => {
        render(<ConfirmModal title="Emin misiniz?" message="…" onConfirm={vi.fn()} onCancel={vi.fn()} />);
        const dialog = screen.getByRole("dialog");
        expect(dialog.getAttribute("aria-labelledby")).toBe("confirm-modal-title");
        expect(document.getElementById("confirm-modal-title")?.textContent).toBe("Emin misiniz?");
    });

    it("busy iken Escape kapatmaz ve butonlar kilitli", () => {
        const onCancel = vi.fn();
        render(<ConfirmModal title="T" message="m" busy onConfirm={vi.fn()} onCancel={onCancel} />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onCancel).not.toHaveBeenCalled();
        expect(screen.getByRole("button", { name: "İptal" }).hasAttribute("disabled")).toBe(true);
    });
});

// ── 2026-08-30: elle yazılmış modalları taşımak için eklenen iki kapı ──────
//
// 9 dialog (customers ×2, vendors, quotes/[id], QuoteForm, production ×2,
// purchase/orders ×2, rfqs/[id]) ortak çerçeveye alındı. Bu yüzeylerin kendi
// başlık/gövde/alt-bar düzeni ve kimliği vardı; `padded` ve `surfaceStyle`
// olmasa taşımak GÖRSEL REGRESYON demekti. İkisi de a11y'yi ETKİLEMEMELİ.

describe("Modal — padded / surfaceStyle kapıları", () => {
    it("padded={false} çerçevenin kendi boşluğunu kaldırır", () => {
        const { unmount } = render(<Modal onClose={vi.fn()} ariaLabel="p" padded={false}><span>x</span></Modal>);
        expect(screen.getByRole("dialog").style.padding).toBe("0px");
        unmount();
        render(<Modal onClose={vi.fn()} ariaLabel="p"><span>x</span></Modal>);
        expect(screen.getByRole("dialog").style.padding).toBe("20px");
    });

    it("surfaceStyle yalnız GÖRÜNÜMÜ ezer; erişilebilirlik korunur", () => {
        render(
            <Modal
                onClose={vi.fn()}
                ariaLabel="özel yüzey"
                surfaceStyle={{ background: "var(--bg-primary)", borderRadius: "8px" }}
            >
                <span>x</span>
            </Modal>,
        );
        const dialog = screen.getByRole("dialog");
        expect(dialog.style.borderRadius).toBe("8px");
        // Sözleşmenin dokunulmaz kısmı:
        expect(dialog.getAttribute("aria-modal")).toBe("true");
        expect(dialog.getAttribute("aria-label")).toBe("özel yüzey");
        expect(dialog.style.position).toBe("fixed");
    });

    it("surfaceStyle verilse bile Escape çalışır", () => {
        const onClose = vi.fn();
        render(<Modal onClose={onClose} ariaLabel="a" surfaceStyle={{ background: "red" }}><span>x</span></Modal>);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});
