// @vitest-environment jsdom
/**
 * Diyalog odağının EBEVEYN RENDER'INA karşı kararlılığı.
 *
 * 2026-09-11 dış inceleme bulgusu #1. `useDialogA11y`nin odak effect'i
 * `onClose`'u bağımlılık listesinde tutuyordu; çağıranların neredeyse hepsi
 * prop'u inline yazdığı için ebeveynin HER render'ında effect temizlenip
 * yeniden kuruluyor, odak da diyalogdaki ilk odaklanabilir öğeye dönüyordu.
 *
 * Form state'i ebeveynde duran her diyalogda sonuç YAZILAMAMAKTI — ölçülen iki
 * gerçek yüzey: `NoteTemplatesTab` (başlık alanı) ve `purchase/orders/[id]`
 * (PO iptalinin zorunlu gerekçesi).
 *
 * Bu dosya KAYNAK DEĞİL DAVRANIŞ ölçer: gerçek render + gerçek odak. Kaynak
 * seviyesindeki kilit `gate/dialog-stability.test.ts`te.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Modal from "@/components/ui/Modal";
import Drawer from "@/components/ui/Drawer";

beforeEach(() => cleanup());

/**
 * Gerçek çağrı yerlerinin birebir şekli: form state EBEVEYNDE, `onClose`
 * INLINE. Yazmak ebeveyni render ettirir — kusurun tetiklendiği tam senaryo.
 */
function ParentOwnedForm({ shell }: { shell: "modal" | "drawer" }) {
    const [open, setOpen] = useState(true);
    const [title, setTitle] = useState("");
    if (!open) return null;

    const body = (
        <>
            <select aria-label="Kategori">
                <option>A</option>
            </select>
            <input aria-label="Başlık" value={title} onChange={e => setTitle(e.target.value)} />
        </>
    );

    return shell === "modal"
        ? <Modal onClose={() => setOpen(false)} ariaLabel="Test">{body}</Modal>
        : <Drawer onClose={() => setOpen(false)} ariaLabel="Test">{body}</Drawer>;
}

describe("Diyalog odağı — ebeveyn render'ında kaymaz", () => {
    it("Modal: ikinci alana yazarken odak alanda kalır", () => {
        render(<ParentOwnedForm shell="modal" />);
        const input = screen.getByLabelText("Başlık") as HTMLInputElement;

        input.focus();
        expect(document.activeElement).toBe(input);

        // Her tuş vuruşu ebeveyni yeniden render eder (state orada).
        fireEvent.change(input, { target: { value: "Ö" } });
        expect(document.activeElement).toBe(input);

        fireEvent.change(input, { target: { value: "Öde" } });
        fireEvent.change(input, { target: { value: "Ödeme" } });
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe("Ödeme");
    });

    it("Drawer: aynı garanti yan çekmecede de geçerli", () => {
        render(<ParentOwnedForm shell="drawer" />);
        const input = screen.getByLabelText("Başlık") as HTMLInputElement;

        input.focus();
        fireEvent.change(input, { target: { value: "gerekçe" } });

        expect(document.activeElement).toBe(input);
    });

    it("kusurun imzası: odak diyalogdaki İLK odaklanabilir öğeye dönmüyor", () => {
        // Düzeltmeden önce burası `<select>`e düşüyordu — iddia o spesifik
        // kaymayı adlandırır, yalnız "bir şey odakta" demez.
        render(<ParentOwnedForm shell="modal" />);
        const input = screen.getByLabelText("Başlık");
        const select = screen.getByLabelText("Kategori");

        input.focus();
        fireEvent.change(input, { target: { value: "x" } });

        expect(document.activeElement).not.toBe(select);
    });

    it("açılış odağı KORUNUR — düzeltme ilk odaklanmayı bozmamalı", () => {
        // Effect hâlâ mount'ta bir kez koşar: ilk odaklanabilir öğeye geçer.
        render(<ParentOwnedForm shell="modal" />);
        expect(document.activeElement).toBe(screen.getByLabelText("Kategori"));
    });

    it("kapanışta odak TETİKLEYİCİYE döner (ebeveyn render'ı bunu tüketmez)", () => {
        const trigger = document.createElement("button");
        trigger.textContent = "aç";
        document.body.appendChild(trigger);
        trigger.focus();

        const { unmount } = render(<ParentOwnedForm shell="modal" />);
        const input = screen.getByLabelText("Başlık");
        input.focus();
        // Araya giren render'lar `previouslyFocused`ı DEĞİŞTİRMEMELİ.
        fireEvent.change(input, { target: { value: "abc" } });

        unmount();
        expect(document.activeElement).toBe(trigger);
        trigger.remove();
    });
});
