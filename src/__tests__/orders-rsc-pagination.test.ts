/**
 * A1 — Orders RSC + sunucu tarafı sayfalama mimari kilidi.
 *
 * page.tsx artık SUNUCU component'i (auth + filtre + sayfalama + sayaç + RBAC
 * redaction) → OrdersClient.tsx (client) etkileşimi taşır → loading.tsx iskelet.
 * Eski "client ?all=1 mega-fetch + bellekte filtre/sayfalama" geri gelmemeli.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const PAGE = read("src/app/dashboard/orders/page.tsx");
const CLIENT = read("src/app/dashboard/orders/OrdersClient.tsx");

describe("orders page.tsx — sunucu component (RSC)", () => {
    it('"use client" YOK (server component)', () => {
        expect(PAGE).not.toMatch(/^\s*["']use client["']/m);
    });
    it("force-dynamic + searchParams await", () => {
        expect(PAGE).toContain('export const dynamic = "force-dynamic"');
        expect(PAGE).toContain("await searchParams");
    });
    it("sunucu filtre + sayfalama + sayaç servisleri çağrılır", () => {
        expect(PAGE).toContain("serviceListOrdersPaged");
        expect(PAGE).toContain("serviceCountOrdersByTab");
    });
    it("RBAC: resolveAuthContext + view_sales_orders guard + redaction", () => {
        expect(PAGE).toContain("resolveAuthContext");
        expect(PAGE).toContain('perms.has("view_sales_orders")');
        expect(PAGE).toContain("redactOrdersForPerms");
    });
    it("OrdersClient'a orders/total/counts/page geçirir", () => {
        expect(PAGE).toContain("<OrdersClient");
        expect(PAGE).toContain("total={paged.total}");
        expect(PAGE).toContain("counts={counts}");
    });
    it("client ?all=1 mega-fetch geri gelmemeli", () => {
        expect(PAGE).not.toContain("?all=1");
        expect(CLIENT).not.toContain("?all=1");
    });
});

describe("orders OrdersClient.tsx — client etkileşim", () => {
    it('"use client" var', () => {
        expect(CLIENT).toMatch(/^\s*["']use client["']/m);
    });
    it("filtre değişimi URL'e yazılır (paylaşılan useListUrlState)", () => {
        expect(CLIENT).toContain("useListUrlState");
        expect(CLIENT).toContain("navigate(");
    });
    it("arama debounce paylaşılan useDebouncedSearch ile", () => {
        expect(CLIENT).toContain("useDebouncedSearch");
    });
    it("data-context global liste'ye abone DEĞİL (useOrders yok)", () => {
        expect(CLIENT).not.toContain("useOrders");
        expect(CLIENT).not.toContain("ORDERS_KEY");
    });
});

describe("orders loading.tsx — iskelet", () => {
    it("dosya var", () => {
        expect(existsSync(join(process.cwd(), "src/app/dashboard/orders/loading.tsx"))).toBe(true);
    });
    it("aria-busy iskelet", () => {
        expect(read("src/app/dashboard/orders/loading.tsx")).toContain('aria-busy="true"');
    });
});
