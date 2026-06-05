// @vitest-environment jsdom
/**
 * OrderForm davranışsal testleri (RTL) — paylaşılan new+edit extraction'ının
 * create/edit submit payload'ını DAVRANIŞSAL doğrular (source-regex değil).
 *  - new mode → addOrder doğru lines/müşteri ile çağrılır
 *  - edit mode → PUT /api/orders/[id] doğru body ile çağrılır + prefill
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import OrderForm, { type OrderFormInitial } from "@/app/dashboard/orders/OrderForm";
import type { Customer, Product } from "@/lib/mock-data";

const mockAddOrder = vi.fn();
const mockToast = vi.fn();
const mockPush = vi.fn();

const CUSTOMER: Customer = {
    id: "c1", name: "Acme AŞ", email: "a@acme.com", phone: "", address: "Adres 1",
    taxNumber: "1234567890", taxOffice: "Kadıköy", country: "Türkiye", currency: "TRY",
    notes: "", isActive: true, totalOrders: 0, totalRevenue: 0, lastOrderDate: null,
};
const PRODUCT: Product = {
    id: "p1", name: "Vana DN50", sku: "V-50", category: "vana", unit: "adet",
    price: 150, currency: "TRY", on_hand: 100, reserved: 0, available_now: 100,
    quoted: 0, promisable: 100, incoming: 0, forecasted: 100, minStockLevel: 10,
    isActive: true, productType: "commercial", warehouse: "A",
};

vi.mock("@/lib/data-context", () => ({
    useData: () => ({ customers: [CUSTOMER], products: [PRODUCT], addOrder: mockAddOrder }),
}));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock("@/lib/demo-utils", () => ({
    useIsDemo: () => false, DEMO_BLOCK_TOAST: "x", DEMO_DISABLED_TOOLTIP: "x",
}));
vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush }),
    useSearchParams: () => ({ get: () => null }),
}));
vi.mock("next/link", () => ({
    default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/Button", () => ({
    default: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
        <button onClick={onClick} disabled={disabled}>{children}</button>
    ),
    ButtonLink: ({ children, href, disabled }: { children: React.ReactNode; href: string; disabled?: boolean }) => (
        <a href={href} aria-disabled={disabled || undefined}>{children}</a>
    ),
}));

beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 1024 });
    mockAddOrder.mockReset().mockResolvedValue("new-order-id");
    mockToast.mockReset();
    mockPush.mockReset();
});
afterEach(() => cleanup());

describe("OrderForm new mode — addOrder payload", () => {
    it("müşteri + ürün seçip 'Oluştur ve Gönder' → addOrder doğru lines ile", async () => {
        render(<OrderForm mode="new" />);

        // Müşteri seç (custom dropdown: aç → tıkla)
        fireEvent.click(screen.getByText("Müşteri ara veya seç..."));
        fireEvent.click(screen.getByText("Acme AŞ"));

        // Ürün seç (select aria-label) → unitPrice auto-fill (product.price)
        fireEvent.change(screen.getByLabelText("Satır 1 ürün"), { target: { value: "p1" } });

        await act(async () => {
            fireEvent.click(screen.getByText("Siparişi Oluştur ve Gönder"));
        });

        expect(mockAddOrder).toHaveBeenCalledTimes(1);
        const arg = mockAddOrder.mock.calls[0][0];
        expect(arg.customerName).toBe("Acme AŞ");
        expect(arg.customerId).toBe("c1");
        expect(arg.commercial_status).toBe("pending_approval");
        expect(arg.currency).toBe("TRY");
        expect(arg.lines).toHaveLength(1);
        expect(arg.lines[0]).toMatchObject({
            productId: "p1", productSku: "V-50", quantity: 1, unitPrice: 150, discountPct: 0, lineTotal: 150,
        });
        // grandTotal = 150 + %20 KDV = 180
        expect(arg.grandTotal).toBeCloseTo(180, 2);
    });

    it("müşteri seçilmeden submit → addOrder çağrılmaz (validation)", async () => {
        render(<OrderForm mode="new" />);
        fireEvent.change(screen.getByLabelText("Satır 1 ürün"), { target: { value: "p1" } });
        await act(async () => {
            fireEvent.click(screen.getByText("Siparişi Oluştur ve Gönder"));
        });
        expect(mockAddOrder).not.toHaveBeenCalled();
    });

    it("mobilde summary aksiyonları gizler, sticky aksiyonları tek kaynak olarak gösterir", () => {
        Object.defineProperty(window, "innerWidth", { configurable: true, writable: true, value: 390 });

        render(<OrderForm mode="new" />);

        expect(screen.queryByText("Siparişi Oluştur ve Gönder")).toBeNull();
        expect(screen.queryByText("Taslak Olarak Kaydet")).toBeNull();
        expect(screen.getByText("Taslak Kaydet")).toBeTruthy();
        expect(screen.getByText("Gönder →")).toBeTruthy();
    });
});

describe("OrderForm edit mode — PUT payload + prefill", () => {
    const INITIAL: OrderFormInitial = {
        orderNumber: "ORD-2026-0007",
        customerId: "c1",
        notes: "eski not",
        quoteValidUntil: "",
        lines: [{ productId: "p1", productName: "Vana DN50", productSku: "V-50", unit: "adet", quantity: 3, unitPrice: 150, discountPct: 10 }],
    };

    it("initial prefill → 'Değişiklikleri Kaydet' PUT /api/orders/[id] doğru body", async () => {
        const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
        vi.stubGlobal("fetch", fetchMock);

        render(<OrderForm mode="edit" orderId="o-7" initial={INITIAL} />);

        // prefill: müşteri adı göründü (dropdown toggle + preview = 2 yer)
        expect(screen.getAllByText("Acme AŞ").length).toBeGreaterThan(0);

        await act(async () => {
            fireEvent.click(screen.getAllByText("Değişiklikleri Kaydet")[0]);
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, opts] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/orders/o-7");
        expect(opts.method).toBe("PUT");
        const body = JSON.parse(opts.body);
        expect(body.customer_id).toBe("c1");
        expect(body.customer_name).toBe("Acme AŞ");
        expect(body.notes).toBe("eski not");
        expect(body.lines).toHaveLength(1);
        expect(body.lines[0]).toMatchObject({
            product_id: "p1", quantity: 3, unit_price: 150, discount_pct: 10,
        });
        // line_total = 3 * 150 * (1 - 0.10) = 405
        expect(body.lines[0].line_total).toBeCloseTo(405, 2);
        expect(mockPush).toHaveBeenCalledWith("/dashboard/orders/o-7");
    });
});
