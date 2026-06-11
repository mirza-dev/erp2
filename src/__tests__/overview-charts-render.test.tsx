// @vitest-environment node
/**
 * Genel Bakış grafikleri — renderToStaticMarkup smoke (jsdom-free).
 *  - Boş + dolu veriyle crash etmez.
 *  - `var(--chart-grid)` / `var(--chart-track)` kullanır (sabit hex YOK).
 *  - useMeasure ResizeObserver yokken (node) varsayılan genişlikle çalışır.
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Sparkline from "@/components/dashboard/overview/charts/Sparkline";
import TrendChart from "@/components/dashboard/overview/charts/TrendChart";
import Donut from "@/components/dashboard/overview/charts/Donut";
import BarChart from "@/components/dashboard/overview/charts/BarChart";
import Heatmap from "@/components/dashboard/overview/charts/Heatmap";
import MarginGauge from "@/components/dashboard/overview/charts/MarginGauge";

describe("charts — boş veriyle crash etmez", () => {
    it("Sparkline <2 nokta → null", () => {
        expect(renderToStaticMarkup(<Sparkline data={[1]} />)).toBe("");
    });
    it("TrendChart boş seri", () => {
        expect(() => renderToStaticMarkup(<TrendChart months={[]} revenue={[]} />)).not.toThrow();
    });
    it("Donut boş seri", () => {
        expect(() => renderToStaticMarkup(<Donut data={[]} />)).not.toThrow();
    });
    it("BarChart boş", () => {
        expect(() => renderToStaticMarkup(<BarChart days={[]} values={[]} />)).not.toThrow();
    });
    it("Heatmap boş", () => {
        expect(() => renderToStaticMarkup(<Heatmap rows={[]} data={[]} />)).not.toThrow();
    });
    it("MarginGauge", () => {
        expect(() => renderToStaticMarkup(<MarginGauge value={42} />)).not.toThrow();
    });
});

describe("charts — dolu veriyle render + tema tokenları", () => {
    it("TrendChart grid token kullanır, sabit hex yok", () => {
        const html = renderToStaticMarkup(
            <TrendChart months={["Oca", "Şub", "Mar"]} revenue={[100, 200, 150]} currency="TRY" />,
        );
        expect(html).toContain("var(--chart-grid)");
        expect(html).toContain("var(--accent)");
        expect(html).not.toMatch(/#[0-9a-fA-F]{3,6}\b/);
    });
    it("Donut track token + segment rengi", () => {
        const html = renderToStaticMarkup(
            <Donut data={[{ name: "A", value: 60, color: "var(--accent)" }, { name: "B", value: 40, color: "var(--success)" }]} currency="TRY" />,
        );
        expect(html).toContain("var(--chart-track)");
        expect(html).toContain("toplam");
    });
    it("BarChart tek seri üretim çubukları", () => {
        const html = renderToStaticMarkup(
            <BarChart days={["1", "2"]} values={[50, 30]} />,
        );
        expect(html).toContain("var(--chart-grid)");
        expect(html).toContain("var(--accent)");
        expect(html).not.toContain("var(--danger)");
        expect(html).not.toContain("Fire");
    });
    it("Heatmap track token (0 hücre) + tint (dolu)", () => {
        const html = renderToStaticMarkup(<Heatmap rows={["Döküm"]} data={[[0, 3]]} />);
        expect(html).toContain("var(--chart-track)");
        expect(html).toContain("color-mix(in srgb, var(--accent)");
    });
    it("MarginGauge yüzde + brüt marj etiketi", () => {
        const html = renderToStaticMarkup(<MarginGauge value={42} />);
        expect(html).toContain("var(--chart-track)");
        expect(html).toContain("Brüt Marj");
    });
});
