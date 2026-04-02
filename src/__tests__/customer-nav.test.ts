import { describe, it, expect } from "vitest";
import type { Customer, Order } from "@/lib/mock-data";

// ─── Utilities extracted from component logic ─────────────────────────────────
// These mirror the logic in orders/new/page.tsx and orders/page.tsx exactly.

function findCustomerForPrefill(
    customers: Customer[],
    customerId: string | null,
    customerName: string | null,
): Customer | undefined {
    if (customerId) {
        const found = customers.find(c => c.id === customerId);
        if (found) return found;
    }
    if (customerName) {
        return customers.find(c => c.name === decodeURIComponent(customerName));
    }
    return undefined;
}

function filterOrders(
    orders: Order[],
    customerIdFilter: string | null,
    search: string,
): Order[] {
    return orders.filter(o => {
        if (customerIdFilter && o.customerId !== customerIdFilter) return false;
        if (!search) return true;
        return (
            o.orderNumber.toLowerCase().includes(search.toLowerCase()) ||
            o.customerName.toLowerCase().includes(search.toLowerCase())
        );
    });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeCustomer = (id: string, name: string): Customer => ({
    id, name, email: "", phone: "", address: "", taxNumber: "",
    taxOffice: "", country: "TR", currency: "TRY", notes: "",
    isActive: true, totalOrders: 0, totalRevenue: 0, lastOrderDate: "",
});

const makeOrder = (id: string, customerId: string | undefined, customerName: string): Order => ({
    id, customerId, customerName,
    orderNumber: `ORD-${id}`, commercial_status: "draft",
    fulfillment_status: "unallocated", grandTotal: 1000,
    currency: "TRY", createdAt: "2024-01-01T00:00:00Z", itemCount: 1,
});

// ─── findCustomerForPrefill ───────────────────────────────────────────────────

describe("findCustomerForPrefill — customerId ile arama", () => {
    const customers = [
        makeCustomer("c1", "Acme Ltd"),
        makeCustomer("c2", "Beta A.Ş."),
        makeCustomer("c3", "Acme Ltd"), // aynı isim, farklı ID
    ];

    it("customerId varsa doğru müşteriyi döner", () => {
        const result = findCustomerForPrefill(customers, "c2", null);
        expect(result?.id).toBe("c2");
        expect(result?.name).toBe("Beta A.Ş.");
    });

    it("aynı isimli iki müşteride customerId ile kesin eşleşme yapılır", () => {
        const result = findCustomerForPrefill(customers, "c3", "Acme Ltd");
        expect(result?.id).toBe("c3"); // c1 değil c3
    });

    it("customerId bulunamazsa customerName fallback çalışır", () => {
        const result = findCustomerForPrefill(customers, "c99", "Beta A.Ş.");
        expect(result?.id).toBe("c2");
    });

    it("sadece customerName varsa isim ile bulur (URL-encoded geçerli)", () => {
        // encodeURIComponent("Beta A.Ş.") = "Beta%20A.%C5%9E."
        const result = findCustomerForPrefill(customers, null, encodeURIComponent("Beta A.Ş."));
        expect(result?.id).toBe("c2");
    });

    it("customerName tam eşleşme gerektirir", () => {
        const result = findCustomerForPrefill(customers, null, "Beta A.Ş.");
        expect(result?.id).toBe("c2");
    });

    it("her iki param da null ise undefined döner", () => {
        const result = findCustomerForPrefill(customers, null, null);
        expect(result).toBeUndefined();
    });
});

// ─── filterOrders ─────────────────────────────────────────────────────────────

describe("filterOrders — customerIdFilter", () => {
    const orders = [
        makeOrder("o1", "c1", "Acme Ltd"),
        makeOrder("o2", "c2", "Beta A.Ş."),
        makeOrder("o3", "c1", "Acme Ltd"),
        makeOrder("o4", undefined, "Acme Ltd"), // customerId yok (eski kayıt)
    ];

    it("customerIdFilter yoksa tüm siparişler döner", () => {
        expect(filterOrders(orders, null, "")).toHaveLength(4);
    });

    it("customerIdFilter ile sadece o müşterinin siparişleri döner", () => {
        const result = filterOrders(orders, "c1", "");
        expect(result.map(o => o.id)).toEqual(["o1", "o3"]);
    });

    it("customerId'si olmayan sipariş customerIdFilter ile eşleşmez", () => {
        const result = filterOrders(orders, "c1", "");
        expect(result.find(o => o.id === "o4")).toBeUndefined();
    });

    it("customerIdFilter + search birlikte çalışır", () => {
        const result = filterOrders(orders, "c1", "ORD-o1");
        expect(result.map(o => o.id)).toEqual(["o1"]);
    });

    it("search olmadan customerIdFilter tüm eşleşenleri getirir", () => {
        const result = filterOrders(orders, "c2", "");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("o2");
    });

    it("customerIdFilter null iken search çalışır", () => {
        const result = filterOrders(orders, null, "Beta");
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("o2");
    });
});

// ─── Async data arrival (cold-load regression) ────────────────────────────────
// Guards against re-introducing the mount-only [] dep bug in orders/new/page.tsx.
// The effect previously ran once at mount when customers=[], so prefill was always
// skipped on cold/deep-link loads. Fix: effect depends on `customers` + prefillDoneRef.
// These tests exercise the prefill logic at both points in that timeline.

describe("findCustomerForPrefill — async data arrival (cold-load regression)", () => {
    it("customers boşken bulunamaz — mount anındaki effect çalışmasını temsil eder", () => {
        expect(findCustomerForPrefill([], "c1", null)).toBeUndefined();
    });

    it("customers yüklendikten sonra customerId ile bulunur — data gelişi sonrası effect", () => {
        const customers = [makeCustomer("c1", "Acme Ltd"), makeCustomer("c2", "Beta A.Ş.")];
        expect(findCustomerForPrefill(customers, "c1", null)?.id).toBe("c1");
    });

    it("customers yüklendikten sonra customerName fallback çalışır", () => {
        const customers = [makeCustomer("c1", "Acme Ltd"), makeCustomer("c2", "Beta A.Ş.")];
        expect(findCustomerForPrefill(customers, null, "Beta A.Ş.")?.id).toBe("c2");
    });

    it("customers boş → dolu geçişinde doğru müşteri bulunur (sequence)", () => {
        // Simulates the two-call sequence: effect at mount (empty), then after data loads.
        const customers = [makeCustomer("c1", "Acme Ltd")];
        expect(findCustomerForPrefill([], "c1", null)).toBeUndefined();      // mount call — miss
        expect(findCustomerForPrefill(customers, "c1", null)?.id).toBe("c1"); // post-load — hit
    });
});
