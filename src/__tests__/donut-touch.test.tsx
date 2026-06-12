// @vitest-environment jsdom
/**
 * Donut — mobil dokunma davranışı (kullanıcı bulgusu: merkez "$3K · 1%" takılı kalıyordu).
 * Dokunma mouseenter üretir ama mouseleave HİÇ gelmez → vurgu kalıcı takılırdı.
 * Yeni davranış: touch pointerdown TOGGLE (aynı segmente tekrar dokun → toplam);
 * dokunmayı izleyen ghost mouse event'leri yok sayılır; masaüstü hover korunur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import Donut from "@/components/dashboard/overview/charts/Donut";

const DATA = [
    { name: "Vana", value: 297_000, color: "var(--accent)" },
    { name: "Conta", value: 3_000, color: "var(--success)" },
];

function renderDonut() {
    const { container } = render(<Donut data={DATA} currency="USD" />);
    const svg = container.querySelector("svg")!;
    // ilk circle = track; sonrakiler segmentler
    const segments = Array.from(svg.querySelectorAll("circle")).slice(1);
    const center = () => svg.textContent ?? "";
    return { svg, segments, center };
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

describe("Donut — dokunma toggle + ghost-mouse koruması", () => {
    it("varsayılan merkez: toplam", () => {
        const { center } = renderDonut();
        expect(center()).toContain("300K");
        expect(center()).toContain("toplam");
    });

    it("touch: segmente dokun → segment değeri; AYNI segmente tekrar dokun → toplam (takılma yok)", () => {
        const { segments, center } = renderDonut();

        fireEvent.pointerDown(segments[1], { pointerType: "touch" });
        expect(center()).toContain("3K");
        expect(center()).toContain("1%");

        fireEvent.pointerDown(segments[1], { pointerType: "touch" });
        expect(center()).toContain("300K");
        expect(center()).toContain("toplam");
    });

    it("touch sonrası ghost mouseenter/mouseleave seçimi EZMEZ (eski takılma kökü)", () => {
        const { svg, segments, center } = renderDonut();

        fireEvent.pointerDown(segments[1], { pointerType: "touch" });
        // tarayıcı dokunmadan hemen sonra sentetik mouse event'leri üretir
        fireEvent.mouseEnter(segments[0]);
        fireEvent.mouseLeave(segments[0]);
        fireEvent.mouseLeave(svg);
        expect(center()).toContain("3K");   // seçim korunur

        // ghost penceresi geçince gerçek mouse davranışı geri gelir
        vi.advanceTimersByTime(800);
        fireEvent.mouseLeave(svg);
        expect(center()).toContain("toplam");
    });

    it("masaüstü hover davranışı korunur: enter → segment, leave → toplam", () => {
        const { segments, center } = renderDonut();

        fireEvent.mouseEnter(segments[0]);
        expect(center()).toContain("297K");
        expect(center()).toContain("99%");

        fireEvent.mouseLeave(segments[0]);
        expect(center()).toContain("toplam");
    });

    it("mouse pointerdown toggle TETİKLEMEZ (yalnız touch)", () => {
        const { segments, center } = renderDonut();
        fireEvent.pointerDown(segments[1], { pointerType: "mouse" });
        expect(center()).toContain("toplam");
    });
});
