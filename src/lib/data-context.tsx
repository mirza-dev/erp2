"use client";

import { createContext, useContext, useState, useMemo, ReactNode } from "react";
import { mockCustomers, mockProducts, mockOrders, mockUretimKayitlari, mockOrderDetails } from "./mock-data";
import type { Customer, Product, Order, OrderDetail, OrderLineItem, UretimKaydi } from "./mock-data";
import { mapOrderToInvoice, sendInvoiceToParasut } from "./parasut";
import type { ParasutSyncResult } from "./parasut";

export type CommercialStatus = "draft" | "pending_approval" | "approved" | "cancelled";
export type FulfillmentStatus = "unallocated" | "partially_allocated" | "allocated" | "partially_shipped" | "shipped";

// Transition type: commercial status changes + fulfillment "shipped" transition
type OrderTransition = CommercialStatus | "shipped";

interface ImportPayload {
    customers?: Customer[];
    products?: Product[];
    orders?: Order[];
}

export interface ConflictItem {
    productName: string;
    requested: number;
    available: number;
}

export interface UpdateStatusResult {
    ok: boolean;
    conflicts?: ConflictItem[];
    parasutSync?: ParasutSyncResult;
}

interface DataContextValue {
    customers: Customer[];
    products: Product[];
    orders: Order[];
    orderDetails: OrderDetail[];
    uretimKayitlari: UretimKaydi[];
    addImportedData: (payload: ImportPayload) => void;
    importedCount: { customers: number; products: number; orders: number } | null;
    addCustomer: (c: Omit<Customer, "id" | "totalOrders" | "totalRevenue" | "lastOrderDate" | "isActive">) => void;
    updateCustomer: (id: string, updates: Partial<Customer>) => void;
    addProduct: (p: Omit<Product, "id" | "reserved" | "available_now" | "isActive">) => void;
    addUretimKaydi: (k: Omit<UretimKaydi, "id">) => void;
    deleteUretimKaydi: (id: string) => void;
    addOrder: (detail: Omit<OrderDetail, "id" | "orderNumber" | "itemCount">) => string;
    updateOrderStatus: (orderId: string, transition: OrderTransition) => Promise<UpdateStatusResult>;
    reorderSuggestions: Product[];
}

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
    const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
    const [products, setProducts] = useState<Product[]>(mockProducts);
    const [orders, setOrders] = useState<Order[]>(mockOrders);
    const [orderDetails, setOrderDetails] = useState<OrderDetail[]>(mockOrderDetails);
    const [uretimKayitlari, setUretimKayitlari] = useState<UretimKaydi[]>(mockUretimKayitlari);
    const [importedCount, setImportedCount] = useState<DataContextValue["importedCount"]>(null);

    // --- Import ---
    const addImportedData = (payload: ImportPayload) => {
        const newCustomers = payload.customers ?? [];
        const newProducts = payload.products ?? [];
        const newOrders = payload.orders ?? [];

        if (newCustomers.length > 0) setCustomers(prev => [...prev, ...newCustomers]);
        if (newProducts.length > 0) setProducts(prev => [...prev, ...newProducts]);
        if (newOrders.length > 0) setOrders(prev => [...newOrders, ...prev]);

        setImportedCount({
            customers: newCustomers.length,
            products: newProducts.length,
            orders: newOrders.length,
        });
    };

    // --- Customers ---
    const addCustomer = (fields: Omit<Customer, "id" | "totalOrders" | "totalRevenue" | "lastOrderDate" | "isActive">) => {
        const newC: Customer = {
            ...fields,
            id: `cust-${Date.now()}`,
            isActive: true,
            totalOrders: 0,
            totalRevenue: 0,
            lastOrderDate: "",
        };
        setCustomers(prev => [...prev, newC]);
    };

    const updateCustomer = (id: string, updates: Partial<Customer>) => {
        setCustomers(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    };

    // --- Products ---
    const addProduct = (fields: Omit<Product, "id" | "reserved" | "available_now" | "isActive">) => {
        const newP: Product = {
            ...fields,
            id: `prod-${Date.now()}`,
            isActive: true,
            reserved: 0,
            available_now: fields.on_hand,
        };
        setProducts(prev => [newP, ...prev]);
    };

    // --- Üretim ---
    const addUretimKaydi = (k: Omit<UretimKaydi, "id">) => {
        const newK: UretimKaydi = { ...k, id: `uret-${Date.now()}` };
        setUretimKayitlari(prev => [newK, ...prev]);
        setProducts(prev => prev.map(p => {
            if (p.id !== k.productId) return p;
            return {
                ...p,
                on_hand: p.on_hand + k.adet,
                available_now: p.available_now + k.adet,
            };
        }));
    };

    const deleteUretimKaydi = (id: string) => {
        const kaydi = uretimKayitlari.find(k => k.id === id);
        if (!kaydi) return;
        setUretimKayitlari(prev => prev.filter(k => k.id !== id));
        setProducts(prev => prev.map(p => {
            if (p.id !== kaydi.productId) return p;
            return {
                ...p,
                on_hand: Math.max(0, p.on_hand - kaydi.adet),
                available_now: Math.max(0, p.available_now - kaydi.adet),
            };
        }));
    };

    // --- Stock helpers ---
    // Reserve stock when an order is APPROVED (hard reservation)
    const reserveStock = (lines: OrderLineItem[]) => {
        setProducts(prev => prev.map(p => {
            const line = lines.find(l => l.productId === p.id);
            if (!line) return p;
            return {
                ...p,
                reserved: p.reserved + line.quantity,
                available_now: Math.max(0, p.available_now - line.quantity),
            };
        }));
    };

    // Release reserved stock (on cancellation of approved order)
    const releaseStock = (lines: OrderLineItem[]) => {
        setProducts(prev => prev.map(p => {
            const line = lines.find(l => l.productId === p.id);
            if (!line) return p;
            return {
                ...p,
                reserved: Math.max(0, p.reserved - line.quantity),
                available_now: p.available_now + line.quantity,
            };
        }));
    };

    // --- Orders ---
    const addOrder = (detail: Omit<OrderDetail, "id" | "orderNumber" | "itemCount">): string => {
        const id = `ord-${Date.now()}`;
        const num = orders.length + 43; // continue from existing mock numbering
        const orderNumber = `ORD-${new Date().getFullYear()}-${String(num).padStart(4, "0")}`;
        const itemCount = detail.lines.length;

        const newDetail: OrderDetail = { ...detail, id, orderNumber, itemCount };
        setOrderDetails(prev => [newDetail, ...prev]);

        const newOrder: Order = {
            id,
            orderNumber,
            customerName: detail.customerName,
            commercial_status: detail.commercial_status,
            fulfillment_status: detail.fulfillment_status,
            grandTotal: detail.grandTotal,
            currency: detail.currency,
            createdAt: detail.createdAt,
            itemCount,
        };
        setOrders(prev => [newOrder, ...prev]);

        // Domain rule: NO stock reservation for draft or pending_approval orders.
        // Hard reservation only happens when commercial_status transitions to "approved".

        return id;
    };

    const updateOrderStatus = async (orderId: string, transition: OrderTransition): Promise<UpdateStatusResult> => {
        const order = orderDetails.find(o => o.id === orderId);
        if (!order) return { ok: false };

        const prevCommercial = order.commercial_status;
        const prevFulfillment = order.fulfillment_status;

        // ── pending_approval → approved: conflict check then reserve stock ──
        if (transition === "approved") {
            const conflicts: ConflictItem[] = [];
            for (const line of order.lines) {
                const product = products.find(p => p.id === line.productId);
                if (!product) continue;
                // Order is NOT yet reserved (pending_approval = unallocated).
                // Check if available_now can cover the requested quantity.
                if (product.available_now < line.quantity) {
                    conflicts.push({
                        productName: line.productName,
                        requested: line.quantity,
                        available: Math.max(0, product.available_now),
                    });
                }
            }
            if (conflicts.length > 0) return { ok: false, conflicts };

            // Reserve stock and transition to allocated
            reserveStock(order.lines);
            setOrderDetails(prev => prev.map(o =>
                o.id === orderId
                    ? { ...o, commercial_status: "approved", fulfillment_status: "allocated" }
                    : o
            ));
            setOrders(prev => prev.map(o =>
                o.id === orderId
                    ? { ...o, commercial_status: "approved", fulfillment_status: "allocated" }
                    : o
            ));
            return { ok: true };
        }

        // ── approved/allocated → shipped: deduct on_hand, release reserved, Paraşüt sync ──
        if (transition === "shipped" && prevFulfillment === "allocated") {
            setProducts(prev => prev.map(p => {
                const line = order.lines.find(l => l.productId === p.id);
                if (!line) return p;
                return {
                    ...p,
                    on_hand: Math.max(0, p.on_hand - line.quantity),
                    reserved: Math.max(0, p.reserved - line.quantity),
                    // available_now stays the same: was already subtracted on reservation
                };
            }));

            // Update status immediately so UI doesn't freeze
            setOrderDetails(prev => prev.map(o =>
                o.id === orderId ? { ...o, fulfillment_status: "shipped" } : o
            ));
            setOrders(prev => prev.map(o =>
                o.id === orderId ? { ...o, fulfillment_status: "shipped" } : o
            ));

            // Paraşüt async sync
            const payload = mapOrderToInvoice({ ...order, fulfillment_status: "shipped" });
            const syncResult = await sendInvoiceToParasut(payload);

            if (syncResult.success) {
                setOrderDetails(prev => prev.map(o =>
                    o.id === orderId
                        ? { ...o, parasutInvoiceId: syncResult.invoiceId, parasutSentAt: syncResult.sentAt, parasutError: undefined }
                        : o
                ));
            } else {
                setOrderDetails(prev => prev.map(o =>
                    o.id === orderId ? { ...o, parasutError: syncResult.error } : o
                ));
            }

            return { ok: true, parasutSync: syncResult };
        }

        // ── cancelled: release reserved stock only if was allocated ──
        if (transition === "cancelled") {
            if (prevFulfillment === "allocated" || prevFulfillment === "partially_allocated") {
                releaseStock(order.lines);
            }
            // draft and pending_approval orders were never reserved — no stock change

            setTimeout(() => {
                setOrderDetails(prev => prev.map(o =>
                    o.id === orderId ? { ...o, commercial_status: "cancelled", fulfillment_status: "unallocated" } : o
                ));
                setOrders(prev => prev.map(o =>
                    o.id === orderId ? { ...o, commercial_status: "cancelled", fulfillment_status: "unallocated" } : o
                ));
            }, 600);
            return { ok: true };
        }

        // ── draft → pending_approval: just update commercial status, no stock change ──
        if (transition === "pending_approval") {
            setTimeout(() => {
                setOrderDetails(prev => prev.map(o =>
                    o.id === orderId ? { ...o, commercial_status: "pending_approval" } : o
                ));
                setOrders(prev => prev.map(o =>
                    o.id === orderId ? { ...o, commercial_status: "pending_approval" } : o
                ));
            }, 600);
            return { ok: true };
        }

        return { ok: false };
    };

    // --- Reorder suggestions ---
    const reorderSuggestions = useMemo(
        () => products.filter(p => p.isActive && p.available_now < p.minStockLevel),
        [products],
    );

    return (
        <DataContext.Provider value={{
            customers, products, orders, orderDetails, uretimKayitlari,
            addImportedData, importedCount,
            addCustomer, updateCustomer,
            addProduct,
            addUretimKaydi, deleteUretimKaydi,
            addOrder, updateOrderStatus,
            reorderSuggestions,
        }}>
            {children}
        </DataContext.Provider>
    );
}

export function useData(): DataContextValue {
    const ctx = useContext(DataContext);
    if (!ctx) throw new Error("useData must be used within DataProvider");
    return ctx;
}
