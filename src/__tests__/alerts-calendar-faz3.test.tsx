// @vitest-environment jsdom
/**
 * Faz 3 davranışsal testleri (RTL/jsdom) — cila + responsive + a11y.
 *  - Responsive: <768 tek kolon + doküman scroll (kırpılmaz) / ≥768 iki kolon + clipped
 *  - Drawer focus-dönüşü: açılışta Kapat'a, kapanışta tetikleyiciye geri
 *  - Tema: alert bileşenlerinde var(--...) dışı hex YOK (yalnız onaylı #fff)
 *  - Reduced-motion: globals.css global guard mevcut
 *
 * Caveat: jsdom layout engine'i yok → görsel kırpılma tarayıcı-smoke ile doğrulanır;
 * test yalnız koşullu STİL DEĞERLERİNİ kilitler.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup, fireEvent, waitFor } from "@testing-library/react";
import AlertsPage from "@/app/dashboard/alerts/page";
import { AlertCalendarDrawer } from "@/components/alerts/AlertCalendarDrawer";
import type { CalendarAlert } from "@/lib/alert-calendar";

vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false, DEMO_BLOCK_TOAST: "x", DEMO_DISABLED_TOOLTIP: "x",
}));
vi.mock("next/link", () => ({
    default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

function setWidth(w: number) {
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: w });
}

beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => [] }) as unknown as typeof fetch;
    setWidth(1200);
});
afterEach(() => cleanup());

async function renderPage() {
    const utils = render(<AlertsPage />);
    // loading → loaded geçişini bekle (CalendarHeader prev butonu yüklemeden sonra görünür)
    await screen.findByLabelText("Önceki ay");
    return utils;
}

describe("Faz 3 — responsive layout", () => {
    it("masaüstü (1200) → iki kolon + clipped", async () => {
        setWidth(1200);
        const { container } = await renderPage();
        const layout = container.querySelector(".alerts-calendar-layout") as HTMLElement;
        expect(layout).toBeTruthy();
        expect(layout.style.gridTemplateColumns).toBe("1fr 380px");
        expect(layout.style.overflow).toBe("hidden");
    });

    it("mobil (390) → tek kolon + height auto + overflow visible (kırpılmaz)", async () => {
        setWidth(390);
        const { container } = await renderPage();
        const layout = container.querySelector(".alerts-calendar-layout") as HTMLElement;
        expect(layout.style.gridTemplateColumns).toBe("1fr");
        expect(layout.style.height).toBe("auto");
        expect(layout.style.overflow).toBe("visible");
        // İç konteynerler de mobilde doküman scroll'una akmalı (advisor: fixed-height
        // modelinin overflow:hidden + flex:1'i mobilde kırpabilir/çökebilir).
        const col = layout.querySelector(":scope > div:first-child") as HTMLElement;
        expect(col.style.overflow).toBe("visible");
        const gridScroll = col.lastElementChild as HTMLElement;
        expect(gridScroll.style.flex).toBe("0 0 auto"); // jsdom flex:"none" normalize
        expect(gridScroll.style.overflowY).not.toBe("auto"); // iç scroll yok → doküman akışı
        // gün paneli mobilde üst kenarlık + max-height ile iç scroll
        const panel = container.querySelector(".alerts-day-panel") as HTMLElement;
        expect(panel.style.maxHeight).toBe("50vh");
        expect(panel.style.borderTop).not.toBe("");
    });

    it("resize event → masaüstüden mobile geçişte tek kolona düşer", async () => {
        setWidth(1200);
        const { container } = await renderPage();
        const layout = container.querySelector(".alerts-calendar-layout") as HTMLElement;
        expect(layout.style.gridTemplateColumns).toBe("1fr 380px");
        act(() => { setWidth(500); window.dispatchEvent(new Event("resize")); });
        expect(layout.style.gridTemplateColumns).toBe("1fr");
    });
});

describe("Faz 3 — çözülen uyarılar görünürlüğü", () => {
    it("ilk açılışta çözülenleri gizler; kullanıcı seçince gösterir", async () => {
        const createdAt = new Date().toISOString();
        const alert = (id: string, title: string, status: "open" | "resolved") => ({
            id,
            type: "sync_issue",
            severity: "warning",
            status,
            title,
            description: title,
            entity_type: null,
            entity_id: null,
            resolution_reason: status === "resolved" ? "Tamamlandı" : null,
            ai_confidence: null,
            ai_reason: null,
            ai_model_version: null,
            created_at: createdAt,
            source: "system",
            due_date: null,
            created_by: null,
            due_label: null,
            order_code: null,
        });
        global.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url === "/api/alerts/calendar") {
                return { ok: true, json: async () => [
                    alert("active", "Aktif senkron uyarısı", "open"),
                    alert("resolved", "Çözülmüş senkron uyarısı", "resolved"),
                ] } as Response;
            }
            return { ok: true, json: async () => [] } as Response;
        }) as unknown as typeof fetch;

        await renderPage();

        const toggle = screen.getByRole("checkbox", { name: "Çözülenleri göster" }) as HTMLInputElement;
        expect(toggle.checked).toBe(false);
        expect(screen.getAllByText("Aktif senkron uyarısı").length).toBeGreaterThan(0);
        expect(screen.queryByText("Çözülmüş senkron uyarısı")).toBeNull();

        fireEvent.click(toggle);
        await waitFor(() => expect(screen.getAllByText("Çözülmüş senkron uyarısı").length).toBeGreaterThan(0));
        expect(toggle.checked).toBe(true);
    });
});

describe("Faz 3 — drawer focus dönüşü", () => {
    function ca(over: Partial<CalendarAlert>): CalendarAlert {
        return {
            id: "a1", type: "stock_critical", severity: "critical", status: "open",
            title: "Kritik Stok", reason: "Stok düşük", impact: "~2 gün",
            date: new Date(2026, 5, 7, 15, 25).toISOString(), time: "15:25",
            resolution: null, dueDate: null, dueLabel: null, orderCode: null,
            entityId: "p1", entityType: "product",
            product: { name: "Vana DN50", sku: "KV-50", available: 1, minStock: 5, reserved: 2, unit: "adet", coverageDays: 2 },
            source: null, aiConfidence: null, aiReason: null, aiModelVersion: null,
            ...over,
        };
    }

    it("açılışta odak Kapat butonuna gider, kapanışta tetikleyiciye geri döner", () => {
        const trigger = document.createElement("button");
        trigger.textContent = "Aç";
        document.body.appendChild(trigger);
        trigger.focus();
        expect(document.activeElement).toBe(trigger);

        const noop = () => {};
        const { unmount } = render(
            <AlertCalendarDrawer
                alert={ca({})}
                onClose={noop} onAcknowledge={noop} onResolve={noop} onDismiss={noop}
                onSyncRetry={noop} onDismissProduct={noop} onExtended={noop} onShipped={noop}
                isDemo={false} syncRetrying={false}
            />,
        );
        // mount effect → ilk odak Kapat
        expect(document.activeElement).toBe(screen.getByLabelText("Kapat"));

        unmount();
        // cleanup → odak tetikleyiciye geri
        expect(document.activeElement).toBe(trigger);
        document.body.removeChild(trigger);
    });
});

describe("Faz 3 — tema + reduced-motion kilitleri", () => {
    const root = process.cwd();
    const ALERT_FILES = [
        "src/components/alerts/CalendarGrid.tsx",
        "src/components/alerts/CalendarHeader.tsx",
        "src/components/alerts/ClassificationTabs.tsx",
        "src/components/alerts/DayDetailPanel.tsx",
        "src/components/alerts/AlertCalendarDrawer.tsx",
        "src/components/alerts/SevBadge.tsx",
    ];

    it("alert bileşenlerinde var(--...) dışı hex YOK (yalnız onaylı #fff)", () => {
        const hexRe = /#[0-9a-fA-F]{3,8}\b/g;
        for (const rel of ALERT_FILES) {
            const src = readFileSync(join(root, rel), "utf8");
            const hexes = src.match(hexRe) ?? [];
            const illegal = hexes.filter((h) => h.toLowerCase() !== "#fff");
            expect(illegal, `${rel} sabit hex içeriyor: ${illegal.join(", ")}`).toEqual([]);
        }
    });

    it("globals.css prefers-reduced-motion global guard içerir", () => {
        const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
        expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
        expect(css).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    });
});
