"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import { mockCustomers, mockProducts, mockOrders, mockUretimKayitlari, mockOrderDetails } from "./mock-data";
import type { Customer, Product, Order, OrderDetail, OrderLineItem, UretimKaydi } from "./mock-data";
import { mapOrderToInvoice, sendInvoiceToParasut } from "./parasut";
import type { ParasutSyncResult } from "./parasut";

type OrderStatus = "DRAFT" | "PENDING" | "APPROVED" | "SHIPPED" | "CANCELLED";

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
    addUretimKaydi: (k: Omit<UretimKaydi, "id">) => void;
    deleteUretimKaydi: (id: string) => void;
    addOrder: (detail: Omit<OrderDetail, "id" | "orderNumber" | "itemCount">) => string;
    updateOrderStatus: (orderId: string, newStatus: OrderStatus) => Promise<UpdateStatusResult>;
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

    // --- Üretim ---
    const addUretimKaydi = (k: Omit<UretimKaydi, "id">) => {
        const newK: UretimKaydi = { ...k, id: `uret-${Date.now()}` };
        setUretimKayitlari(prev => [newK, ...prev]);
        setProducts(prev => prev.map(p => {
            if (p.id !== k.productId) return p;
            return {
                ...p,
                totalStock: p.totalStock + k.adet,
                availableStock: p.availableStock + k.adet,
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
                totalStock: Math.max(0, p.totalStock - kaydi.adet),
                availableStock: Math.max(0, p.availableStock - kaydi.adet),
            };
        }));
    };

    // --- Stock helpers ---
    const reserveStock = (lines: OrderLineItem[]) => {
        setProducts(prev => prev.map(p => {
            const line = lines.find(l => l.productId === p.id);
            if (!line) return p;
            return {
                ...p,
                allocatedStock: p.allocatedStock + line.quantity,
                availableStock: Math.max(0, p.availableStock - line.quantity),
            };
        }));
    };

    const releaseStock = (lines: OrderLineItem[]) => {
        setProducts(prev => prev.map(p => {
            const line = lines.find(l => l.productId === p.id);
            if (!line) return p;
            return {
                ...p,
                allocatedStock: Math.max(0, p.allocatedStock - line.quantity),
                availableStock: p.availableStock + line.quantity,
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
            status: detail.status,
            grandTotal: detail.grandTotal,
            currency: detail.currency,
            createdAt: detail.createdAt,
            itemCount,
        };
        setOrders(prev => [newOrder, ...prev]);

        if (detail.status === "PENDING" || detail.status === "DRAFT") {
            reserveStock(detail.lines);
        }

        return id;
    };

    const updateOrderStatus = async (orderId: string, newStatus: OrderStatus): Promise<UpdateStatusResult> => {
        const order = orderDetails.find(o => o.id === orderId);
        if (!order) return { ok: false };
        const prevStatus = order.status;

        // PENDING → APPROVED: conflict check
        if (newStatus === "APPROVED") {
            const conflicts: ConflictItem[] = [];
            for (const line of order.lines) {
                const product = products.find(p => p.id === line.productId);
                if (!product) continue;
                // This order is already allocated. Check if totalStock covers all allocations.
                const availableForThis = product.totalStock - (product.allocatedStock - line.quantity);
                if (availableForThis < line.quantity) {
                    conflicts.push({
                        productName: line.productName,
                        requested: line.quantity,
                        available: Math.max(0, availableForThis),
                    });
                }
            }
            if (conflicts.length > 0) return { ok: false, conflicts };
        }

        // DRAFT → PENDING: already reserved at creation, no action needed

        // CANCELLED: release stock if was DRAFT, PENDING or APPROVED
        if (newStatus === "CANCELLED" && (prevStatus === "DRAFT" || prevStatus === "PENDING" || prevStatus === "APPROVED")) {
            releaseStock(order.lines);
        }

        // SHIPPED: stok düş + Paraşüt'e otomatik fatura gönder
        if (newStatus === "SHIPPED" && prevStatus === "APPROVED") {
            setProducts(prev => prev.map(p => {
                const line = order.lines.find(l => l.productId === p.id);
                if (!line) return p;
                return {
                    ...p,
                    totalStock: Math.max(0, p.totalStock - line.quantity),
                    allocatedStock: Math.max(0, p.allocatedStock - line.quantity),
                };
            }));

            // Durumu hemen güncelle — UI donmasın
            setOrderDetails(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));

            // Paraşüt'e async gönder
            const payload = mapOrderToInvoice({ ...order, status: newStatus });
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

        // Diğer geçişler: sadece durumu güncelle
        setOrderDetails(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
        return { ok: true };
    };

    return (
        <DataContext.Provider value={{
            customers, products, orders, orderDetails, uretimKayitlari,
            addImportedData, importedCount,
            addCustomer, updateCustomer,
            addUretimKaydi, deleteUretimKaydi,
            addOrder, updateOrderStatus,
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
