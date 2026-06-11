// @vitest-environment jsdom
/**
 * KpiCard — href navigasyonu + subTone aciliyet rengi (Teklif Hattı / Yoldaki Mal turu).
 * href'li kart gerçek <a>; href'siz eski div davranışı korunur (rapor/eski kullanım).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import KpiCard from "@/components/dashboard/overview/KpiCard";
import type { DashboardKpi } from "@/lib/dashboard-view-model";

afterEach(cleanup);

const base: DashboardKpi = { id: "x", label: "Teklif Hattı", value: "$8K", tone: "accent" };

describe("KpiCard", () => {
    it("href verilince <a> render eder; href + erişilebilir ad doğru", () => {
        render(<KpiCard kpi={{ ...base, href: "/dashboard/quotes" }} />);
        const link = screen.getByRole("link", { name: "Teklif Hattı: $8K" });
        expect(link.getAttribute("href")).toBe("/dashboard/quotes");
    });

    it("href yoksa link YOK (div fallback — eski kullanım kırılmaz)", () => {
        render(<KpiCard kpi={base} />);
        expect(screen.queryByRole("link")).toBeNull();
        expect(screen.getByText("Teklif Hattı")).toBeTruthy();
    });

    it("subTone warning/danger alt satırı renklendirir; yokken tertiary", () => {
        const { rerender } = render(<KpiCard kpi={{ ...base, sub: "1 tanesi 7 gün içinde doluyor", subTone: "warning" }} />);
        expect((screen.getByText("1 tanesi 7 gün içinde doluyor") as HTMLElement).style.color).toBe("var(--warning-text)");
        rerender(<KpiCard kpi={{ ...base, sub: "2 tanesi gecikmede", subTone: "danger" }} />);
        expect((screen.getByText("2 tanesi gecikmede") as HTMLElement).style.color).toBe("var(--danger-text)");
        rerender(<KpiCard kpi={{ ...base, sub: "Nötr satır" }} />);
        expect((screen.getByText("Nötr satır") as HTMLElement).style.color).toBe("var(--text-tertiary)");
    });
});
