/**
 * /dashboard/orders — Faz 1 bug-fix kilitleri (2026-06-01):
 *  - ?all=1 refetch (50-cap kalktı)
 *  - DOM mutation hover → hoveredId state (teklifler sayfası paterni)
 *  - Toplu "iptal" sözcüğü (soft-DELETE = iptal, "silindi" değil) + yalnızca
 *    iptal edilebilir satırların seçimi.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isOrderCancellable } from "@/app/dashboard/orders/page";

const SRC = readFileSync(
    join(process.cwd(), "src/app/dashboard/orders/page.tsx"),
    "utf8",
);

describe("isOrderCancellable", () => {
    it("draft / pending / approved (sevk edilmemiş) → iptal edilebilir", () => {
        expect(isOrderCancellable({ commercial_status: "draft", fulfillment_status: "unallocated" })).toBe(true);
        expect(isOrderCancellable({ commercial_status: "pending_approval", fulfillment_status: "unallocated" })).toBe(true);
        expect(isOrderCancellable({ commercial_status: "approved", fulfillment_status: "allocated" })).toBe(true);
        expect(isOrderCancellable({ commercial_status: "approved", fulfillment_status: "partially_allocated" })).toBe(true);
    });
    it("zaten iptal → iptal edilemez", () => {
        expect(isOrderCancellable({ commercial_status: "cancelled", fulfillment_status: "unallocated" })).toBe(false);
    });
    it("sevk edilmiş → iptal edilemez", () => {
        expect(isOrderCancellable({ commercial_status: "approved", fulfillment_status: "shipped" })).toBe(false);
        expect(isOrderCancellable({ commercial_status: "approved", fulfillment_status: "partially_shipped" })).toBe(true);
    });
});

describe("orders list — ?all=1 refetch", () => {
    it("refetch /api/orders?all=1 kullanır (50-cap kalktı)", () => {
        expect(SRC).toMatch(/fetch\("\/api\/orders\?all=1"\)/);
    });
});

describe("orders list — DOM mutation hover kaldırıldı", () => {
    it("td.style.background doğrudan yazımı YOK", () => {
        expect(SRC).not.toMatch(/td\.style\.background/);
    });
    it("data-chevron / data-delete attribute'ları YOK", () => {
        expect(SRC).not.toMatch(/data-chevron/);
        expect(SRC).not.toMatch(/data-delete/);
    });
    it("hoveredId state kullanılıyor", () => {
        expect(SRC).toMatch(/setHoveredId/);
        expect(SRC).toMatch(/const isHovered = hoveredId === order\.id/);
    });
});

describe("orders list — toplu iptal sözcük + seçim", () => {
    it('"silindi" / "Siliniyor" sözcükleri YOK (iptal sözcüğü)', () => {
        expect(SRC).not.toMatch(/silindi|Siliniyor/);
    });
    it("toplu işlem sonucu 'iptal edildi' der", () => {
        expect(SRC).toMatch(/sipariş iptal edildi/);
    });
    it("select-all cancellablePageIds kullanır (tüm pageIds değil)", () => {
        expect(SRC).toMatch(/cancellablePageIds/);
        expect(SRC).toMatch(/pagedItems\.filter\(isOrderCancellable\)/);
    });
    it("satır checkbox yalnızca cancellable satırda render edilir", () => {
        expect(SRC).toMatch(/cancellable && \(/);
    });
});
